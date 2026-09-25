/* store.js — reward store, mystery boxes, gifts, inventory, purchases */
import {
  state,
  $,
  $$,
  uid,
  get,
  save,
  esc,
  sicon,
  persist,
  pushUserSettings,
  notify,
  confirmBox,
  viewHead,
  requireAuth,
  spendCoins,
  addCoins,
  addNotification,
  dayKey,
  applyEquippedTheme,
  celebrate,
  confettiBurst,
  refreshServerTime,
  serverDayKey,
  serverNow,
  paintBackendPill,
  registerBackendPillResolver,
  backendPillMarkup,
  scheduleCloudSync,
} from "./core.js"
import {
  backendConfigured,
  searchUsers,
  sendCloudMessage,
  sendGiftNotification,
  loadInventory,
  loadDailyDeals,
} from "./services/backend.js"
import { SOUND_EQUIP, startLayer, stopLayer, playChime } from "./audio.js"
import { shell } from "./app.js"
import {
  secureEarn,
  securePurchase,
  secureDeal,
  secureGift,
  secureConsume,
  secureOpenBox,
  cloudRewards,
  getDailyDeals,
  pullRewards,
  refreshBalance,
  cachedLedger,
  REWARD_EVENTS,
} from "./services/rewards-sync.js"
const storeItems = [
  [
    "focus-flame",
    "Focus Flame theme",
    "Themes",
    sicon("fire"),
    35,
    "A warm, energising workspace skin.",
  ],
  [
    "ocean-mist",
    "Ocean Mist theme",
    "Themes",
    sicon("wave"),
    40,
    "A calm blue study atmosphere.",
  ],
  [
    "forest-glow",
    "Forest Glow theme",
    "Themes",
    sicon("tree"),
    40,
    "A fresh green workspace look.",
  ],
  [
    "midnight",
    "Midnight theme",
    "Themes",
    sicon("moon"),
    50,
    "Deep contrast for night sessions.",
  ],
  [
    "sunrise",
    "Sunrise theme",
    "Themes",
    sicon("sunrise"),
    45,
    "Bright energy for early starts.",
  ],
  [
    "lavender",
    "Lavender theme",
    "Themes",
    sicon("heart"),
    45,
    "Soft colour for gentle focus.",
  ],
  [
    "cafe",
    "Study Cafe theme",
    "Themes",
    sicon("coffee"),
    55,
    "A cosy cafe-inspired skin.",
  ],
  [
    "paper",
    "Paper Notes theme",
    "Themes",
    sicon("doc"),
    60,
    "A clean notebook aesthetic.",
  ],
  [
    "neon",
    "Neon Lab theme",
    "Themes",
    sicon("bolt"),
    75,
    "Electric colour for power sessions.",
  ],
  [
    "solar",
    "Solar Gold theme",
    "Themes",
    sicon("sun"),
    90,
    "A premium golden workspace.",
  ],
  [
    "rain-pack",
    "Rain on Glass",
    "Sounds",
    sicon("rain"),
    25,
    "Steady rain for deep work.",
  ],
  [
    "library",
    "Quiet Library",
    "Sounds",
    sicon("book"),
    30,
    "Soft room tone and turning pages.",
  ],
  [
    "campfire",
    "Study Campfire",
    "Sounds",
    sicon("fire"),
    30,
    "Crackling warmth without lyrics.",
  ],
  [
    "lofi",
    "Lo-fi Focus Pack",
    "Sounds",
    sicon("headphones"),
    45,
    "A mellow instrumental session.",
  ],
  [
    "piano",
    "Midnight Piano",
    "Sounds",
    sicon("music"),
    45,
    "Minimal piano for concentration.",
  ],
  [
    "forest-pack",
    "Forest Ambience",
    "Sounds",
    sicon("leaf"),
    25,
    "Wind and distant birds.",
  ],
  [
    "brown-pack",
    "Brown Noise",
    "Sounds",
    sicon("noise"),
    20,
    "Low, even concentration noise.",
  ],
  [
    "ocean-pack",
    "Ocean Waves",
    "Sounds",
    sicon("wave"),
    25,
    "Slow waves for relaxed study.",
  ],
  [
    "space",
    "Deep Space",
    "Sounds",
    sicon("planet"),
    35,
    "A spacious ambient soundscape.",
  ],
  [
    "thunder",
    "Distant Thunder",
    "Sounds",
    sicon("storm"),
    30,
    "Rainy-day focus atmosphere.",
  ],
  [
    "shield",
    "Streak Shield",
    "Boosts",
    sicon("shield"),
    80,
    "Protect one missed study day.",
  ],
  [
    "multiplier",
    "Coin Multiplier",
    "Boosts",
    sicon("sparkle"),
    120,
    "Earn 25% more coins for one day.",
  ],
  [
    "extra-break",
    "Extra Break",
    "Boosts",
    sicon("coffee"),
    35,
    "Unlock one restorative break.",
  ],
  [
    "sprint",
    "Focus Sprint",
    "Boosts",
    sicon("run"),
    60,
    "Add a bonus ten-minute sprint.",
  ],
  [
    "double",
    "Double Dip",
    "Boosts",
    sicon("target"),
    150,
    "Double one session reward.",
  ],
  [
    "quick",
    "Quick Start Pass",
    "Boosts",
    sicon("rocket"),
    50,
    "Skip one setup step.",
  ],
  [
    "calm",
    "Calm Mode",
    "Boosts",
    sicon("lotus"),
    70,
    "Hide distractions for one session.",
  ],
  [
    "exam",
    "Exam Week Pack",
    "Boosts",
    sicon("bookOpen"),
    180,
    "A bundle of three study boosts.",
  ],
  [
    "priority",
    "Priority Queue",
    "Boosts",
    sicon("trophy"),
    100,
    "Pin your most important task.",
  ],
  [
    "lucky",
    "Lucky Hour",
    "Boosts",
    sicon("leaf"),
    90,
    "A one-hour bonus earning window.",
  ],
  [
    "legend",
    "Focus Legend badge",
    "Badges",
    sicon("medal"),
    100,
    "Show your consistency proudly.",
  ],
  [
    "owl-badge",
    "Night Owl badge",
    "Badges",
    sicon("owl"),
    80,
    "For late-night learning sessions.",
  ],
  [
    "bird-badge",
    "Early Bird badge",
    "Badges",
    sicon("bird"),
    80,
    "For morning study champions.",
  ],
  [
    "bookworm",
    "Bookworm badge",
    "Badges",
    sicon("bug"),
    120,
    "A badge for curious minds.",
  ],
  [
    "seven",
    "Seven Day badge",
    "Badges",
    sicon("seven"),
    140,
    "Celebrate a full week streak.",
  ],
  [
    "deep",
    "Deep Work badge",
    "Badges",
    sicon("brain"),
    160,
    "For serious uninterrupted focus.",
  ],
  [
    "team",
    "Team Player badge",
    "Badges",
    sicon("users"),
    100,
    "Celebrate learning with friends.",
  ],
  [
    "first",
    "First Place badge",
    "Badges",
    sicon("medal"),
    220,
    "A rare achievement badge.",
  ],
  [
    "spark",
    "Spark badge",
    "Badges",
    sicon("sparkle"),
    60,
    "A bright profile detail.",
  ],
  [
    "creator",
    "Creator badge",
    "Badges",
    sicon("palette"),
    130,
    "For people who share knowledge.",
  ],
  [
    "fox",
    "Clever Fox avatar",
    "Avatars",
    sicon("fox"),
    75,
    "A sharp profile companion.",
  ],
  [
    "cat",
    "Study Cat avatar",
    "Avatars",
    sicon("cat"),
    75,
    "A cosy study companion.",
  ],
  [
    "owl",
    "Wise Owl avatar",
    "Avatars",
    sicon("owl"),
    100,
    "A thoughtful profile identity.",
  ],
  [
    "rocket",
    "Rocket avatar",
    "Avatars",
    sicon("rocket"),
    110,
    "Launch your next study goal.",
  ],
  [
    "planet",
    "Planet avatar",
    "Avatars",
    sicon("planet"),
    110,
    "Explore your learning orbit.",
  ],
  [
    "bolt",
    "Lightning avatar",
    "Avatars",
    sicon("bolt"),
    95,
    "Fast, bright, and focused.",
  ],
  [
    "lotus",
    "Lotus avatar",
    "Avatars",
    sicon("lotus"),
    90,
    "A calm profile identity.",
  ],
  [
    "crown",
    "Scholar Crown avatar",
    "Avatars",
    sicon("crown"),
    250,
    "The ultimate scholar look.",
  ],
  [
    "mountain",
    "Mountain avatar",
    "Avatars",
    sicon("mountain"),
    130,
    "Climb every learning challenge.",
  ],
  [
    "star",
    "North Star avatar",
    "Avatars",
    sicon("star"),
    150,
    "Keep your goals in sight.",
  ],
  [
    "pumpkin",
    "Spooky Pumpkin avatar",
    "Avatars",
    sicon("pumpkin"),
    100,
    "A limited Halloween companion.",
    { f: [10, 25], t: [10, 31] },
  ],
  [
    "ghost",
    "Haunted badge",
    "Badges",
    sicon("ghost"),
    120,
    "A limited Halloween spirit.",
    { f: [10, 25], t: [10, 31] },
  ],
  [
    "fireworks",
    "New Year badge",
    "Badges",
    sicon("party"),
    120,
    "Limited New Year sparkle.",
    { f: [12, 28], t: [1, 3] },
  ],
  [
    "survivor",
    "Exam Survivor badge",
    "Badges",
    sicon("medal"),
    150,
    "Limited exam-season honor.",
    { f: [5, 1], t: [5, 31] },
  ],
].map(([id, name, category, emoji, price, description, season]) => ({
  id,
  name,
  category,
  emoji,
  price,
  description,
  season: season || null,
}))

function freeBoxState() {
  if (!state.freeBox || typeof state.freeBox !== "object") state.freeBox = {}
  const fb = state.freeBox
  if (typeof fb.lastClaimDay !== "string") fb.lastClaimDay = ""
  if (!Array.isArray(fb.history)) fb.history = []
  if (fb.pending !== null && typeof fb.pending !== "object") fb.pending = null
  return fb
}
// Server truth for today's free box: the pullRewards box log (sf-boxlog)
// records every server-side opening. Local lastClaimDay covers the fresh
// claim; the log covers claims made on other devices/sessions that this
// device never saw. Either one means "claimed".
function serverFreeClaimedToday() {
  // Only for the signed-in account: the box log cache could otherwise leak
  // one account's claim into another's (or a guest's) view.
  if (!cloudRewards() || !state.user) return false
  try {
    const log = JSON.parse(localStorage.getItem("sf-boxlog") || "[]")
    if (!Array.isArray(log)) return false
    const today = serverDayKey()
    return log.some(
      (r) =>
        r &&
        r.box_type === "free-common" &&
        String(r.opened_day || "").slice(0, 10) === today,
    )
  } catch {
    return false
  }
}
function freeClaimedToday() {
  const fb = freeBoxState()
  if (fb.lastClaimDay === serverDayKey()) return true
  return serverFreeClaimedToday()
}

function equippedAvatarEmoji() {
  const owned = (state.owned || []).find(
    (o) => o && o.id === state.equipped?.avatar,
  )
  const item =
    (owned && owned.category === "Avatars" && owned) ||
    findStoreItem(state.equipped?.avatar)
  return item && item.category === "Avatars" ? item.emoji : ""
}

function equippedBadgeEmoji() {
  return equippedBadges()
    .map((item) => item.emoji)
    .join("")
}
// Showcased badge ids, newest first — UNLIMITED. Any number of owned badges
// can ride beside your name. Migrates the legacy single-string shape
// (`state.equipped.badge = "id"`) on read.
function showcasedBadgeIds() {
  const raw = state.equipped?.badges ?? state.equipped?.badge
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return [...new Set(list.filter((id) => typeof id === "string" && id))]
}
function equippedBadges() {
  // Resolve from the owned inventory first: shopItems() is season-filtered,
  // so out-of-season and box-exclusive badges would otherwise vanish from
  // the showcase the moment they leave the shop.
  const ownedById = new Map(
    (state.owned || []).filter((o) => o && o.id != null).map((o) => [o.id, o]),
  )
  return showcasedBadgeIds()
    .map((id) => ownedById.get(id) || findStoreItem(id))
    .filter((item) => item && item.category === "Badges")
}
// Every acquired badge, newest acquisition last (owned entries carry
// boughtAt; legacy entries without one sort stable).
function ownedBadges() {
  return (state.owned || [])
    .filter(
      (o) => o && !Array.isArray(o) && o.id != null && o.category === "Badges",
    )
    .slice()
    .sort((a, b) => (b.boughtAt || 0) - (a.boughtAt || 0))
}
function toggleShowcaseBadge(item) {
  if (!item || item.category !== "Badges") return "not-badge"
  if (
    !state.equipped ||
    typeof state.equipped !== "object" ||
    Array.isArray(state.equipped)
  )
    state.equipped = { theme: null, avatar: null, badges: [] }
  const ids = showcasedBadgeIds()
  if (ids.includes(item.id)) {
    state.equipped.badges = ids.filter((x) => x !== item.id)
  } else {
    state.equipped.badges = [...ids, item.id]
  }
  // Legacy single-badge key is retired on first toggle.
  if ("badge" in (state.equipped || {})) delete state.equipped.badge
  // Local persist + debounced cloud snapshot (equipped is in cloudSnapshot)
  // so the showcase survives sign-out and shows up on a fresh sign-in.
  persist()
  if (state.user) scheduleCloudSync()
  return ids.includes(item.id) ? "removed" : "added"
}

function checkinReward() {
  return 5 + Math.min(state.streak?.count || 0, 10)
}

function earnMarkup() {
  const claimed = state.checkin?.last === dayKey(new Date())
  const multActive = (state.boosts?.multiplierUntil || 0) > Date.now()
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>How to earn</h2><span class="tag" data-coin="earn">${sicon("coin")} ${state.coins}</span></div><div class="earn-grid"><div><strong>+10</strong><span>per focus session</span></div><div><strong>+2/day</strong><span>streak bonus</span></div><div><strong>${
    multActive ? "active" : "+25%"
  }</strong><span>coin multiplier${
    multActive
      ? " · ends " +
        new Date(state.boosts.multiplierUntil).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : ""
  }</span></div><div><strong>+${checkinReward()}</strong><span>daily check-in</span></div></div><button type="button" class="primary" data-checkin style="margin-top:12px"${
    claimed ? " disabled" : ""
  }>${
    claimed
      ? "Checked in " + sicon("check") + " — see you tomorrow"
      : `Check in (+${checkinReward()} coins)`
  }</button>${ledgerMarkup()}</div>`
}

function ledgerMarkup() {
  // Cloud members see their authoritative ledger; guests see local purchases.
  if (!cloudRewards()) return ""
  let rows = []
  try {
    rows = cachedLedger().slice(0, 8)
  } catch {
    rows = []
  }
  if (!rows.length)
    return `<details class="purchase-history"><summary>Coin history</summary><p class="muted">No coin activity yet — finish a focus session to earn.</p></details>`
  return `<details class="purchase-history"><summary>Coin history</summary>${rows
    .map((r) => {
      const earn = r.type === "earn"
      const when = r.created_at
        ? new Date(r.created_at).toLocaleDateString()
        : ""
      return `<div class="purchase-row"><span class="${
        earn ? "earn-pos" : "earn-neg"
      }">${
        earn ? "+" : "−"
      }${Math.abs(r.amount)} ${sicon("coin")}</span><span class="muted">${esc(r.reason || "")} · ${when}</span></div>`
    })
    .join("")}</details>`
}

async function claimCheckin() {
  const today = dayKey(new Date())
  if (state.checkin?.last === today) return notify("Already checked in today")
  const reward = checkinReward()
  state.checkin = { last: today }
  persist()
  // Idempotent: one ref per day — refresh/reconnect can never double-pay.
  try {
    const r = await secureEarn({
      amount: reward,
      reason: "Daily check-in",
      refKey: `checkin:${today}`,
    })
    if (r && !r.ok && r.error) {
      state.checkin = { last: "" }
      persist()
      notify(r.error)
      renderStore()
      return
    }
  } catch {
    // secureEarn only throws on unexpected internal failure — never mint
    // coins here. Reset so the user can retry cleanly.
    state.checkin = { last: "" }
    persist()
    notify("Check-in failed — please try again.")
    renderStore()
    return
  }
  notify(`Checked in · +${reward} coins`)
  renderStore()
}

/* ---------- real-money coin top-ups (Paystack · MoMo) ---------- */
// Paste your Paystack PUBLIC key here to accept mobile money. Get one free at
// dashboard.paystack.com → Settings → API Keys. With it empty, the packs show
// a setup note instead of charging anyone.
const PAYSTACK_PUBLIC_KEY = ""

const COIN_PACKS = [
  {
    id: "pack-10",
    coins: 10,
    price: 10,
    name: "Quick Sip",
    blurb: "A taste of momentum.",
  },
  {
    id: "pack-25",
    coins: 25,
    price: 25,
    name: "Study Stash",
    blurb: "Fuel for the week.",
  },
  {
    id: "pack-50",
    coins: 50,
    price: 50,
    name: "Scholar Vault",
    blurb: "For serious grinds.",
    tag: "Most popular",
  },
  {
    id: "pack-75",
    coins: 75,
    price: 75,
    name: "Deep Work Chest",
    blurb: "Lock in for the month.",
  },
  {
    id: "pack-100",
    coins: 100,
    price: 100,
    name: "Legend Vault",
    blurb: "The full treasure room.",
    tag: "Best value",
  },
]

function topupMarkup() {
  return `<div class="card topup-card" id="coin-packs" style="margin-bottom:18px"><div class="section-row"><h2>${sicon("coin")} Top up coins</h2><span class="tag">MoMo · GHS</span></div><p class="muted">Real money, real focus fuel — MTN, Telecel or AirtelTigo MoMo through Paystack. Approve the prompt on your phone and coins land instantly.</p><div class="pack-grid">${COIN_PACKS.map((p) => `<div class="pack${p.tag ? " featured" : ""}">${p.tag ? `<span class="pack-tag">${esc(p.tag)}</span>` : ""}<strong class="pack-coins">${sicon("coin")} ${p.coins}</strong><span class="pack-name">${esc(p.name)}</span><small class="muted">${esc(p.blurb)}</small><strong class="pack-price">GH₵ ${p.price}</strong><button type="button" class="primary" data-topup="${p.id}">Buy</button></div>`).join("")}</div>${
    PAYSTACK_PUBLIC_KEY
      ? ""
      : '<p class="muted setup-note">Seller setup: paste your Paystack public key into <b>PAYSTACK_PUBLIC_KEY</b> at the top of the store module and this section starts accepting MoMo.</p>'
  }</div>`
}

let paystackLoading = null
function loadPaystack() {
  if (window.PaystackPop) return Promise.resolve(true)
  if (!paystackLoading) {
    paystackLoading = new Promise((resolve) => {
      const s = document.createElement("script")
      s.src = "https://js.paystack.co/v1/inline.js"
      s.async = true
      s.onload = () => resolve(true)
      s.onerror = () => resolve(false)
      document.head.append(s)
      setTimeout(() => resolve(!!window.PaystackPop), 12000)
    })
  }
  return paystackLoading
}

function openTopup(packId) {
  const pack = COIN_PACKS.find((p) => p.id === packId)
  if (!pack) return
  if (!PAYSTACK_PUBLIC_KEY) {
    notify("MoMo checkout isn't set up yet — the seller key is missing")
    return
  }
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Top up · Mobile money</div><h2>${pack.coins} coins for GH₵ ${pack.price}</h2><p class="muted">Enter the email for your receipt, hit pay, then approve the MoMo prompt on your phone. Coins land the second Paystack confirms.</p><label class="field-label">Email for receipt<input class="input" data-topup-email type="email" value="${esc(state.profile.email || "")}" placeholder="you@example.com"></label><p class="st-confirm-err" data-topup-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-topup-cancel>Cancel</button><button type="button" class="primary" data-topup-pay>Pay GH₵ ${pack.price}</button></div></div>`
  $("#modal-root").append(modal)
  const err = modal.querySelector("[data-topup-err]")
  const payBtn = modal.querySelector("[data-topup-pay]")
  modal.querySelector("[data-topup-cancel]").onclick = () => modal.remove()
  modal.addEventListener("click", (e) => {
    if (e.target === modal && !payBtn.disabled) modal.remove()
  })
  payBtn.onclick = async () => {
    const email = modal.querySelector("[data-topup-email]").value.trim()
    if (!/.+@.+\..+/.test(email)) {
      err.textContent = "Enter a valid email for your receipt."
      err.hidden = false
      return
    }
    err.hidden = true
    payBtn.disabled = true
    payBtn.textContent = "Opening MoMo…"
    const ready = await loadPaystack()
    if (!window.PaystackPop || !ready) {
      err.textContent =
        "Could not reach Paystack — check your connection and try again."
      err.hidden = false
      payBtn.disabled = false
      payBtn.textContent = `Pay GH₵ ${pack.price}`
      return
    }
    const ref = `SF-${Date.now().toString(36).toUpperCase()}-${uid().toUpperCase()}`
    try {
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email,
        amount: Math.round(pack.price * 100),
        currency: "GHS",
        ref,
        channels: ["mobile_money", "card"],
        metadata: {
          coins: pack.coins,
          pack: pack.id,
          handle: state.profile.handle,
        },
        // Client-only checkout: the reference counts as success here. A
        // production setup should verify the reference server-side.
        callback: (res) => {
          creditTopup(pack, res.reference || ref)
          modal.remove()
        },
        onClose: () => {
          if (document.body.contains(payBtn)) {
            payBtn.disabled = false
            payBtn.textContent = `Pay GH₵ ${pack.price}`
          }
          notify("Payment window closed — no charge made")
        },
      })
      handler.openIframe()
    } catch {
      err.textContent = "Payment could not start — try again."
      err.hidden = false
      payBtn.disabled = false
      payBtn.textContent = `Pay GH₵ ${pack.price}`
    }
  }
}

async function creditTopup(pack, ref) {
  // Top-ups are real value: cloud members mint them through the ledger
  // (idempotent on the payment ref) instead of local arithmetic.
  try {
    const r = await secureEarn({
      amount: pack.coins,
      reason: "Coin top-up",
      refKey: `topup:${ref}`,
      metadata: { pack: pack.id },
    })
    if (r && !r.ok && r.error) {
      notify(r.error)
      return
    }
  } catch {
    // Never mint top-up coins on an unexpected failure — the payment ref
    // makes the earn safely retryable instead.
    notify("Top-up failed before coins landed — please try again.")
    return
  }
  addNotification(
    "Coins topped up",
    `+${pack.coins} coins via MoMo · GH₵ ${pack.price} · ref ${ref}.`,
    "coin",
  )
  celebrate(false)
  notify(`+${pack.coins} coins landed — enjoy the grind ${sicon("coin")}`)
  if (state.tab === "store") renderStore()
}

function removeOwnedById(id) {
  const idx = (state.owned || []).findIndex((o) => o && o.id === id)
  if (idx < 0) return null
  return removeOwnedAt(idx)
}

// Consume one owned unit, server-verified for cloud members. The effect only
// applies after the database confirms the user actually owned it.
let consumeBusy = false
async function consumeOne(rewardId, apply, opts = {}) {
  if (consumeBusy) return false
  consumeBusy = true
  try {
    return await consumeOneInner(rewardId, apply, opts)
  } finally {
    consumeBusy = false
  }
}

async function consumeOneInner(rewardId, apply, opts = {}) {
  if (!cloudRewards()) {
    const item = removeOwnedById(rewardId)
    if (!item) return false
    if (opts.sellBack) addCoins(Math.floor((item.price || 0) * 0.6))
    apply(item)
    return true
  }
  const res = await secureConsume({
    rewardId,
    qty: 1,
    sellBack: opts.sellBack === true,
  })
  if (!res.ok) {
    // Stale mirror (e.g. consumed on another device): drop it and resync.
    if (/don't own/i.test(res.error || "")) {
      removeOwnedById(rewardId)
      persist()
    }
    notify(res.error || "Couldn't use that right now.")
    renderStore()
    return false
  }
  removeOwnedById(rewardId)
  apply()
  return true
}

function removeOwnedAt(idx) {
  const item = state.owned[idx]
  if (!item) return null
  if (state.equipped?.theme === item.id) state.equipped.theme = null
  if (state.equipped?.avatar === item.id) state.equipped.avatar = null
  if (Array.isArray(state.equipped?.badges)) {
    state.equipped.badges = state.equipped.badges.filter((x) => x !== item.id)
  } else if (state.equipped?.badge === item.id) {
    state.equipped.badge = null
  }
  state.owned.splice(idx, 1)
  return item
}

function collectionRow(i, idx) {
  const sell = Math.floor(i.price * 0.6)
  const btn = "equip-btn"
  let action = `<span class="tag">keepsake</span>`
  if (i.category === "Themes") {
    const on = state.equipped?.theme === i.id
    action = `<button type="button" class="${
      on ? "ghost" : "primary"
    } ${btn}" data-equip-theme="${idx}">${
      on ? "Equipped " + sicon("check") : "Equip"
    }</button>`
  } else if (i.category === "Avatars") {
    const on = state.equipped?.avatar === i.id
    action = `<button type="button" class="${
      on ? "ghost" : "primary"
    } ${btn}" data-equip-avatar="${idx}">${
      on ? "Wearing " + sicon("check") : "Wear"
    }</button>`
  } else if (i.category === "Badges") {
    const ids = showcasedBadgeIds()
    const on = ids.includes(i.id)
    action = `<button type="button" class="${
      on ? "ghost" : "primary"
    } ${btn}" data-equip-badge="${idx}">${
      on ? "Showcased " + sicon("check") : "Showcase"
    }</button>`
  } else if (SOUND_EQUIP[i.id]) {
    const playing = state.soundMix[SOUND_EQUIP[i.id]] != null
    action = `<button type="button" class="${
      playing ? "ghost" : "primary"
    } ${btn}" data-equip-sound="${idx}">${
      playing ? "Playing " + sicon("check") : "Play"
    }</button>`
  } else if (i.id === "shield") {
    action = `<button type="button" class="primary ${btn}" data-activate-shield="${idx}">Activate${
      state.boosts?.shields || 0 ? ` (${state.boosts.shields} armed)` : ""
    }</button>`
  } else if (i.id === "multiplier") {
    const active = (state.boosts?.multiplierUntil || 0) > Date.now()
    action = `<button type="button" class="primary ${btn}" data-activate-multiplier="${idx}">${
      active ? "Extend +24h" : "Activate"
    }</button>`
  } else if (i.id === "double") {
    const armed = Boolean(state.boosts?.doubleArmed)
    action = `<button type="button" class="${
      armed ? "ghost" : "primary"
    } ${btn}" data-activate-double="${idx}"${armed ? " disabled" : ""}>${
      armed ? "Armed " + sicon("check") : "Activate"
    }</button>`
  }
  return `<div class="collection-row"><span class="collection-item">${i.emoji} <strong>${esc(i.name)}</strong></span><span class="collection-actions">${action}${
    i.unbuyable
      ? `<span class="tag" title="Earned badges can never be sold">earned · unsellable</span>`
      : `<button type="button" class="ghost ${btn}" data-sell-idx="${idx}" title="Sell for ${sell} coins">+${sell} ${sicon("coin")}</button>`
  }</span></div>`
}

function collectionMarkup() {
  const mine = (state.owned || [])
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !item.owner || item.owner === "me")
  if (!mine.length)
    return `<div class="card owned"><h2>Your collection</h2><p class="muted">Your collection is waiting for its first reward.</p></div>`
  return `<div class="card owned"><h2>Your collection</h2><p class="muted">Equip what you own. Sell what you don't love (60% back).</p><div class="collection">${mine.map(({ item, idx }) => collectionRow(item, idx)).join("")}</div>${purchaseHistoryMarkup()}</div>`
}

function purchaseHistoryMarkup() {
  const log = (state.purchases || []).slice(0, 5)
  if (!log.length) return ""
  return `<details class="purchase-history"><summary>Recent purchases</summary>${log.map((p) => `<div class="purchase-row"><span>${p.qty} × <strong>${esc(p.name)}</strong></span><span class="muted">${p.total} coins · ${new Date(p.ts).toLocaleDateString()}</span></div>`).join("")}</details>`
}

function inSeason(item) {
  const s = item.season
  if (!s) return true
  const now = new Date()
  const cur = (now.getMonth() + 1) * 100 + now.getDate()
  const f = s.f[0] * 100 + s.f[1]
  const t = s.t[0] * 100 + s.t[1]
  return f <= t ? cur >= f && cur <= t : cur >= f || cur <= t
}

function seasonDaysLeft(item) {
  const s = item.season
  if (!s) return 0
  const now = new Date()
  const end = new Date(now.getFullYear(), s.t[0] - 1, s.t[1], 23, 59, 59)
  if (end < now) end.setFullYear(end.getFullYear() + 1)
  return Math.max(1, Math.ceil((end - now) / 86400000))
}

// Hover/focus tooltip text for a reward: identity, price, what it actually
// does, and whether you already own it.
function rewardInfo(item) {
  const bits = [`${item.name} · ${item.category} · ${item.price} coins.`]
  if (item.description) bits.push(item.description)
  const id = String(item.id || "").toLowerCase()
  const cat = String(item.category || "").toLowerCase()
  if (id.includes("shield"))
    bits.push(
      "Effect: arming it forgives your next missed day and protects your streak.",
    )
  else if (id.includes("multipl"))
    bits.push(
      "Effect: +25% coins on every session for 24 hours once activated.",
    )
  else if (id.includes("double"))
    bits.push("Effect: doubles your next focus reward once armed.")
  else if (cat.includes("theme"))
    bits.push(
      "Effect: recolors your whole app instantly — equip any time from your collection.",
    )
  else if (cat.includes("sound"))
    bits.push(
      "Effect: joins your sound studio mixer — layer it under the timer.",
    )
  else if (cat.includes("badge"))
    bits.push("Effect: showcases on your profile next to your name.")
  else if (cat.includes("avatar"))
    bits.push(
      "Effect: becomes your face everywhere — crews, leaderboards and chat included.",
    )
  else
    bits.push(
      "Effect: yours forever once purchased — re-equip any time from your collection.",
    )
  if (ownsMine(item.id))
    bits.push("Status: already owned — find it in your collection below.")
  else if (item.season)
    bits.push(
      "Limited season reward — leaves the shop when the countdown ends.",
    )
  return bits.join(" ")
}

function normItem(a) {
  if (!a) return null
  if (!Array.isArray(a)) return a
  return {
    id: a[0],
    name: a[1],
    category: a[2],
    emoji: a[3],
    price: a[4],
    description: a[5] || "",
    season: a[6] || null,
  }
}

function findStoreItem(id) {
  return shopItems().find((i) => i.id === id) || null
}

function migrateOwned() {
  let changed = false
  state.owned = (state.owned || [])
    .map((o) => {
      if (o && (Array.isArray(o) || o.id == null)) {
        changed = true
        const n = normItem(
          Array.isArray(o) ? o : [o[0], o[1], o[2], o[3], o[4], o[5]],
        )
        if (!n || n.id == null) return null
        return {
          ...n,
          owner: o.owner || "me",
          boughtAt: o.boughtAt || Date.now(),
        }
      }
      return o
    })
    .filter((o) => o && o.id != null)
  if (changed) persist()
}

function shopItems() {
  return storeItems.map(normItem).filter(inSeason)
}

const EXCLUSIVE_REWARDS = [
  {
    id: "aurora-veil",
    name: "Aurora Veil theme",
    category: "Themes",
    emoji: sicon("sparkle"),
    price: 175,
    description: "Box-exclusive shifting aurora workspace.",
    tier: "Epic",
    exclusive: true,
  },
  {
    id: "epic-scholar",
    name: "Epic Scholar badge",
    category: "Badges",
    emoji: sicon("trophy"),
    price: 165,
    description: "Box-exclusive mark of deep focus.",
    tier: "Epic",
    exclusive: true,
  },
  {
    id: "celestial-gold",
    name: "Celestial Gold theme",
    category: "Themes",
    emoji: sicon("crown"),
    price: 300,
    description: "Box-exclusive radiant gold workspace.",
    tier: "Legendary",
    exclusive: true,
  },
  {
    id: "starforge",
    name: "Starforge avatar",
    category: "Avatars",
    emoji: sicon("planet"),
    price: 280,
    description: "Box-exclusive cosmic profile identity.",
    tier: "Legendary",
    exclusive: true,
  },
]
const MYSTERY_BOXES = {
  common: {
    name: "Common Mystery Box",
    emoji: sicon("gift"),
    price: 50,
    blurb: "Mostly commons, with a lucky shot at rares and epics.",
    odds: [
      ["Common", 65],
      ["Rare", 27],
      ["Epic", 7],
      ["Legendary", 1],
    ],
    coins: [10, 25],
    jackpot: 150,
  },
  rare: {
    name: "Rare Mystery Box",
    emoji: sicon("gem"),
    price: 120,
    blurb: "Better odds, bigger coins, a real shot at legendary.",
    odds: [
      ["Common", 15],
      ["Rare", 55],
      ["Epic", 25],
      ["Legendary", 5],
    ],
    coins: [40, 90],
    jackpot: 300,
  },
  epic: {
    name: "Epic Mystery Box",
    emoji: sicon("crown"),
    price: 300,
    blurb: "Primarily epic rewards, with a meaningful legendary chance.",
    odds: [
      ["Common", 5],
      ["Rare", 30],
      ["Epic", 50],
      ["Legendary", 15],
    ],
    coins: [120, 250],
    jackpot: 600,
  },
  legendary: {
    name: "Legendary Mystery Box",
    emoji: sicon("trophy"),
    price: 750,
    blurb: "The prestigious one. Primarily legendary rewards.",
    odds: [
      ["Rare", 10],
      ["Epic", 35],
      ["Legendary", 55],
    ],
    coins: [300, 600],
    jackpot: 1500,
  },
}

let cloudDeals = null // server deals when signed in: [{reward_id, deal_price, pct}]
let cloudDealsFailed = false // set when the Phase-4 RPCs are unreachable

// --- Backend status pill -----------------------------------------------------
// Rewards are fully usable offline (local coin ledger); the cloud matters for
// synced balances, deals and purchases — so a signed-out visitor gets the
// honest "Local data" pill, and a signed-in one gets a real probe (direct RPC,
// deliberately NOT getDailyDeals, whose day-cache would mask a dead server).
let storeBackendStatus = null // ok | down | offline | null = probing
let storeBackendStatusAt = 0

function storePillInfo() {
  const s = !cloudRewards() ? "local" : storeBackendStatus || "probing"
  const cls = s
  const label =
    s === "ok"
      ? "Live"
      : s === "down"
        ? "Backend error"
        : s === "offline"
          ? "Offline"
          : s === "local"
            ? "Local data"
            : "Connecting…"
  const title =
    s === "ok"
      ? "Store deals and balances are live from the backend"
      : s === "down"
        ? "The server responded with an error — local deals are shown. Purchases that need the cloud will explain if they fail."
        : s === "offline"
          ? "Can't reach the server — showing local deals and your device coin balance. Check your connection."
          : s === "local"
            ? "Rewards work offline. Sign in to sync your coin balance, deals, and purchases across devices."
            : "Checking the backend…"
  return { cls, label, title, retryable: s !== "local" }
}
registerBackendPillResolver("store", storePillInfo)

async function probeStoreBackend(root) {
  if (!cloudRewards()) {
    storeBackendStatus = "local"
    paintBackendPill("store", root)
    return
  }
  storeBackendStatus = null // probing
  paintBackendPill("store", root)
  let res
  try {
    res = await loadDailyDeals()
  } catch (err) {
    res = { error: err }
  }
  const msg = String(res.error?.message || res.error || "")
  storeBackendStatus = res.error
    ? /Failed to fetch|network|NetworkError/i.test(msg)
      ? "offline"
      : "down"
    : "ok"
  storeBackendStatusAt = Date.now()
  paintBackendPill("store", root)
}

// Today's deals: server-computed (authoritative prices) for cloud members,
// locally-seeded for guests (or when the Phase-4 migration isn't applied yet
// — purchases then fail with an honest "run migration 012" error).
function activeDeals() {
  if (cloudRewards() && !cloudDealsFailed && Array.isArray(cloudDeals)) {
    return cloudDeals
      .map((d) => {
        const item = findStoreItem(d.reward_id)
        return item ? { item, pct: d.pct, price: d.deal_price } : null
      })
      .filter(Boolean)
  }
  return dailyDeals()
}

function refreshCloudDeals() {
  if (!cloudRewards() || cloudDealsFailed) return
  getDailyDeals()
    .then((d) => {
      if (!Array.isArray(d)) {
        // Migration 012 not applied (or transient failure): fall back to
        // local deals; secure purchase calls will explain honestly.
        cloudDealsFailed = true
        storeBackendStatus = "down"
        storeBackendStatusAt = Date.now()
        paintBackendPill("store", $("#tab-store"))
        if (state.tab === "store" && $("#tab-store")?.innerHTML) renderStore()
        return
      }
      storeBackendStatus = "ok"
      storeBackendStatusAt = Date.now()
      paintBackendPill("store", $("#tab-store"))
      const sig = JSON.stringify(d)
      if (sig !== JSON.stringify(cloudDeals)) {
        cloudDeals = d
        if (state.tab === "store" && $("#tab-store")?.innerHTML) renderStore()
      }
    })
    .catch(() => {})
}

function dailyDeals() {
  const key = dayKey(new Date())
  let seed = 0
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const pool = shopItems()
  const picks = []
  const used = new Set()
  const discounts = [25, 30, 20]
  let guard = 0
  while (picks.length < 3 && used.size < pool.length && guard++ < 60) {
    seed = (seed * 1103515245 + 12345) >>> 0
    const item = pool[seed % pool.length]
    if (used.has(item.id)) continue
    used.add(item.id)
    const pct = discounts[picks.length % discounts.length]
    picks.push({
      item,
      pct,
      price: Math.max(5, Math.round(item.price * (1 - pct / 100))),
    })
  }
  return picks
}

function dealCountdown() {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const ms = midnight - now
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

function boxItemsByRarity(rarity) {
  const pool = shopItems().filter((i) => !ownsMine(i.id) || isStackable(i.id))
  const ex = EXCLUSIVE_REWARDS.filter((i) => !ownsMine(i.id))
  if (rarity === "Common") return pool.filter((i) => i.price < 60)
  if (rarity === "Rare")
    return pool.filter((i) => i.price >= 60 && i.price < 120)
  if (rarity === "Epic")
    return [
      ...pool.filter((i) => i.price >= 120 && i.price < 200),
      ...ex.filter((i) => i.tier === "Epic"),
    ]
  return [
    ...pool.filter((i) => i.price >= 200),
    ...ex.filter((i) => i.tier === "Legendary"),
  ]
}

function rollBoxReward(type) {
  const box = MYSTERY_BOXES[type] || MYSTERY_BOXES.common
  const r = Math.random() * 100
  let acc = 0
  let tier = "Common"
  for (const [name, pct] of box.odds) {
    acc += pct
    if (r < acc) {
      tier = name
      break
    }
  }
  if (tier === "Legendary") {
    const cands = boxItemsByRarity("Legendary")
    if (cands.length && Math.random() < 0.5) {
      const item = cands[Math.floor(Math.random() * cands.length)]
      return { kind: "item", item, tier, emoji: item.emoji, name: item.name }
    }
    return {
      kind: "coins",
      amount: box.jackpot,
      tier: "Legendary",
      emoji: sicon("coins"),
      name: `${box.jackpot} coins JACKPOT`,
    }
  }
  const cands = boxItemsByRarity(tier)
  if (!cands.length) {
    const amount =
      tier === "Common"
        ? box.coins[0]
        : tier === "Rare"
          ? Math.round((box.coins[0] + box.coins[1]) / 2)
          : box.coins[1]
    return {
      kind: "coins",
      amount,
      tier,
      emoji: sicon("coin"),
      name: `${amount} coins`,
    }
  }
  const item = cands[Math.floor(Math.random() * cands.length)]
  return { kind: "item", item, tier, emoji: item.emoji, name: item.name }
}

function grantReward(reward) {
  if (reward.kind === "coins") addCoins(reward.amount)
  else
    state.owned.push({
      ...reward.item,
      owner: "me",
      boughtAt: Date.now(),
    })
  persist()
}

let boxBusy = false

async function buyBoxCloud(type, qty) {
  // Each box is paid for AND rolled server-side (one RPC per box). The
  // authoritative result is sealed into a local token — tapping it later
  // only REVEALS the stored roll, never rerolls or mints.
  for (let k = 0; k < qty; k++) {
    const res = await secureOpenBox(type)
    if (!res.ok) {
      notify(res.error || "Box purchase failed.")
      renderStore()
      return
    }
    const sealed = {
      rarity: res.rarity,
      kind: res.kind,
      rewardId: res.rewardId,
      amount: res.amount,
    }
    if (res.kind === "item") {
      const item = findStoreItem(res.rewardId)
      sealed.item = item
        ? { ...item }
        : {
            id: res.rewardId,
            name: res.rewardId,
            emoji: sicon("gift"),
            description: "",
            price: 0,
            category: "Badges",
          }
    }
    state.boxes.push({ id: uid(), type, boughtAt: Date.now(), sealed })
    recordTransaction({
      itemId: "box:" + type,
      name: `${MYSTERY_BOXES[type].name} (${res.rarity})`,
      qty: 1,
      unitPrice: MYSTERY_BOXES[type].price,
      total: MYSTERY_BOXES[type].price,
      ts: Date.now(),
      recipient: "me",
    })
  }
  clearItemQty("box:" + type)
  persist()
  renderStore()
  notify(
    qty > 1
      ? `${qty} × ${MYSTERY_BOXES[type].name} added — tap them to reveal`
      : `${MYSTERY_BOXES[type].name} added — tap it to reveal`,
  )
}

function buyBox(type, qty) {
  const box = MYSTERY_BOXES[type]
  if (!box || boxBusy) return
  qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(qty) || 1)))
  const total = box.price * qty
  if ((state.coins || 0) < total)
    return notify(`You need ${total - state.coins} more coins.`)
  if (cloudRewards() && !requireAuth("buy mystery boxes")) return
  confirmBox(
    "Confirm purchase",
    `${qty} × ${esc(box.name)} — <strong>Total: ${total} coins</strong>`,
    () => {
      if (cloudRewards()) {
        if (boxBusy) return
        boxBusy = true
        buyBoxCloud(type, qty).finally(() => {
          boxBusy = false
        })
        return
      }
      boxBusy = true
      try {
        if ((state.coins || 0) < total)
          return notify("Not enough coins anymore.")
        if (!spendCoins(total))
          return notify("Purchase failed — not enough coins.")
        const ts = Date.now()
        for (let k = 0; k < qty; k++)
          state.boxes.push({ id: uid(), type, boughtAt: ts })
        recordTransaction({
          itemId: "box:" + type,
          name: box.name,
          qty,
          unitPrice: box.price,
          total,
          ts,
          recipient: "me",
        })
        clearItemQty("box:" + type)
        persist()
        renderStore()
        notify(
          qty > 1
            ? `${qty} × ${box.name} added — tap them to open`
            : `${box.name} added — tap it to open`,
        )
      } finally {
        boxBusy = false
      }
    },
  )
}

const FREE_BOX_ODDS = {
  legendary: 0.0007,
  epic: 0.007,
  rare: 0.1,
  pityAfter: 30,
}

function hash01(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

function rollFreeBox(day) {
  const seed = `${state.user?.id || state.deviceId || "local"}|${day}`
  const r = hash01("freebox:" + seed)
  const recent = (freeBoxState().history || []).slice(-FREE_BOX_ODDS.pityAfter)
  const drought =
    recent.length >= FREE_BOX_ODDS.pityAfter &&
    recent.every((h) => !["Rare", "Epic", "Legendary"].includes(h.tier))
  let tier = "Common"
  if (r < FREE_BOX_ODDS.legendary) tier = "Legendary"
  else if (r < FREE_BOX_ODDS.epic) tier = "Epic"
  else if (drought || r < FREE_BOX_ODDS.rare) tier = "Rare"
  const pickOf = (arr, salt) =>
    arr[Math.floor(hash01(`${seed}|${salt}`) * arr.length) % arr.length]
  if (tier === "Legendary") {
    const cands = boxItemsByRarity("Legendary")
    if (cands.length && hash01(seed + "|kind") < 0.5) {
      const item = pickOf(cands, "item")
      return {
        tier,
        reward: {
          kind: "item",
          item,
          tier: "Legendary",
          emoji: item.emoji,
          name: item.name,
        },
      }
    }
    const amount = 400 + Math.floor(hash01(seed + "|amt") * 401)
    return {
      tier,
      reward: {
        kind: "coins",
        amount,
        tier: "Legendary",
        emoji: sicon("coins"),
        name: `${amount} coins JACKPOT`,
      },
    }
  }
  if (tier === "Epic") {
    const cands = boxItemsByRarity("Epic")
    if (cands.length && hash01(seed + "|kind") < 0.5) {
      const item = pickOf(cands, "item")
      return {
        tier,
        reward: {
          kind: "item",
          item,
          tier: "Epic",
          emoji: item.emoji,
          name: item.name,
        },
      }
    }
    const amount = 150 + Math.floor(hash01(seed + "|amt") * 151)
    return {
      tier,
      reward: {
        kind: "coins",
        amount,
        tier: "Epic",
        emoji: sicon("coins"),
        name: `${amount} coins`,
      },
    }
  }
  if (tier === "Rare") {
    const cands = boxItemsByRarity("Rare")
    if (cands.length && hash01(seed + "|kind") < 0.5) {
      const item = pickOf(cands, "item")
      return {
        tier,
        reward: {
          kind: "item",
          item,
          tier: "Rare",
          emoji: item.emoji,
          name: item.name,
        },
      }
    }
    const amount = 60 + Math.floor(hash01(seed + "|amt") * 61)
    return {
      tier,
      reward: {
        kind: "coins",
        amount,
        tier: "Rare",
        emoji: sicon("coins"),
        name: `${amount} coins`,
      },
    }
  }
  const commons = boxItemsByRarity("Common")
  if (commons.length && hash01(seed + "|kind") < 0.3) {
    const item = pickOf(commons, "item")
    return {
      tier,
      reward: {
        kind: "item",
        item,
        tier: "Common",
        emoji: item.emoji,
        name: item.name,
      },
    }
  }
  const amount = 8 + Math.floor(hash01(seed + "|amt") * 13)
  return {
    tier,
    reward: {
      kind: "coins",
      amount,
      tier: "Common",
      emoji: sicon("coin"),
      name: `${amount} coins`,
    },
  }
}

let claimBusy = false

async function claimFreeBox() {
  if (claimBusy) return
  const fb = freeBoxState()
  if (fb.pending && !fb.pending.opened) {
    openFreeBoxReveal()
    return
  }
  claimBusy = true
  try {
    if (cloudRewards()) {
      if (!requireAuth("claim your free box")) return
      // Fast path: server truth (box log) or local state already shows
      // today's claim — don't fire an RPC we know will 400.
      if (!fb.pending && freeClaimedToday()) {
        renderStore()
        return notify(
          `Already claimed — your next box lands after midnight UTC (${freeBoxCountdown()})`,
        )
      }
      notify("Checking the calendar…")
      await refreshServerTime()
      // The server rolls, enforces one-per-day (UTC) and credits the
      // reward. Refresh/replay can never mint a second box: the ref is
      // unique AND the day guard rejects duplicates.
      const res = await secureOpenBox("free-common")
      if (!res.ok) {
        // Reconcile: the server says today is already claimed (claimed on
        // another device/session), so adopt that truth locally instead of
        // leaving a Claim button that can never succeed.
        if (/already claimed/i.test(String(res.error || ""))) {
          fb.lastClaimDay = serverDayKey()
          persist()
        }
        renderStore()
        notify(res.error || "Could not claim your box.")
        return
      }
      let reward
      if (res.kind === "item") {
        const item = findStoreItem(res.rewardId) || {
          id: res.rewardId,
          name: res.rewardId,
          emoji: sicon("gift"),
          description: "",
          price: 0,
          category: "Badges",
        }
        reward = {
          kind: "item",
          item,
          tier: res.rarity,
          emoji: item.emoji,
          name: item.name,
        }
      } else {
        reward = {
          kind: "coins",
          amount: res.amount,
          tier: res.rarity,
          emoji: res.rarity === "Common" ? sicon("coin") : sicon("coins"),
          name: `${res.amount} coins${
            res.rarity === "Legendary" ? " JACKPOT" : ""
          }`,
        }
      }
      const day = serverDayKey()
      fb.pending = {
        day,
        tier: res.rarity,
        reward,
        sealed: true,
        opened: false,
        claimedAt: Date.now(),
      }
      fb.lastClaimDay = day
      persist()
      renderStore()
      openFreeBoxReveal()
      return
    }
    notify("Checking the calendar…")
    await refreshServerTime()
    const day = serverDayKey()
    if (freeBoxState().lastClaimDay === day) {
      renderStore()
      return notify("Already claimed — your next box lands after midnight UTC")
    }
    const { tier, reward } = rollFreeBox(day)
    fb.pending = { day, tier, reward, opened: false, claimedAt: Date.now() }
    fb.lastClaimDay = day
    persist()
    renderStore()
    openFreeBoxReveal()
  } finally {
    claimBusy = false
  }
}

function collectFreeReward() {
  const fb = freeBoxState()
  const p = fb.pending
  if (!p || p.opened) return
  if (cloudRewards() && !p.sealed) {
    // Same rule as paid boxes: members only collect server-sealed rolls.
    fb.pending = null
    persist()
    renderStore()
    notify("That box wasn't issued by the server — claim a fresh one.")
    return
  }
  p.opened = true
  if (p.sealed) {
    // Cloud box: coins are already in the server balance; mirror items.
    if (p.reward.kind === "item" && p.reward.item) {
      state.owned.push({ ...p.reward.item, owner: "me", boughtAt: Date.now() })
    }
  } else {
    grantReward(p.reward)
  }
  fb.history = [
    ...(fb.history || []),
    {
      day: p.day,
      tier: p.tier,
      kind: p.reward.kind,
      name: p.reward.name,
      amount: p.reward.amount || 0,
    },
  ].slice(-30)
  recordTransaction({
    itemId: "freebox",
    name: `Free Daily Box (${p.tier})`,
    qty: 1,
    unitPrice: 0,
    total: 0,
    ts: Date.now(),
    recipient: "me",
  })
  fb.pending = null
  persist()
  renderStore()
  notify(
    p.reward.kind === "coins"
      ? `+${p.reward.amount} coins!`
      : `${p.reward.name} added to your collection!`,
  )
}

function freeBoxCountdown() {
  const now = serverNow()
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  )
  const ms = Math.max(0, midnight - now.getTime())
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

function freeBoxMarkup() {
  const fb = freeBoxState()
  const today = serverDayKey()
  if (fb.pending && !fb.pending.opened)
    return `<div class="card freebox-card pending" style="margin-bottom:18px"><div class="section-row"><h2>Free daily box</h2><span class="tag">unopened</span></div><p class="muted">Your sealed box is waiting — the reward inside is already locked in.</p><button type="button" class="primary" data-free-reveal style="margin-top:10px">Reveal my box</button></div>`
  if (fb.lastClaimDay === today || serverFreeClaimedToday())
    return `<div class="card freebox-card claimed" style="margin-bottom:18px"><div class="section-row"><h2>Free daily box</h2><span class="tag">claimed</span></div><p class="muted">Next free box in <strong>${freeBoxCountdown()}</strong> (midnight UTC).</p></div>`
  return `<div class="card freebox-card" style="margin-bottom:18px"><div class="section-row"><h2>Free daily box</h2><span class="tag">free</span></div><p class="muted">One Common box on the house — <strong>9.3% Rare</strong>, plus micro chances at <strong>Epic (0.63%)</strong> and <strong>Legendary (0.07%)</strong>. No coins needed.</p><button type="button" class="primary" data-free-claim style="margin-top:10px">Claim free box</button></div>`
}

function isStackable(id) {
  return ["shield", "multiplier", "double"].includes(id)
}

function ownsMine(id) {
  return state.owned.some((o) => o.id === id && (!o.owner || o.owner === "me"))
}

const MAX_QTY = 99

function itemQty(key) {
  const q = Math.floor(Number((state.storeQty || {})[key]) || 1)
  return Math.min(MAX_QTY, Math.max(1, q))
}

function setItemQty(key, qty) {
  state.storeQty = state.storeQty || {}
  qty = Math.floor(Number(qty) || 1)
  qty = Math.min(MAX_QTY, Math.max(1, qty))
  state.storeQty[key] = qty
  persist()
  return qty
}

function clearItemQty(key) {
  if (state.storeQty && key in state.storeQty) {
    delete state.storeQty[key]
    persist()
  }
}

function qtyStepperMarkup(key, unit) {
  const q = itemQty(key)
  return `<div class="qty-stepper" role="group" aria-label="Quantity"><button type="button" data-qty-dec="${key}" title="Decrease quantity" aria-label="Decrease quantity">−</button><span data-qty-val="${key}" aria-live="polite">${q}</span><button type="button" data-qty-inc="${key}" title="Increase quantity" aria-label="Increase quantity">+</button></div><div class="qty-line" data-qty-line="${key}" data-qty-unit="${unit}">${qtyLineText(q, unit)}</div>`
}

function qtyLineText(q, unit) {
  return `${q} × ${unit} = ${q * unit} coins`
}

function refreshQtyDom(key) {
  const q = itemQty(key)
  $$(`[data-qty-val="${key}"]`).forEach((el) => (el.textContent = q))
  $$(`[data-qty-line="${key}"]`).forEach((el) => {
    el.textContent = qtyLineText(q, Number(el.dataset.qtyUnit) || 0)
  })
}

function changeQty(key, delta, after) {
  const q = setItemQty(key, itemQty(key) + delta)
  refreshQtyDom(key)
  if (after) after(key, q)
  return q
}

function bindQtySteppers(root, after) {
  $$("[data-qty-inc]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation()
        changeQty(b.dataset.qtyInc, 1, after)
      }),
  )
  $$("[data-qty-dec]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation()
        changeQty(b.dataset.qtyDec, -1, after)
      }),
  )
}

function cartLines() {
  return shopItems()
    .filter((i) => (state.selectedStore || []).includes(i.id))
    .map((i) => {
      const qty = isStackable(i.id) ? itemQty(i.id) : 1
      return { item: i, qty, line: i.price * qty }
    })
}

function cartTotal() {
  return cartLines().reduce((a, l) => a + l.line, 0)
}

function cartUnits() {
  return cartLines().reduce((a, l) => a + l.qty, 0)
}

function refreshCartFooter() {
  const c = $("#cart-count")
  if (c) c.textContent = cartUnits()
  const t = $("#cart-total")
  if (t) t.textContent = cartTotal()
}

function afterCardQty(key) {
  if (!isStackable(key)) return
  if (!(state.selectedStore || []).includes(key)) {
    state.selectedStore = [...(state.selectedStore || []), key]
    persist()
    document
      .querySelector(`[data-store-item="${key}"]`)
      ?.classList.add("selected")
  }
  refreshCartFooter()
}

function afterStoreQty(key) {
  if (!key.startsWith("box:") && !key.startsWith("deal:")) afterCardQty(key)
  $$("[data-box-buy]").forEach((b) => {
    const box = MYSTERY_BOXES[b.dataset.boxBuy]
    if (!box) return
    b.disabled =
      (state.coins || 0) < box.price * itemQty("box:" + b.dataset.boxBuy)
  })
  $$("[data-deal-buy]").forEach((b) => {
    const deal = activeDeals().find((d) => d.item.id === b.dataset.dealBuy)
    if (!deal) return
    const q = isStackable(deal.item.id) ? itemQty("deal:" + deal.item.id) : 1
    b.disabled =
      (ownsMine(deal.item.id) && !isStackable(deal.item.id)) ||
      (state.coins || 0) < deal.price * q
  })
}

function recordTransaction(entry) {
  state.purchases = state.purchases || []
  state.purchases.unshift({ id: uid(), ...entry })
  state.purchases = state.purchases.slice(0, 100)
  persist()
}

function dealsMarkup() {
  if (cloudRewards() && !cloudDealsFailed && !Array.isArray(cloudDeals))
    return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Today's deals</h2><span class="tag">loading…</span></div><p class="muted">Fetching today's member deals.</p></div>`
  const deals = activeDeals()
  if (!deals.length) return ""
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Today's deals</h2><span class="tag">refreshes in ${dealCountdown()}</span></div>${deals.map((d) => `<div class="deal-row"><span class="deal-item">${d.item.emoji} <strong>${esc(d.item.name)}</strong></span>${isStackable(d.item.id) ? `<span class="deal-qty">${qtyStepperMarkup("deal:" + d.item.id, d.price)}</span>` : ""}<span class="deal-prices"><s class="muted">${sicon("coin")}${d.item.price}</s> <strong>${sicon("coin")}${d.price}</strong> <span class="tag">-${d.pct}%</span></span><button type="button" class="primary equip-btn" data-deal-buy="${d.item.id}"${ownsMine(d.item.id) && !isStackable(d.item.id) ? " disabled" : ""}>${ownsMine(d.item.id) && !isStackable(d.item.id) ? "Owned " + sicon("check") : "Buy"}</button></div>`).join("")}</div>`
}

function mysteryMarkup() {
  const boxes = state.boxes || []
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Mystery boxes</h2><span class="tag">luck</span></div>${freeBoxMarkup()}<div class="grid two">${Object.entries(
    MYSTERY_BOXES,
  )
    .map(
      ([type, b]) =>
        `<div class="box-card box-${type}"><div class="box-emoji">${b.emoji}</div><h3>${b.name}</h3><p class="muted" style="font-size:12px">${b.blurb}</p><div class="odds-row">${b.odds
          .filter(([, pct]) => pct > 0)
          .map(
            ([name, pct]) =>
              `<span class="rarity-${name.toLowerCase()}">${name} ${pct}%</span>`,
          )
          .join(
            "",
          )}</div>${qtyStepperMarkup("box:" + type, b.price)}<button type="button" class="primary equip-btn" data-box-buy="${type}"${
          state.coins < b.price ? " disabled" : ""
        }>Buy · ${sicon("coin")}${b.price}</button></div>`,
    )
    .join("")}</div>${
    boxes.length
      ? `<div class="section-row" style="margin-top:14px"><h3>Your boxes (${boxes.length})</h3></div><div class="box-inventory">${boxes.map((bx) => `<button type="button" class="box-token" data-box-open="${bx.id}" title="Open ${MYSTERY_BOXES[bx.type]?.name || "box"}">${MYSTERY_BOXES[bx.type]?.emoji || sicon("gift")}</button>`).join("")}</div><p class="muted">Tap a box to open it. Rewards land straight in your account.</p>`
      : '<p class="muted" style="margin-top:10px">No boxes yet — buy one above and test your luck.</p>'
  }</div>`
}

function openBox(boxId) {
  const box = (state.boxes || []).find((b) => b.id === boxId)
  if (!box || !MYSTERY_BOXES[box.type]) return
  const meta = MYSTERY_BOXES[box.type]
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  modal.innerHTML = `<div class="modal complete-card box-open-${box.type}"><div class="eyebrow">${meta.name}</div><div class="mystery-stage" data-stage><div class="mystery-boxart">${meta.emoji}</div></div><div class="freebox-badge" data-badge hidden></div><h2 data-box-title>Get ready…</h2><p class="muted" data-box-sub>Something good is coming.</p><div class="modal-actions" style="justify-content:center;margin-top:16px"><button type="button" class="ghost" data-box-cancel>Not yet</button><span data-box-actions hidden><button type="button" class="primary" data-box-collect>Collect</button></span></div></div>`
  $("#modal-root").append(modal)
  const timers = []
  const later = (fn, ms) => timers.push(setTimeout(fn, ms))
  const kill = () => timers.forEach(clearTimeout)
  const alive = () => document.body.contains(modal)
  const stage = $("[data-stage]", modal)
  const title = $("[data-box-title]", modal)
  const sub = $("[data-box-sub]", modal)
  const badge = $("[data-badge]", modal)
  const BOX_FX = {
    common: { shake: 800, reveal: 1500, burst: 70, flash: false },
    rare: { shake: 1000, reveal: 1900, burst: 130, flash: false },
    epic: { shake: 1200, reveal: 2400, burst: 220, flash: true },
    legendary: { shake: 1500, reveal: 3000, burst: 340, flash: true },
  }
  const fx = BOX_FX[box.type] || BOX_FX.common
  const centerBurst = (n) => {
    try {
      confettiBurst(window.innerWidth / 2, window.innerHeight * 0.38, n)
    } catch {
      /* ignore */
    }
  }
  $("[data-box-cancel]", modal).onclick = () => {
    kill()
    modal.remove()
  }
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      kill()
      modal.remove()
    }
  })
  const reveal = () => {
    if (!alive()) return
    // Sealed (cloud) boxes reveal the SERVER's stored roll — the reward was
    // fixed and credited at purchase time. Unsealed (guest/legacy) boxes use
    // the local roll and grant locally.
    let reward
    if (box.sealed) {
      const s = box.sealed
      reward =
        s.kind === "coins"
          ? {
              kind: "coins",
              amount: s.amount,
              tier: s.rarity,
              emoji: s.rarity === "Legendary" ? sicon("coins") : sicon("coin"),
              name: `${s.amount} coins${
                s.rarity === "Legendary" ? " JACKPOT" : ""
              }`,
            }
          : {
              kind: "item",
              item: s.item,
              tier: s.rarity,
              emoji: s.item.emoji,
              name: s.item.name,
            }
    } else {
      reward = rollBoxReward(box.type)
    }
    const rank = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 }[reward.tier] ?? 0
    const badgeText = {
      Common: "COMMON",
      Rare: "RARE REWARD!",
      Epic: "EPIC REWARD!",
      Legendary: "LEGENDARY REWARD!",
    }
    stage.classList.remove("shake", "shake-fast", "glow")
    stage.classList.add("burst")
    stage.innerHTML = `<div class="mystery-boxart mystery-pop">${reward.emoji}</div>`
    if (fx.flash)
      stage.insertAdjacentHTML("beforeend", '<div class="freebox-flash"></div>')
    badge.hidden = false
    badge.innerHTML = `<span class="rarity-${reward.tier.toLowerCase()}">${badgeText[reward.tier] || reward.tier.toUpperCase()}</span>`
    title.textContent = reward.name
    sub.innerHTML = `Rarity: <span class="rarity-${reward.tier.toLowerCase()}">${reward.tier}</span> · ${
      reward.kind === "coins"
        ? "straight to your balance"
        : esc(reward.item.description || "")
    }`
    centerBurst(fx.burst)
    if (rank >= 2) centerBurst(Math.round(fx.burst / 2))
    if (rank >= 3) {
      try {
        playChime("focus")
      } catch {
        /* silent */
      }
    }
    const actions = $("[data-box-actions]", modal)
    if (actions) actions.hidden = false
    $("[data-box-collect]", modal).onclick = () => {
      state.boxes = (state.boxes || []).filter((b) => b.id !== box.id)
      if (cloudRewards() && !box.sealed) {
        // Members may only open server-sealed boxes. An unsealed token (guest
        // era or tampered localStorage) carries no server payment — opening it
        // with a client-side roll would mint value from nothing. Drop it.
        persist()
        modal.remove()
        renderStore()
        notify(
          "That box wasn't issued by the server — it was removed. Buy a fresh one to play.",
        )
        return
      }
      if (box.sealed) {
        // Already credited server-side at purchase: mirror items locally so
        // the collection shows them; coins need no further action.
        if (reward.kind === "item" && reward.item) {
          state.owned.push({
            ...reward.item,
            owner: "me",
            boughtAt: Date.now(),
          })
          persist()
        }
      } else {
        grantReward(reward)
      }
      celebrate(reward.tier === "Common" ? false : true)
      modal.remove()
      renderStore()
      notify(
        reward.kind === "coins"
          ? `+${reward.amount} coins!`
          : `${reward.name} added to your collection!`,
      )
    }
  }
  if (state.reduceMotion) {
    reveal()
    return
  }
  title.textContent = "Shaking…"
  stage.classList.add("shake")
  later(() => {
    if (!alive()) return
    stage.classList.remove("shake")
    stage.classList.add("glow")
    if (box.type === "epic" || box.type === "legendary")
      stage.classList.add("shake-fast")
    title.textContent =
      box.type === "legendary" ? "Something mythic stirs…" : "Energy building…"
    sub.textContent =
      box.type === "common"
        ? "Something good is coming."
        : "Something rare is stirring."
  }, fx.shake)
  later(() => {
    if (!alive()) return
    reveal()
  }, fx.reveal)
}

function openFreeBoxReveal() {
  const p = freeBoxState().pending
  if (!p) return
  const tierRank = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 }
  const rank = tierRank[p.tier] ?? 0
  const badgeText = {
    Common: "COMMON",
    Rare: "RARE REWARD!",
    Epic: "EPIC REWARD!",
    Legendary: "LEGENDARY REWARD!",
  }
  const flavor = {
    Common: "Nice! You got something.",
    Rare: "Lucky! You found something special.",
    Epic: "Amazing! You found an Epic reward!",
    Legendary: "INCREDIBLE! A LEGENDARY REWARD!",
  }
  const burstN = [70, 130, 220, 340][rank]
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  modal.innerHTML = `<div class="modal complete-card freebox-modal tier-${p.tier.toLowerCase()}"><div class="eyebrow">Free daily box · reward sealed at claim</div><div class="mystery-stage freebox-anticipate" data-stage><div class="mystery-boxart" data-boxart>${sicon("gift")}</div><div class="freebox-flash" data-flash hidden></div></div><div class="freebox-badge" data-badge hidden></div><h2 data-box-title>Something stirs inside…</h2><p class="muted" data-box-sub>No rerolls, no funny business — what was sealed is what you get.</p><div class="modal-actions" style="justify-content:center;margin-top:16px"><button type="button" class="ghost" data-box-cancel>Not yet</button><span data-box-actions hidden><button type="button" class="primary" data-box-collect>Collect</button></span></div></div>`
  $("#modal-root").append(modal)
  const timers = []
  const later = (fn, ms) => timers.push(setTimeout(fn, ms))
  const kill = () => timers.forEach(clearTimeout)
  const alive = () => document.body.contains(modal)
  const stage = $("[data-stage]", modal)
  const art = $("[data-boxart]", modal)
  const title = $("[data-box-title]", modal)
  const sub = $("[data-box-sub]", modal)
  const flash = $("[data-flash]", modal)
  const badge = $("[data-badge]", modal)
  $("[data-box-cancel]", modal).onclick = () => {
    kill()
    modal.remove()
  }
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      kill()
      modal.remove()
    }
  })
  const centerBurst = (n) => {
    try {
      confettiBurst(window.innerWidth / 2, window.innerHeight * 0.38, n)
    } catch {
      /* ignore */
    }
  }
  const reveal = () => {
    if (!alive()) return
    const r = p.reward
    stage.classList.remove("shake", "shake-fast", "glow", "freebox-anticipate")
    stage.classList.add("burst")
    flash.hidden = false
    art.innerHTML = r.emoji
    art.classList.add("mystery-pop")
    badge.hidden = false
    badge.innerHTML = `<span class="rarity-${p.tier.toLowerCase()}">${badgeText[p.tier] || p.tier.toUpperCase()}</span>`
    title.textContent = r.name
    sub.innerHTML =
      (r.kind === "coins"
        ? "Straight to your balance"
        : esc(r.item?.description || "")) +
      `<br><span class="muted">${flavor[p.tier] || ""}</span>`
    centerBurst(burstN)
    try {
      playChime("focus")
      if (rank >= 1) {
        celebrate(true)
        setTimeout(() => {
          try {
            if (alive()) playChime("focus")
          } catch {
            /* ignore */
          }
        }, 350)
        later(() => alive() && centerBurst(rank >= 3 ? 120 : 60), 300)
        if (rank >= 3) later(() => alive() && centerBurst(80), 650)
      }
    } catch {
      /* silent */
    }
    const actions = $("[data-box-actions]", modal)
    if (actions) actions.hidden = false
    $("[data-box-collect]", modal).onclick = () => {
      kill()
      modal.remove()
      collectFreeReward()
    }
  }
  if (state.reduceMotion) {
    reveal()
    return
  }
  later(() => {
    if (!alive()) return
    stage.classList.remove("freebox-anticipate")
    stage.classList.add("shake")
    title.textContent = "Shaking… hold on…"
  }, 1100)
  later(() => {
    if (!alive()) return
    stage.classList.add("shake-fast", "glow")
    title.textContent =
      rank >= 3 ? "Something mythic stirs…" : "Energy building…"
    sub.textContent = "Almost there…"
    centerBurst(rank >= 2 ? 50 : 25)
  }, 2300)
  later(() => {
    if (alive()) reveal()
  }, [3100, 3600, 4200, 5000][rank])
}

let dealBusy = false

async function buyDealCloud(id, qty) {
  const deal = activeDeals().find((d) => d.item.id === id)
  if (!deal) return notify("That deal is no longer available")
  for (let k = 0; k < qty; k++) {
    const res = await secureDeal({ rewardId: id, fallbackPrice: deal.price })
    if (!res.ok) {
      notify(res.error || "Deal purchase failed.")
      renderStore()
      return
    }
    state.owned.push({ ...deal.item, owner: "me", boughtAt: Date.now() })
    recordTransaction({
      itemId: id,
      name: deal.item.name,
      qty: 1,
      unitPrice: res.total,
      total: res.total,
      ts: Date.now(),
      recipient: "me",
    })
  }
  clearItemQty("deal:" + id)
  persist()
  renderStore()
  notify(
    `Deal snagged: ${
      qty > 1 ? qty + " × " : ""
    }${deal.item.name} (−${deal.pct}%)`,
  )
}

function buyDeal(id, qty) {
  const deal = activeDeals().find((d) => d.item.id === id)
  if (!deal) return
  if (ownsMine(id) && !isStackable(id))
    return notify("Already in your collection")
  qty = isStackable(id)
    ? Math.min(MAX_QTY, Math.max(1, Math.floor(Number(qty) || 1)))
    : 1
  if (cloudRewards()) {
    if (!requireAuth("grab deals")) return
    // One tap = one attempt: each attempt mints a fresh idempotency key, so
    // a second concurrent run would record a SECOND purchase. Guard it.
    if (dealBusy) return
    dealBusy = true
    buyDealCloud(id, qty).finally(() => {
      dealBusy = false
    })
    return
  }
  const total = deal.price * qty
  if ((state.coins || 0) < total)
    return notify(`You need ${total - state.coins} more coins.`)
  confirmBox(
    "Confirm purchase",
    `${qty} × ${esc(deal.item.name)} — <strong>Total: ${total} coins (−${deal.pct}%)</strong>`,
    () => {
      if ((state.coins || 0) < total) return notify("Not enough coins anymore.")
      if (!spendCoins(total))
        return notify("Purchase failed — not enough coins.")
      const ts = Date.now()
      for (let k = 0; k < qty; k++)
        state.owned.push({ ...deal.item, owner: "me", boughtAt: ts })
      recordTransaction({
        itemId: id,
        name: deal.item.name,
        qty,
        unitPrice: deal.price,
        total,
        ts,
        recipient: "me",
      })
      clearItemQty("deal:" + id)
      persist()
      renderStore()
      notify(
        `Deal snagged: ${
          qty > 1 ? qty + " × " : ""
        }${deal.item.name} (−${deal.pct}%)`,
      )
    },
  )
}

let giftRecipient = "me"

let giftTarget = { type: "me", id: "me", name: "Buy for myself" }

let giftView = "friends"

let giftSelected = null

let giftQuery = ""

let giftResults = []

let giftSearching = false

function recipientOptions() {
  return [
    {
      id: "me",
      icon: sicon("user"),
      name: "Buy for myself",
      sub: "Treat yourself",
    },
    {
      id: "friend",
      icon: sicon("gift"),
      name: "Gift to a Friend",
      sub: "Someone in your list",
    },
    {
      id: "user",
      icon: sicon("search"),
      name: "Gift to Another User",
      sub: "Search registered users",
    },
  ]
}

function matchLocalFriends(q) {
  const needle = String(q || "")
    .trim()
    .toLowerCase()
  return state.friends
    .filter((f) => !needle || f.username.toLowerCase().includes(needle))
    .slice(0, 6)
    .map((f) => ({
      kind: "friend",
      id: f.id,
      name: "@" + f.username,
      handle: f.username,
      initial: (f.username[0] || "?").toUpperCase(),
    }))
}

function giftBtnInner() {
  const t = giftTarget
  const avatar =
    t.type === "me"
      ? `<span class="recipient-emoji" data-recipient-avatar>${sicon("user")}</span>`
      : `<span class="recipient-avatar sm" data-recipient-avatar>${esc(((t.name || "?").replace("@", "")[0] || "?").toUpperCase())}</span>`
  const label =
    t.type === "me" ? esc("Buy for myself") : `${sicon("gift")} ${esc(t.name)}`
  return `${avatar}<span data-recipient-label>${label}</span>`
}

function bindRecipient(t) {
  const wrap = $("[data-recipient-wrap]", t)
  const btn = $("[data-recipient-btn]", t)
  const pop = $("[data-recipient-pop]", t)
  if (!wrap || !btn || !pop) return
  let active = Math.max(
    0,
    recipientOptions().findIndex((o) => o.id === giftRecipient),
  )
  const paint = () => {
    btn.setAttribute("aria-expanded", String(!pop.hidden))
    btn.classList.toggle("open", !pop.hidden)
    $$("[data-recipient-pick]", pop).forEach((el) => {
      const on = el.dataset.recipientPick === giftTarget.type
      el.classList.toggle("selected", on)
      el.setAttribute("aria-selected", String(on))
    })
    $$("[data-recipient-pick]", pop).forEach((el, i) =>
      el.classList.toggle("active", !pop.hidden && i === active),
    )
  }
  const close = () => {
    if (pop.hidden) return
    pop.hidden = true
    paint()
    document.removeEventListener("pointerdown", outside, true)
  }
  const outside = (e) => {
    if (!wrap.contains(e.target)) close()
  }
  const open = () => {
    pop.hidden = false
    paint()
    try {
      const r = wrap.getBoundingClientRect()
      const h = pop.offsetHeight || 220
      pop.classList.toggle(
        "up",
        r.bottom + h + 12 > window.innerHeight && r.top > h + 12,
      )
    } catch {
      /* keep downward */
    }
    document.addEventListener("pointerdown", outside, true)
  }
  btn.onclick = (e) => {
    e.stopPropagation()
    if (pop.hidden) open()
    else close()
  }
  btn.onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (pop.hidden) open()
    } else if (e.key === "Escape" && !pop.hidden) {
      close()
      btn.focus()
    }
  }
  pop.onkeydown = (e) => {
    const opts = recipientOptions()
    if (e.key === "Escape") {
      close()
      btn.focus()
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      active =
        (active + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length
      paint()
      pop.querySelector(`[data-recipient-pick="${opts[active].id}"]`)?.focus()
    } else if (e.key === "Enter") {
      e.preventDefault()
      pick(opts[active].id)
    }
  }
  const pick = (id) => {
    if (id === "me") {
      giftRecipient = "me"
      giftTarget = { type: "me", id: "me", name: "Buy for myself" }
      close()
      btn.focus()
      renderStore()
      return
    }
    close()
    openGiftCenter(id)
  }
  $$("[data-recipient-pick]", pop).forEach(
    (el) => (el.onclick = () => pick(el.dataset.recipientPick)),
  )
  wrap.addEventListener("focusout", (e) => {
    if (!wrap.contains(e.relatedTarget)) close()
  })
  paint()
}

let giftSearchTimer = null

let giftSearchToken = 0

function openGiftCenter(mode) {
  giftView = mode === "user" ? "search" : "friends"
  giftSelected = null
  giftQuery = ""
  giftResults = []
  giftSearching = false
  renderGiftCenter()
}

function closeGiftCenter() {
  $("#gift-center")?.remove()
}

function giftPersonRow(p, selectedId) {
  const avatar = p.photo
    ? `<img src="${p.photo}" alt="">`
    : p.avatar && p.avatar.length <= 3 && !p.avatar.includes("@")
      ? `<span>${esc(p.avatar)}</span>`
      : `<span>${esc((p.name || "?").replace("@", "")[0] || "?").toUpperCase()}</span>`
  return `<button type="button" class="gift-person${
    selectedId === p.id ? " selected" : ""
  }" data-gift-pick="${esc(p.kind + ":" + p.id)}"><span class="recipient-avatar sm">${avatar}</span><span class="recipient-txt"><strong>${esc(p.name)}</strong><small>${
    p.kind === "user" ? "Registered user" : "Friend"
  }</small></span>${
    selectedId === p.id
      ? '<span class="recipient-check" style="opacity:1;transform:none">' +
        sicon("check") +
        "</span>"
      : ""
  }</button>`
}

function renderGiftCenter() {
  closeGiftCenter()
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  modal.id = "gift-center"
  if (!giftSelected) {
    const friends = matchLocalFriends(giftQuery)
    const dir = giftResults
    modal.innerHTML = `<div class="modal"><div class="eyebrow">Send a gift · step 1 of 2</div><h2>Who are you gifting to?</h2><div class="song-search" style="margin-top:12px"><span class="song-search-ico" aria-hidden="true">${sicon("search")}</span><input class="input" id="gift-search" placeholder="Search by username" value="${esc(giftQuery)}" aria-label="Search users" autocomplete="off"></div><div class="eyebrow" style="margin:10px 0 6px">Friends</div><div class="gift-list">${friends.map((p) => giftPersonRow(p, null)).join("") || '<p class="muted">No friends match — add some from the Friends tab.</p>'}</div><div class="eyebrow" style="margin:12px 0 6px">Registered users</div><div class="gift-list" data-gift-dir>${
      giftSearching
        ? '<p class="muted">Searching…</p>'
        : dir.length
          ? dir.map((p) => giftPersonRow(p, null)).join("")
          : `<p class="muted">${
              backendConfigured && state.user
                ? "Type 2+ letters to search the directory."
                : "Sign in to search every registered user."
            }</p>`
    }</div><div class="modal-actions" style="margin-top:16px"><button type="button" class="ghost" data-gift-cancel>Cancel</button></div></div>`
    $("#modal-root").append(modal)
    $("[data-gift-cancel]", modal).onclick = () => closeGiftCenter()
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeGiftCenter()
    })
    const input = $("#gift-search", modal)
    input.oninput = () => {
      giftQuery = input.value
      clearTimeout(giftSearchTimer)
      giftSearchTimer = setTimeout(() => runGiftSearch(input.value), 350)
      const friendsBox = $$(".gift-list", modal)[0]
      if (friendsBox)
        friendsBox.innerHTML =
          matchLocalFriends(input.value)
            .map((p) => giftPersonRow(p, null))
            .join("") || '<p class="muted">No friends match.</p>'
      bindGiftPicks(modal)
    }
    bindGiftPicks(modal)
    setTimeout(() => input.focus(), 0)
    return
  }
  const items = shopItems().filter((i) => state.selectedStore.includes(i.id))
  const total = items.reduce((a, i) => a + i.price, 0)
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Send a gift · step 2 of 2</div><h2>${sicon("gift")} You're sending a gift!</h2><div class="gift-summary"><div class="gift-summary-row"><span class="muted">To</span><strong>${sicon("user")} ${esc(giftSelected.name)}</strong></div><div class="gift-summary-row"><span class="muted">Items</span><span>${
    items.length
      ? items.map((i) => `${i.emoji} ${esc(i.name)}`).join(", ")
      : "<em>Cart is empty</em>"
  }</span></div><div class="gift-summary-row"><span class="muted">Total</span><strong>${sicon("coin")}${total}</strong></div></div><label class="field-label">Personal message (optional)<textarea class="input autogrow" id="gift-msg" rows="2" placeholder="Keep crushing your studies!"></textarea></label><div class="modal-actions" style="margin-top:16px"><button type="button" class="ghost" data-gift-back>Back</button><button type="button" class="primary" data-gift-continue${
    items.length ? "" : " disabled"
  }>Continue to Checkout</button></div></div>`
  $("#modal-root").append(modal)
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeGiftCenter()
  })
  // Back returns to the recipient picker (step 1) — the chosen person stays
  // highlighted so you can confirm or switch before checking out.
  $("[data-gift-back]", modal).onclick = () => {
    giftSelected = null
    renderGiftCenter()
  }
  $("[data-gift-continue]", modal).onclick = () => {
    if (!items.length) return
    if (state.coins < total) {
      notify(`You need ${total - state.coins} more coins.`)
      return
    }
    const message = ($("#gift-msg", modal)?.value || "").trim()
    closeGiftCenter()
    checkoutGiftFlow(message)
  }
}

function bindGiftPicks(modal) {
  $$("[data-gift-pick]", modal).forEach(
    (b) =>
      (b.onclick = () => {
        const v = b.dataset.giftPick
        const sep = v.indexOf(":")
        const kind = v.slice(0, sep)
        const id = v.slice(sep + 1)
        let person = null
        if (kind === "friend") {
          const f = state.friends.find((x) => x.id === id)
          if (f)
            person = {
              kind: "friend",
              id: f.id,
              name: "@" + f.username,
            }
        } else {
          const u = giftResults.find((x) => x.id === id)
          if (u)
            person = {
              kind: "user",
              id: u.id,
              name: u.handle ? "@" + u.handle : u.name,
            }
        }
        if (!person) return
        giftSelected = person
        renderGiftCenter()
      }),
  )
}

function runGiftSearch(query) {
  const token = ++giftSearchToken
  giftQuery = query
  const box = $("#gift-center [data-gift-dir]")
  if (!box) return
  const q = String(query || "").trim()
  if (!backendConfigured || !state.user || q.length < 2) {
    giftResults = []
    giftSearching = false
    box.innerHTML = `<p class="muted">${
      backendConfigured && state.user
        ? "Type 2+ letters to search the directory."
        : "Sign in to search every registered user."
    }</p>`
    return
  }
  giftSearching = true
  box.innerHTML = "<p class='muted'>Searching…</p>"
  searchUsers(q)
    .then((res) => {
      if (token !== giftSearchToken) return
      giftSearching = false
      if (res.error || !res.data) {
        box.innerHTML =
          "<p class='muted'>Directory unavailable right now — try a friend instead.</p>"
        return
      }
      giftResults = res.data
        .filter((u) => u.id !== state.user.id)
        .map((u) => ({
          kind: "user",
          id: u.id,
          name: u.handle ? "@" + u.handle : u.name || "User",
          handle: u.handle || "",
          avatar: u.avatar || "",
        }))
      box.innerHTML = giftResults.length
        ? giftResults.map((p) => giftPersonRow(p, null)).join("")
        : "<p class='muted'>No registered users match.</p>"
      const modal = $("#gift-center")
      if (modal) bindGiftPicks(modal)
    })
    .catch(() => {
      if (token !== giftSearchToken) return
      giftSearching = false
      box.innerHTML =
        "<p class='muted'>Directory unavailable right now — try a friend instead.</p>"
    })
}

async function deliverGiftCloud(target, items, note) {
  if (!backendConfigured || !state.user || !target || target.kind !== "user")
    return { cloud: false }
  try {
    const names = items.map((i) => i.name).join(", ")
    const text = `${sicon("gift")} ${state.profile.name} sent you a gift: ${names}${
      note ? ` — “${note}”` : ""
    }`
    const msg = await sendCloudMessage({
      id: crypto.randomUUID(),
      sender_id: state.user.id,
      group_id: null,
      recipient_id: target.id,
      text,
      kind: "text",
      delivery_status: "sent",
      metadata: { gift: true, items: items.map((i) => i.id), note: note || "" },
    })
    if (msg.error) return { cloud: false }
    try {
      await sendGiftNotification(
        target.id,
        sicon("gift") + " You received a gift",
        `${state.profile.name} sent you: ${names}`,
      )
    } catch {
      /* notification best-effort */
    }
    return { cloud: true }
  } catch {
    return { cloud: false }
  }
}

async function checkoutGiftFlow(message) {
  if (!giftSelected) return
  const target = { ...giftSelected }
  giftRecipient = target.id || "me"
  giftTarget = {
    type: target.kind === "user" ? "user" : "friend",
    id: target.id,
    name: target.name,
  }
  // Snapshot what is in the cart BEFORE checkout() clears it, then let
  // checkout() run the real purchase (coins, ownership, history).
  const cartItems = shopItems().filter((i) =>
    (state.selectedStore || []).includes(i.id),
  )
  if (!cartItems.length) {
    notify("Select at least one reward to gift")
    return
  }
  const total = cartItems.reduce((a, i) => a + i.price, 0)
  if ((state.coins || 0) < total) {
    notify(`You need ${total - (state.coins || 0)} more coins.`)
    return
  }
  // checkout() only completes after the user confirms the purchase dialog,
  // so the gift must be delivered from the on-confirmed callback — reading
  // state.lastGiftItems right after checkout() returns sees the PREVIOUS
  // purchase's items (or nothing) and can double-gift or mis-gift.
  const confirmed = await new Promise((resolve) =>
    checkout(
      () => resolve(true),
      () => resolve(false),
    ),
  )
  if (!confirmed || !state.lastGiftItems?.length) return // cancelled or blocked
  const items = state.lastGiftItems.map(
    (id) => findStoreItem(id) || { name: id, emoji: sicon("gift") },
  )
  const res = await deliverGiftCloud(target, items, message)
  const friendChat = target.kind === "friend"
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  modal.innerHTML = `<div class="modal complete-card"><div class="complete-emoji">${sicon("gift")}</div><div class="eyebrow">Gift sent!</div><h2>You're awesome.</h2><p class="muted"><strong>To:</strong> ${esc(target.name)}<br><strong>Items:</strong> ${
    items.length
      ? items.map((i) => `${i.emoji} ${esc(i.name)}`).join(", ")
      : "—"
  }${
    message ? `<br><strong>Message:</strong> “${esc(message)}”` : ""
  }</p><p class="muted">${
    res.cloud
      ? "Delivered to their inbox " + sicon("check") + " and notification sent."
      : friendChat
        ? "Posted in your chat — they'll see it here."
        : "Saved to your records."
  }</p><div class="modal-actions" style="justify-content:center;margin-top:16px"><button type="button" class="primary" data-gift-done>Done</button></div></div>`
  $("#modal-root").append(modal)
  $("[data-gift-done]", modal).onclick = () => modal.remove()
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove()
  })
  celebrate(false)
}

// Cross-device catch-up: anything the server inventory holds that this
// device hasn't mirrored into the collection yet gets a local mirror.
// Additive only (never deletes) so guest-era items are never wiped.
let lastInventoryMerge = 0
async function mergeCloudInventory() {
  if (!cloudRewards()) return false
  if (Date.now() - lastInventoryMerge < 60000) return false
  lastInventoryMerge = Date.now()
  let rows = null
  try {
    const res = await loadInventory()
    if (res.error || !Array.isArray(res.data)) return false
    rows = res.data
  } catch {
    return false
  }
  let touched = false
  for (const row of rows) {
    if (!row || (row.qty || 0) <= 0) continue
    const item = findStoreItem(row.reward_id)
    if (!item) continue
    const have = (state.owned || []).filter(
      (o) => o && o.id === item.id && (!o.owner || o.owner === "me"),
    ).length
    const want = isStackable(item.id) ? Math.min(row.qty, MAX_QTY) : 1
    for (let k = have; k < want; k++) {
      state.owned.push({ ...item, owner: "me", boughtAt: Date.now() })
      touched = true
    }
  }
  if (touched) persist()
  return touched
}

function renderStore() {
  const t = $("#tab-store")
  if (!t) return
  refreshCloudDeals() // async: re-renders the deals section when ready
  mergeCloudInventory()
    .then((changed) => {
      if (changed && state.tab === "store") renderStore()
    })
    .catch(() => {})
  if (giftTarget.type !== "me" && !giftTarget.id) {
    giftTarget = { type: "me", id: "me", name: "Buy for myself" }
    giftRecipient = "me"
  }
  const visible =
    state.storeCategory === "All"
      ? shopItems()
      : shopItems().filter((x) => x.category === state.storeCategory)
  t.innerHTML = `${viewHead("Rewards store", "Spend the coins you earn from focused sessions on themes, sounds, boosts, badges, and profile identities.")}<div class="backend-pill-head">${backendPillMarkup("store")}</div>${earnMarkup()}${topupMarkup()}${dealsMarkup()}${mysteryMarkup()}<div class="filter-bar">${["All", "Themes", "Sounds", "Boosts", "Badges", "Avatars"].map((x) => `<button type="button" class="filter ${state.storeCategory === x ? "active" : ""}" data-store-filter="${x}">${x}</button>`).join("")}</div><div class="grid three">${visible.map((i) => `<article class="card store-item ${state.selectedStore.includes(i.id) ? "selected" : ""}" data-store-item="${i.id}"><button type="button" class="info-btn" data-info="${i.id}" data-tip="${esc(rewardInfo(i))}" title="About this reward" aria-label="About ${esc(i.name)}">i</button><div class="emoji">${i.emoji}</div><div class="price">${sicon("coin")} ${i.price}</div>${isStackable(i.id) ? qtyStepperMarkup(i.id, i.price) : ""}<h3>${esc(i.name)}</h3><p class="muted">${esc(i.description)}</p><span class="tag">${i.category}</span>${i.season ? `<span class="tag limited-tag">limited · ${seasonDaysLeft(i)}d left</span>` : ""}</article>`).join("")}</div><div class="store-footer"><span><strong id="cart-count">${cartUnits()}</strong> units · <b id="cart-total">${cartTotal()}</b> coins</span><span class="recipient-wrap" data-recipient-wrap><button type="button" class="recipient-btn" data-recipient-btn aria-haspopup="listbox" aria-expanded="false">${giftBtnInner()}<svg class="recipient-chev" width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="recipient-pop" data-recipient-pop role="listbox" aria-label="Buy for" hidden>${recipientOptions()
    .map(
      (o) =>
        `<button type="button" role="option" aria-selected="${o.id === giftRecipient}" class="recipient-opt${
          o.id === giftRecipient ? " selected" : ""
        }" data-recipient-pick="${o.id}">${
          o.initial
            ? `<span class="recipient-avatar sm">${esc(o.initial)}</span>`
            : `<span class="recipient-emoji">${o.icon}</span>`
        }<span class="recipient-txt"><strong>${esc(o.name)}</strong><small>${esc(o.sub)}</small></span><span class="recipient-check">${sicon("check")}</span></button>`,
    )
    .join(
      "",
    )}</div></span><button type="button" class="primary" id="checkout">Buy selected</button>    </div>${collectionMarkup()}`
  paintBackendPill("store", t)
  t
    .querySelector('[data-backend-retry][data-backend-status="store"]')
    ?.addEventListener("click", async () => {
      if (!cloudRewards()) return // local pill has nothing to retry
      await probeStoreBackend(t)
      if (storeBackendStatus === "ok" && cloudDealsFailed) {
        cloudDealsFailed = false
        refreshCloudDeals()
      }
    })
  if (Date.now() - storeBackendStatusAt > 60000) probeStoreBackend(t)
  $$("[data-store-filter]", t).forEach(
    (b) =>
      (b.onclick = () => {
        state.storeCategory = b.dataset.storeFilter
        renderStore()
      }),
  )
  $$("[data-store-item]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.storeItem
        state.selectedStore = state.selectedStore.includes(id)
          ? state.selectedStore.filter((x) => x !== id)
          : [...state.selectedStore, id]
        renderStore()
      }),
  )
  $$("[data-info]", t).forEach((b) => {
    b.addEventListener("click", (e) => e.stopPropagation())
  })
  $("#checkout", t).onclick = checkout
  bindQtySteppers(t, afterStoreQty)
  bindRecipient(t)
  $("[data-checkin]", t)?.addEventListener("click", claimCheckin)
  $$("[data-box-buy]", t).forEach(
    (b) =>
      (b.onclick = () =>
        buyBox(b.dataset.boxBuy, itemQty("box:" + b.dataset.boxBuy))),
  )
  $$("[data-box-open]", t).forEach(
    (b) => (b.onclick = () => openBox(b.dataset.boxOpen)),
  )
  $("[data-free-claim]", t)?.addEventListener("click", claimFreeBox)
  $("[data-free-reveal]", t)?.addEventListener("click", openFreeBoxReveal)
  $$("[data-deal-buy]", t).forEach(
    (b) =>
      (b.onclick = () =>
        buyDeal(b.dataset.dealBuy, itemQty("deal:" + b.dataset.dealBuy))),
  )
  $$("[data-topup]", t).forEach(
    (b) => (b.onclick = () => openTopup(b.dataset.topup)),
  )
  $$("[data-equip-theme]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const item = state.owned[+b.dataset.equipTheme]
        if (!item) return
        state.equipped.theme = state.equipped.theme === item.id ? null : item.id
        persist()
        pushUserSettings()
        applyEquippedTheme()
        shell()
        notify(
          state.equipped.theme
            ? `${item.name} equipped`
            : "Back to the default look",
        )
      }),
  )
  $$("[data-equip-avatar]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const item = state.owned[+b.dataset.equipAvatar]
        if (!item) return
        state.equipped.avatar =
          state.equipped.avatar === item.id ? null : item.id
        persist()
        shell()
        notify(state.equipped.avatar ? `${item.name} set` : "Avatar removed")
      }),
  )
  $$("[data-equip-badge]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const item = state.owned[+b.dataset.equipBadge]
        if (!item) return
        const result = toggleShowcaseBadge(item)
        persist()
        shell()
        notify(
          result === "added"
            ? `${item.name} showcased`
            : result === "removed"
              ? "Badge removed from showcase"
              : "That isn't a badge",
        )
      }),
  )
  $$("[data-equip-sound]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const item = state.owned[+b.dataset.equipSound]
        const ambientId = item && SOUND_EQUIP[item.id]
        if (!ambientId) return
        if (state.soundMix[ambientId] != null) {
          stopLayer(ambientId)
          delete state.soundMix[ambientId]
          notify("Sound stopped")
        } else if (startLayer(ambientId, 0.7)) {
          state.soundMix[ambientId] = 0.7
          notify(`${item.name} playing`)
        }
        persist()
        pushUserSettings()
        renderStore()
      }),
  )
  $$("[data-activate-shield]", t).forEach(
    (b) =>
      (b.onclick = () => {
        consumeOne(
          "shield",
          () => {
            state.boosts.shields++
            persist()
            renderStore()
            notify(
              sicon("shield") +
                " Shield armed — your next missed day is forgiven",
            )
          },
          { reason: "Streak Shield activated" },
        )
      }),
  )
  $$("[data-activate-multiplier]", t).forEach(
    (b) =>
      (b.onclick = () => {
        consumeOne(
          "multiplier",
          () => {
            state.boosts.multiplierUntil =
              Math.max(Date.now(), state.boosts.multiplierUntil || 0) +
              24 * 60 * 60 * 1000
            persist()
            renderStore()
            notify(sicon("sparkle") + " +25% coins for the next 24 hours")
          },
          { reason: "Coin Multiplier activated" },
        )
      }),
  )
  $$("[data-activate-double]", t).forEach(
    (b) =>
      (b.onclick = () => {
        if (state.boosts.doubleArmed) return
        consumeOne(
          "double",
          () => {
            state.boosts.doubleArmed = true
            persist()
            renderStore()
            notify(
              sicon("target") + " Armed — your next focus reward is doubled",
            )
          },
          { reason: "Double Dip armed" },
        )
      }),
  )
  $$("[data-sell-idx]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const preview = state.owned[+b.dataset.sellIdx]
        if (!preview) return
        if (preview.unbuyable)
          return notify("Earned badges can't be sold — they stay with you.")
        consumeOne(
          preview.id,
          () => {
            persist()
            applyEquippedTheme()
            notify("Reward traded for coins")
            renderStore()
          },
          { sellBack: true },
        )
      }),
  )
}

let checkoutBusy = false

function checkout(onConfirmed, onCancelled) {
  if (checkoutBusy) return
  // Buying — for yourself or as a gift — is a member perk.
  if (!requireAuth("buy rewards")) {
    if (onCancelled) onCancelled()
    return
  }
  const lines = cartLines()
  if (!lines.length) {
    notify("Select at least one reward")
    if (onCancelled) onCancelled()
    return
  }
  // Gifting may legitimately include rewards you already own (you can own a
  // theme and still give the same one to a friend), so the owned filter only
  // applies when buying for yourself.
  const skipped = lines.filter(
    ({ item }) =>
      giftRecipient === "me" && !isStackable(item.id) && ownsMine(item.id),
  )
  const fresh = lines.filter((l) => !skipped.includes(l))
  if (skipped.length)
    notify(
      `Already owned — skipped: ${[...new Set(skipped.map((l) => l.item.name))].join(", ")}`,
    )
  if (!fresh.length) {
    state.selectedStore = []
    renderStore()
    if (onCancelled) onCancelled()
    return
  }
  const total = fresh.reduce((a, l) => a + l.line, 0)
  if ((state.coins || 0) < total) {
    notify(`You need ${total - state.coins} more coins to buy these rewards.`)
    if (onCancelled) onCancelled()
    return
  }
  const rows = fresh
    .map(({ item, qty, line }) => `${qty} × ${esc(item.name)} — ${line} coins`)
    .join("<br>")
  confirmBox(
    "Confirm purchase",
    `${rows}<br><br><strong>Total: ${total} coins</strong>`,
    () => {
      if (checkoutBusy) return
      // Cloud members check out through the secure RPCs (authoritative
      // catalog price, atomic debit + inventory, idempotent per line).
      if (cloudRewards()) {
        checkoutBusy = true
        checkoutCloud(fresh, onConfirmed, onCancelled).finally(() => {
          checkoutBusy = false
        })
        return
      }
      checkoutBusy = true
      let ok = false
      try {
        if ((state.coins || 0) < total) {
          notify("Not enough coins anymore.")
        } else if (!spendCoins(total)) {
          notify("Purchase failed — not enough coins.")
        } else {
          const recipient = giftRecipient
          const giftNote = "" // gift notes live in the gift flow modal only
          const ts = Date.now()
          fresh.forEach(({ item, qty, line }) => {
            for (let k = 0; k < qty; k++)
              state.owned.push({
                ...item,
                owner: recipient,
                boughtAt: ts,
                note: recipient === "me" ? "" : giftNote,
              })
            recordTransaction({
              itemId: item.id,
              name: item.name,
              qty,
              unitPrice: item.price,
              total: line,
              ts,
              recipient,
            })
          })
          state.lastGiftItems =
            recipient === "me" ? [] : fresh.map((l) => l.item.id)
          if (
            recipient !== "me" &&
            state.friends.some((f) => f.id === recipient)
          ) {
            state.messages[recipient] = [
              ...(state.messages[recipient] || []),
              {
                id: uid(),
                me: true,
                text: `${sicon("gift")} I sent you ${fresh.map((l) => (l.qty > 1 ? `${l.qty} × ${l.item.name}` : l.item.name)).join(", ")}${
                  giftNote ? ` — “${giftNote}”` : ""
                }`,
                ts: Date.now(),
              },
            ]
          }
          state.selectedStore = []
          fresh.forEach(({ item }) => clearItemQty(item.id))
          persist()
          notify(
            recipient === "me"
              ? "Rewards purchased"
              : "Gift sent to your friend",
          )
          renderStore()
          ok = true
        }
      } finally {
        checkoutBusy = false
      }
      if (ok && onConfirmed) onConfirmed()
    },
    {
      onCancel: () => {
        if (onCancelled) onCancelled()
      },
    },
  )
}

// Secure cart checkout: one idempotent RPC per line at the authoritative
// price. Any failure aborts the rest — completed lines stay completed (each
// is its own atomic purchase), the balance is reconciled, and the user gets
// an honest error instead of a false success.
async function checkoutCloud(fresh, onConfirmed, onCancelled) {
  const recipient = giftRecipient
  const isUserGift =
    recipient !== "me" &&
    giftTarget.type === "user" &&
    giftTarget.id === recipient
  const ts = Date.now()
  const doneLines = []
  for (const { item, qty } of fresh) {
    const res = isUserGift
      ? await secureGift({
          rewardId: item.id,
          qty,
          recipientId: recipient,
          fallbackPrice: item.price,
        })
      : await securePurchase({
          rewardId: item.id,
          qty,
          fallbackPrice: item.price,
        })
    if (!res.ok) {
      notify(res.error || "Purchase failed.")
      if (!doneLines.length && onCancelled) onCancelled()
      if (doneLines.length && onConfirmed) onConfirmed()
      renderStore()
      return
    }
    // Mirror what the server now owns so the collection is instant.
    if (!isUserGift) {
      for (let k = 0; k < qty; k++)
        state.owned.push({ ...item, owner: recipient, boughtAt: ts })
    }
    recordTransaction({
      itemId: item.id,
      name: item.name,
      qty,
      unitPrice: Math.round(res.total / qty),
      total: res.total,
      ts,
      recipient: isUserGift ? recipient : "me",
    })
    doneLines.push(item.id)
  }
  state.lastGiftItems = recipient === "me" ? [] : fresh.map((l) => l.item.id)
  if (recipient !== "me" && state.friends.some((f) => f.id === recipient)) {
    state.messages[recipient] = [
      ...(state.messages[recipient] || []),
      {
        id: uid(),
        me: true,
        text: `${sicon("gift")} I sent you ${fresh.map((l) => (l.qty > 1 ? `${l.qty} × ${l.item.name}` : l.item.name)).join(", ")}`,
        ts: Date.now(),
      },
    ]
  }
  state.selectedStore = []
  fresh.forEach(({ item }) => clearItemQty(item.id))
  persist()
  notify(recipient === "me" ? "Rewards purchased" : "Gift sent")
  renderStore()
  if (onConfirmed) onConfirmed()
}

export {
  storeItems,
  equippedAvatarEmoji,
  equippedBadgeEmoji,
  equippedBadges,
  showcasedBadgeIds,
  toggleShowcaseBadge,
  ownedBadges,
  checkinReward,
  earnMarkup,
  claimCheckin,
  removeOwnedAt,
  collectionRow,
  collectionMarkup,
  purchaseHistoryMarkup,
  inSeason,
  seasonDaysLeft,
  normItem,
  findStoreItem,
  migrateOwned,
  shopItems,
  MYSTERY_BOXES,
  dailyDeals,
  dealCountdown,
  boxItemsByRarity,
  rollBoxReward,
  grantReward,
  boxBusy,
  buyBox,
  FREE_BOX_ODDS,
  hash01,
  rollFreeBox,
  claimBusy,
  claimFreeBox,
  collectFreeReward,
  freeBoxCountdown,
  freeBoxMarkup,
  freeBoxState,
  isStackable,
  ownsMine,
  MAX_QTY,
  itemQty,
  setItemQty,
  clearItemQty,
  qtyStepperMarkup,
  qtyLineText,
  refreshQtyDom,
  changeQty,
  bindQtySteppers,
  cartLines,
  cartTotal,
  cartUnits,
  refreshCartFooter,
  afterCardQty,
  afterStoreQty,
  recordTransaction,
  dealsMarkup,
  mysteryMarkup,
  openBox,
  openFreeBoxReveal,
  buyDeal,
  giftRecipient,
  giftTarget,
  giftView,
  giftSelected,
  giftQuery,
  giftResults,
  giftSearching,
  giftSearchTimer,
  giftSearchToken,
  recipientOptions,
  matchLocalFriends,
  giftBtnInner,
  bindRecipient,
  openGiftCenter,
  closeGiftCenter,
  giftPersonRow,
  renderGiftCenter,
  bindGiftPicks,
  runGiftSearch,
  deliverGiftCloud,
  checkoutGiftFlow,
  renderStore,
  checkoutBusy,
  checkout,
  activeDeals,
  refreshCloudDeals,
}
