/* rewards-sync.js — Phase 4 central reward layer.
 *
 * Single home for every coin-earning event (amounts in REWARD_EVENTS), every
 * valued purchase/gift/unlock/streak/box-opening, offline queueing and
 * server reconciliation.
 *
 * Trust model:
 *  - Guests (or no backend): pure-local behavior, exactly like Phases 1–3.
 *  - Signed-in + backend: the Supabase sf_* RPCs are authoritative. The UI
 *    updates optimistically for speed, then reconciles state.coins to the
 *    server balance. Any failure refunds the optimistic change and shows an
 *    honest error — never "Purchase successful" when the DB said no.
 *  - Every valued event carries a unique ref/idempotency key, so retries,
 *    double-clicks, refreshes and offline replays can never double-award.
 */

import { state, save, persist, refreshCoinDisplays, addCoins } from "../core.js";
import { backendConfigured } from "./backend.js";
import {
  awardCoinsRpc,
  purchaseRewardRpc,
  purchaseDealRpc,
  consumeRewardRpc,
  giftRewardRpc,
  unlockAchievementRpc,
  recordStreakDayRpc,
  openMysteryBoxRpc,
  fetchBalance,
  loadCoinTransactions,
  loadPurchaseHistory,
  loadInventory,
  loadUserAchievements,
  loadStreak,
  loadBoxOpenings,
  loadRewardCatalog,
  loadDailyDeals,
  loadAchievementDefs,
  friendlyRewardError,
} from "./backend.js";

// --- central reward amounts (the ONLY place earn values are defined) --------
export const REWARD_EVENTS = {
  focus_complete_base: 10, // + streak bonus (2/day, computed at earn time)
  task_complete: 3,
  technique_first_use: 5,
  checkin_base: 5, // + min(streak, 10)
};

export const newRef = (prefix) =>
  `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;

export const cloudRewards = () => backendConfigured && Boolean(state.user);

// Last authoritative balance seen (mirrored to localStorage for boot).
let serverCoins = Number(localStorage.getItem("sf-balance") || 0) || 0;
export const getServerCoins = () => serverCoins;

function setCoins(n) {
  state.coins = Math.max(0, Math.round(Number(n) || 0));
  persist();
  refreshCoinDisplays();
}

// --- offline outbox (earn events only — spends/boxes need the server) -------
const OUTBOX_KEY = "sf-reward-outbox";
const loadOutbox = () => {
  try {
    const v = JSON.parse(localStorage.getItem(OUTBOX_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const saveOutbox = (list) => save(OUTBOX_KEY, list);

export function queueRewardEvent(event) {
  const list = loadOutbox();
  if (!list.some((e) => e.refKey === event.refKey)) {
    list.push(event);
    saveOutbox(list);
  }
}

export async function flushRewardOutbox() {
  if (!cloudRewards() || navigator.onLine === false) return;
  const list = loadOutbox();
  if (!list.length) return;
  for (const event of list) {
    const res = await awardCoinsRpc(event.amount, event.reason, event.refKey, event.metadata || {});
    if (res.error) {
      // Offline/network error: stop and retry later. Any other error means
      // the event itself is invalid — drop it so the queue can't jam.
      const msg = String(res.error?.message || "");
      if (/failed to fetch|networkerror|network request failed|load failed|NOT_SIGNED_IN/i.test(msg)) return;
      // The server rejected the event itself (never applied): drop it and
      // roll back its optimistic coins so the display stays honest.
      saveOutbox(loadOutbox().filter((e) => e.refKey !== event.refKey));
      setCoins((state.coins || 0) - (Number(event.amount) || 0));
      continue;
    }
    saveOutbox(loadOutbox().filter((e) => e.refKey !== event.refKey));
    if (res.data && Number.isFinite(+res.data.balance)) {
      serverCoins = res.data.balance;
      save("sf-balance", serverCoins);
      displayBalance(serverCoins);
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushRewardOutbox().catch(() => {});
    pullRewards().catch(() => {});
  });
}

// --- earning ----------------------------------------------------------------
// Optimistic display update + authoritative RPC (or queued offline). On
// failure the optimistic coins are rolled back.
export async function secureEarn({ amount, reason, refKey, metadata = {} }) {
  const n = Math.max(1, Math.min(500, Math.floor(Number(amount) || 0)));
  const key = String(refKey || newRef("earn")).slice(0, 128);
  if (!cloudRewards()) {
    addCoins(n);
    return { ok: true, local: true, balance: state.coins, duplicate: false };
  }
  if (navigator.onLine === false) {
    // Deterministic offline path: queue immediately without attempting a
    // fetch whose failure wording varies by engine.
    queueRewardEvent({ amount: n, reason, refKey: key, metadata });
    setCoins((state.coins || 0) + n); // optimistic; replay is idempotent
    return { ok: true, queued: true, balance: state.coins, duplicate: false };
  }
  setCoins((state.coins || 0) + n); // instant UI
  const res = await awardCoinsRpc(n, reason, key, metadata);
  if (res.error) {
    const offline = isOfflineError(res.error);
    if (offline) {
      // Stay optimistic locally; the outbox replays the same refKey later —
      // the UNIQUE(user_id, ref_key) constraint makes the replay safe.
      queueRewardEvent({ amount: n, reason, refKey: key, metadata });
      return { ok: true, queued: true, balance: state.coins, duplicate: false };
    }
    setCoins((state.coins || 0) - n); // refund
    return { ok: false, error: friendlyRewardError(res.error), balance: state.coins };
  }
  serverCoins = res.data.balance;
  save("sf-balance", serverCoins);
  displayBalance(serverCoins);
  return { ok: true, balance: state.coins, duplicate: Boolean(res.data.duplicate) };
}

function isOfflineError(err) {
  // Transport failures surface with many wordings: Chrome "Failed to fetch",
  // Safari "Load failed", Firefox "NetworkError", undici/Node/proxies
  // "fetch failed", plus ECONN*/DNS/socket errors. Anything matching means
  // the request never got a usable server answer — the authoritative
  // condition (a completed RPC) is NOT met.
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|timeout|aborterror|econnrefused|econnreset|enotfound|eai_again|socket hang up|network timeout|dns|net::/i.test(
    String(err?.message || err || ""),
  );
}

// Spending operations must NEVER imply a queued completion: if the RPC did
// not succeed, nothing happened — no debit, no item, no retry later.
const SPEND_OFFLINE_MSG = "You are offline. Reconnect to the internet to make purchases.";
const USE_OFFLINE_MSG = "You are offline. Reconnect to use or sell items.";

function pendingSum() {
  try {
    return loadOutbox().reduce((a, e) => a + (Number(e.amount) || 0), 0);
  } catch {
    return 0;
  }
}

// Displayed coins = authoritative server balance + optimistic offline earns
// still waiting in the outbox. Never the reverse: local arithmetic alone
// must not move the number for signed-in members.
function displayBalance(serverBal) {
  setCoins((Number(serverBal) || 0) + pendingSum());
}

// --- spending (purchases & gifts at the authoritative catalog price) ---------
// HARD RULE: local coins, inventory and purchase records change ONLY after a
// successful RPC. No optimistic deduction (a failed transport must leave
// zero trace: no stuck estimate, no refund logic, no reliance on
// navigator.onLine correctness). Spends are never queued.
export async function securePurchase({ rewardId, qty = 1, fallbackPrice = 0 }) {
  const q = Math.max(1, Math.min(99, Math.floor(Number(qty) || 1)));
  const key = newRef("buy");
  if (!cloudRewards()) {
    return { ok: true, local: true, key, qty: q, unitPrice: fallbackPrice, total: fallbackPrice * q };
  }
  if (navigator.onLine === false)
    return { ok: false, error: SPEND_OFFLINE_MSG, balance: state.coins };
  const res = await purchaseRewardRpc(rewardId, q, key);
  if (res.error) {
    // Reconcile the display to server truth (best effort); local state was
    // never touched, so there is nothing to roll back.
    await refreshBalance();
    const offline = isOfflineError(res.error);
    return { ok: false, error: offline ? SPEND_OFFLINE_MSG : friendlyRewardError(res.error), balance: state.coins };
  }
  serverCoins = res.data.balance;
  save("sf-balance", serverCoins);
  displayBalance(serverCoins);
  return { ok: true, key, purchaseId: res.data.purchase_id, total: res.data.total, balance: serverCoins, duplicate: Boolean(res.data.duplicate) };
}

export async function secureGift({ rewardId, qty = 1, recipientId, fallbackPrice = 0 }) {
  const q = Math.max(1, Math.min(99, Math.floor(Number(qty) || 1)));
  const key = newRef("gift");
  if (!cloudRewards()) {
    return { ok: true, local: true, key, qty: q, unitPrice: fallbackPrice, total: fallbackPrice * q };
  }
  if (navigator.onLine === false)
    return { ok: false, error: SPEND_OFFLINE_MSG, balance: state.coins };
  const res = await giftRewardRpc(rewardId, q, recipientId, key);
  if (res.error) {
    await refreshBalance();
    const offline = isOfflineError(res.error);
    return { ok: false, error: offline ? SPEND_OFFLINE_MSG : friendlyRewardError(res.error), balance: state.coins };
  }
  serverCoins = res.data.balance;
  save("sf-balance", serverCoins);
  displayBalance(serverCoins);
  return { ok: true, key, purchaseId: res.data.purchase_id, total: res.data.total, balance: serverCoins, duplicate: Boolean(res.data.duplicate) };
}

// Daily-deal purchase at the server-computed deal price (single quantity;
// deals are one-per-day perks, not bulk goods).
export async function secureDeal({ rewardId, fallbackPrice = 0 }) {
  const key = newRef("deal");
  if (!cloudRewards()) {
    return { ok: true, local: true, key, qty: 1, unitPrice: fallbackPrice, total: fallbackPrice };
  }
  if (navigator.onLine === false)
    return { ok: false, error: SPEND_OFFLINE_MSG, balance: state.coins };
  const res = await purchaseDealRpc(rewardId, key);
  if (res.error) {
    await refreshBalance();
    const offline = isOfflineError(res.error);
    return { ok: false, error: offline ? SPEND_OFFLINE_MSG : friendlyRewardError(res.error), balance: state.coins };
  }
  serverCoins = res.data.balance;
  save("sf-balance", serverCoins);
  displayBalance(serverCoins);
  return { ok: true, key, purchaseId: res.data.purchase_id, total: res.data.total, balance: serverCoins, duplicate: Boolean(res.data.duplicate) };
}

// Consume owned inventory (activate a boost) or sell back at the
// server-derived 60% catalog credit. Ledger-first server-side: retries with
// the same key can never consume or credit twice.
export async function secureConsume({ rewardId, qty = 1, sellBack = false }) {
  const key = newRef("use");
  if (!cloudRewards()) return { ok: true, local: true, key };
  if (navigator.onLine === false)
    return { ok: false, error: USE_OFFLINE_MSG, balance: state.coins };
  const res = await consumeRewardRpc(rewardId, qty, sellBack, sellBack ? key : null);
  if (res.error) {
    await refreshBalance();
    const offline = isOfflineError(res.error);
    return { ok: false, error: offline ? (sellBack ? SPEND_OFFLINE_MSG : USE_OFFLINE_MSG) : friendlyRewardError(res.error), balance: state.coins };
  }
  if (!res.data.duplicate && (res.data.credited || 0) > 0) {
    serverCoins = res.data.balance;
    save("sf-balance", serverCoins);
    displayBalance(serverCoins);
  }
  return { ok: true, key, balance: res.data.balance, credited: res.data.credited || 0, duplicate: Boolean(res.data.duplicate) };
}

// Today's server deals, cached for the UTC day.
let dealsCache = null;
export async function getDailyDeals() {
  if (!cloudRewards()) return null;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = JSON.parse(localStorage.getItem("sf-deals") || "null");
    if (cached && cached.day === today && Array.isArray(cached.deals)) {
      dealsCache = cached.deals;
      return dealsCache;
    }
  } catch {
    /* refetch */
  }
  const res = await loadDailyDeals();
  if (res.error) return dealsCache;
  dealsCache = res.data || [];
  try {
    save("sf-deals", { day: today, deals: dealsCache });
  } catch {
    /* cache is best-effort */
  }
  return dealsCache;
}

// --- achievements ------------------------------------------------------------
export async function secureUnlock(achievementId) {
  if (!cloudRewards()) return { ok: true, local: true, unlocked: true, reward: 0 };
  const res = await unlockAchievementRpc(achievementId, `unlock:${achievementId}`);
  if (res.error) return { ok: false, error: friendlyRewardError(res.error) };
  if (!res.data.duplicate) {
    serverCoins = res.data.balance;
    save("sf-balance", serverCoins);
    displayBalance(serverCoins);
  }
  return { ok: true, unlocked: res.data.unlocked, reward: res.data.reward, balance: res.data.balance, duplicate: res.data.duplicate };
}

// --- streaks -----------------------------------------------------------------
export async function secureStreak(refKey) {
  if (!cloudRewards()) return { ok: true, local: true };
  const res = await recordStreakDayRpc(refKey, null);
  if (res.error) return { ok: false, error: friendlyRewardError(res.error) };
  serverCoins = res.data.balance;
  save("sf-balance", serverCoins);
  displayBalance(serverCoins);
  try {
    // The server just recorded TODAY, so a successful call can never mean a
    // zero streak. Guard the mirror against a malformed payload (missing /
    // non-numeric `current`) — writing undefined here used to wipe the local
    // count back to a displayed 0 right after a completed session.
    const served = Number(res?.data?.current);
    const localCount = Number(state.streak?.count);
    state.streak = {
      count: Number.isFinite(served) && served >= 1
        ? served
        : Math.max(1, Number.isFinite(localCount) ? localCount : 0),
      lastDate: state.streak?.lastDate || "",
      days: Array.isArray(state.streak?.days) ? state.streak.days : [],
    };
    if (res.data.longest > (state.bestStreak || 0)) state.bestStreak = res.data.longest;
    save("sf-streak", state.streak);
    save("sf-best-streak", state.bestStreak || 0);
    persist();
  } catch {
    /* local mirror is best-effort */
  }
  return { ok: true, current: res.data.current, longest: res.data.longest, advanced: res.data.advanced, bonus: res.data.bonus, balance: serverCoins };
}

// --- mystery boxes (server rolls, client only reveals) -----------------------
export async function secureOpenBox(boxType) {
  const key = newRef("box");
  if (!cloudRewards()) return { ok: true, local: true, key };
  if (navigator.onLine === false)
    return { ok: false, error: SPEND_OFFLINE_MSG, balance: state.coins };
  const res = await openMysteryBoxRpc(boxType, key);
  if (res.error) {
    await refreshBalance();
    const offline = isOfflineError(res.error);
    return { ok: false, error: offline ? SPEND_OFFLINE_MSG : friendlyRewardError(res.error), balance: state.coins };
  }
  serverCoins = res.data.balance;
  save("sf-balance", serverCoins);
  displayBalance(serverCoins);
  return {
    ok: true,
    key,
    rarity: res.data.rarity,
    kind: res.data.kind,
    rewardId: res.data.reward_id,
    amount: res.data.amount,
    balance: serverCoins,
    duplicate: Boolean(res.data.duplicate),
  };
}

// --- reads / reconcile -------------------------------------------------------
export async function refreshBalance() {
  if (!cloudRewards()) return { ok: false };
  const res = await fetchBalance();
  if (res.error) return { ok: false, error: res.error };
  serverCoins = Number(res.data) || 0;
  save("sf-balance", serverCoins);
  displayBalance(serverCoins);
  return { ok: true, balance: serverCoins };
}

// Pull every Phase 4 dataset and reconcile local state with the server.
// Server wins for coins; local collections merge with cloud inventory.
export async function pullRewards() {
  if (!cloudRewards()) return { ok: false, offline: true };
  const [bal, tx, purch, inv, ach, streak, boxes] = await Promise.all([
    fetchBalance(),
    loadCoinTransactions(),
    loadPurchaseHistory(),
    loadInventory(),
    loadUserAchievements(),
    loadStreak(),
    loadBoxOpenings(),
  ]);
  if (!bal.error && Number.isFinite(+bal.data)) {
    serverCoins = Number(bal.data);
    save("sf-balance", serverCoins);
    // Server wins; optimistic offline earns stay visible on top until the
    // outbox flush below reconciles them.
    displayBalance(serverCoins);
  }
  const cache = (k, v) => {
    try {
      save(k, v);
    } catch {
      /* cache is best-effort */
    }
  };
  if (!tx.error) cache("sf-ledger", (tx.data || []).slice(0, 100));
  if (!purch.error) cache("sf-purchases-cloud", (purch.data || []).slice(0, 100));
  if (!inv.error) cache("sf-inventory-cloud", inv.data || []);
  if (!ach.error) {
    cache("sf-ach-cloud", ach.data || []);
    const ids = (ach.data || []).map((r) => r.achievement_id);
    let touched = false;
    ids.forEach((id) => {
      if (!(state.achievements || []).includes(id)) {
        state.achievements = [...(state.achievements || []), id];
        touched = true;
      }
    });
    if (touched) persist();
  }
  if (!streak.error && streak.data) cache("sf-streak-cloud", streak.data);
  if (!boxes.error) cache("sf-boxlog", (boxes.data || []).slice(0, 60));
  await flushRewardOutbox();
  return { ok: true };
}

export function cachedLedger() {
  try {
    const v = JSON.parse(localStorage.getItem("sf-ledger"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export { loadRewardCatalog, loadAchievementDefs };
