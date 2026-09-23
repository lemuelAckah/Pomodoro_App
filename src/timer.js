/* timer.js — focus timer, tasks, streaks, stats, achievements */
import {
  state, $, $$, uid, get, save, esc, sicon, persist, notify, confirmBox, toast, viewHead,
  addCoins, fmt, fmtDur, dayKey, celebrate, addNotification, browserNotify,
  ensureNotifyPermission, notifOn, updateBarPadding, makeDraggable,
} from "./core.js";
import { playChime, stopAllLayers, startAmbient, applyLinkToTimer, warmAudio } from "./audio.js";
import { techniques, TECH_DETAILS, matchTech, totalDue, openTechniqueGuide } from "./techniques.js";
import { logFocusDay, progressChallenges, missionDeskMarkup, bindMissionDesk, challengeLock, challengeLockBanner, leaveChallenge, paceSec } from "./community.js";
import { shell } from "./app.js";
import { mirrorTasks, deleteTaskEverywhere, mirrorTechniqueUsage, onSyncStatus } from "./services/productivity-sync.js";
import { secureEarn, secureUnlock, secureStreak, cloudRewards, REWARD_EVENTS } from "./services/rewards-sync.js";
let timerHandle;

let durations = { focus: 1500, short: 300, long: 900 };

export function haltTimer() {
  try {
    clearInterval(timerHandle);
  } catch {
    /* ignore */
  }
  timerHandle = null;
}
function applyDurations() {  const minutes = state.timerMinutes || { focus: 25, short: 5, long: 15 };
  const seconds = state.timerSeconds || { focus: 0, short: 0, long: 0 };
  const toSeconds = (min, sec, fallback) => {
    const m = Number.parseInt(min, 10);
    const s = Number.parseInt(sec, 10);
    const cm = Number.isFinite(m) ? Math.min(180, Math.max(0, m)) : fallback.min;
    const cs = Number.isFinite(s) ? Math.min(59, Math.max(0, s)) : fallback.sec;
    const total = cm * 60 + cs;
    // A 0:00 duration can never start — fall back instead of freezing at zero.
    return total > 0 ? total : fallback.min * 60 + fallback.sec;
  };
  durations = {
    focus: toSeconds(minutes.focus, seconds.focus, { min: 25, sec: 0 }),
    short: toSeconds(minutes.short, seconds.short, { min: 5, sec: 0 }),
    long: toSeconds(minutes.long, seconds.long, { min: 15, sec: 0 }),
  };
  // A joined group challenge prescribes the focus length — joiners run the
  // challenge pace, nothing else, until they leave.
  try {
    const lock = challengeLock();
    if (lock) durations.focus = paceSec(lock);
  } catch {
    /* community module still warming up */
  }
}

export function initTimerState() {
  applyDurations();
  restoreSession();
}

const modeLabels = { focus: "Focus", short: "Short Break", long: "Long Break" };

function recordFocusDay(sessionRef) {
  if (!state.streak || !Array.isArray(state.streak.days)) {
    state.streak = { count: 0, lastDate: "", days: [] };
  }
  const today = dayKey(new Date());
  // Cloud members: the DATABASE owns the streak count (UTC day boundaries,
  // same-day repeats never advance it). Keep the local day-dots + best mirror.
  if (cloudRewards()) {
    if (!state.streak.days.includes(today)) {
      state.streak.days.push(today);
      state.streak.days = state.streak.days.slice(-30);
    }
    // Mark TODAY locally right away. The database is still authoritative for
    // the count, but lastDate anchors same-day repeat detection — leaving it
    // empty until the RPC answered meant the server streak existed while the
    // UI kept reading a zeroed local mirror (the "stuck at 0" bug).
    state.streak.lastDate = today;
    if (state.streak.count < 1) state.streak.count = 1;
    persist();
    try {
      secureStreak(`day:${today}:${sessionRef || "na"}`).then((r) => {
        if (!r || !r.ok) return;
        state.streak.lastDate = today;
        // The server owns the count for cloud members — mirror it locally,
        // otherwise the UI keeps showing a stale/zero streak.
        if (Number.isFinite(+r.current)) state.streak.count = Math.max(1, +r.current);
        if (r.longest > (state.bestStreak || 0)) state.bestStreak = r.longest;
        persist();
        if (r.bonus > 0) {
          notify(`${sicon("fire")} ${r.current}-day streak · +${r.bonus} coins milestone!`);
          celebrate(true);
        }
      }).catch(() => {});
    } catch {
      /* streak sync is best-effort */
    }
    return;
  }
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  if (state.streak.lastDate !== today) {
    if (!state.streak.lastDate || state.streak.lastDate === yesterday) {
      state.streak.count = state.streak.lastDate
        ? state.streak.count + 1
        : 1;
    } else if (state.streak.count > 0 && (state.boosts?.shields || 0) > 0) {
      state.boosts.shields--;
      notify(sicon("shield") + " Streak Shield absorbed a missed day");
    } else {
      state.streak.count = 1;
      wiltNewest();
    }
    state.streak.lastDate = today;
    checkStreakMilestone();
  }
  // A completed session ALWAYS counts as today's activity — belt and braces
  // for the fresh-install case where a cloud mirror or a restored archive
  // produced a structurally valid but zeroed streak.
  if (state.streak.count < 1) state.streak.count = 1;
  if (!state.streak.days.includes(today)) {
    state.streak.days.push(today);
    state.streak.days = state.streak.days.slice(-30);
  }
  if (state.streak.count > (state.bestStreak || 0))
    state.bestStreak = state.streak.count;
  persist();
}

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365];

function checkStreakMilestone() {
  if (!notifOn("streaks")) return;
  const count = state.streak.count;
  if (!STREAK_MILESTONES.includes(count)) return;
  addNotification(
    "Streak milestone",
    `${count}-day focus streak — legendary consistency.`,
    "fire",
  );
  browserNotify(
    `🔥 ${count}-day streak`,
    "Your consistency is compounding. Keep it alive today.",
  );
  notify(`${sicon("fire")} ${count}-day streak!`);
  celebrate(true);
}

const GARDEN_COMMON = [sicon("sprout"), sicon("flower"), sicon("leaf"), sicon("flower"), sicon("flower"), sicon("leaf"), sicon("sprout"), sicon("butterfly")];

const GARDEN_RARE = [sicon("flower"), sicon("flower"), sicon("flower"), sicon("lotus"), sicon("tree"), sicon("leaf")];

const GARDEN_LEGENDARY = [sicon("tree"), sicon("tree"), sicon("flower"), sicon("sprout"), sicon("tree")];

// Rarity tints — the icons themselves are single-color paths, so we paint them.
const RARITY_COLORS = { common: "#7aa684", rare: "#3d7fa8", legendary: "#c98a1f" };

function gardenPlantMarkup(p) {
  const wilted = p.wilted ? " wilted" : "";
  const color = p.wilted ? "" : (RARITY_COLORS[p.rarity] || RARITY_COLORS.common);
  return `<span class="garden-plant${wilted}" title="${p.rarity}${p.wilted ? " · wilted" : ""}" style="${color ? `color:${color};` : ""}${p.rarity === "legendary" && !p.wilted ? "filter:drop-shadow(0 0 6px rgba(201,138,31,.55));" : ""}">${p.wilted ? sicon("flower") : p.emoji}</span>`;
}

function plantFlower() {
  const streak = state.streak.count;
  const pool =
    streak >= 14 ? GARDEN_LEGENDARY : streak >= 7 ? GARDEN_RARE : GARDEN_COMMON;
  const rarity = streak >= 14 ? "legendary" : streak >= 7 ? "rare" : "common";
  const emoji = pool[Math.floor(Math.random() * pool.length)];
  state.garden.push({
    id: uid(),
    emoji,
    rarity,
    plantedAt: Date.now(),
    wilted: false,
  });
  state.garden = state.garden.slice(-60);
  persist();
  return { emoji, rarity };
}

function wiltNewest() {
  const fresh = [...state.garden].reverse().find((p) => !p.wilted);
  if (fresh) fresh.wilted = true;
}

function gardenMarkup() {
  const plants = (state.garden || []).slice(-24);
  const rare = (state.garden || []).filter((p) => p.rarity !== "common").length;
  return `<div class="card" style="margin-top:18px"><div class="section-row"><h2>Focus garden</h2><span class="tag">${state.garden.length} plants${rare ? ` · ${rare} rare+` : ""}</span></div>${plants.length ? `<div class="garden-grid">${plants.map(gardenPlantMarkup).join("")}</div><p class="muted" style="margin-top:10px">Every focus session plants one. Streaks of 7+ grow rares, 14+ grow legends. A broken streak wilts the newest bloom.</p>` : '<p class="muted">Finish a focus session to plant your first seed ' + sicon("sprout") + '</p>'}</div>`;
}

function streakDots() {
  const active = new Set(state.streak?.days || []);
  let out = "";
  for (let i = 6; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86400000));
    out += `<i class="${active.has(key) ? "on" : ""}" title="${key}"></i>`;
  }
  return `<button type="button" class="streak-dots" data-status-open="streak:current" title="Watch status loop">${out}</button>`;
}

function openFocusView() {
  closeFocusView();
  const overlay = document.createElement("div");
  overlay.id = "focus-view";
  overlay.innerHTML = `<div class="eyebrow">${modeLabels[state.mode]} · nothing else</div><div class="timer-ring" style="--progress:${(state.time / durations[state.mode]) * 360}deg"><div><div class="time">${fmt(state.time)}</div><div class="timer-label">${modeLabels[state.mode]}</div></div></div><div class="timer-actions"><button type="button" class="primary" data-toggle>${state.running ? "Pause" : "Start session"}</button></div><button type="button" class="ghost focus-exit" data-focus-exit>${sicon("x")} Exit focus (Esc)</button>`;
  document.body.append(overlay);
  document.body.style.overflow = "hidden";
  $("[data-toggle]", overlay).onclick = () => toggleTimer();
  $("[data-focus-exit]", overlay).onclick = () => closeFocusView();
}

function closeFocusView() {
  $("#focus-view")?.remove();
  try {
    document.body.style.overflow = "";
  } catch {
    /* ignore */
  }
}

function toggleBoss(force) {
  let veil = $("#boss-veil");
  const show = force !== undefined ? force : !veil;
  if (!show) {
    veil?.remove();
    return;
  }
  if (veil) return;
  const firsts = ["Ava", "Liam", "Mia", "Noah", "Zoe", "Eli", "Ada", "Max", "Ivy", "Leo", "Amy", "Sam"];
  const lasts = ["Smith", "Owusu", "Mensah", "Johnson", "Brown", "Garcia", "Kim", "Patel", "Weber", "Silva", "Ng", "Ali"];
  const rows = [];
  for (let r = 0; r < 14; r++) {
    const cells = [`<th>${r + 1}</th>`];
    for (let c = 0; c < 6; c++) {
      cells.push(
        `<td>${c === 0 && r < 12 ? `${firsts[(r + c) % 12]} ${lasts[(r * 3 + c) % 12]}` : (Math.floor(Math.random() * 9000) + 1000).toLocaleString()}</td>`,
      );
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  veil = document.createElement("div");
  veil.id = "boss-veil";
  veil.innerHTML = `<div class="boss-bar"><span>${sicon("chart")} Q3_Report_FINAL_v2.xlsx — Excel</span><span>Press B to return</span></div><div class="boss-sheet"><table><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th></tr>${rows.join("")}</table></div>`;
  document.body.append(veil);
  veil.addEventListener("click", () => toggleBoss(false));
}

function renderTimer() {
  const target = $("#tab-timer");
  target.innerHTML = `${viewHead("Focus desk", "A calm command centre for your next deep-work session.")}<div class="grid two"><div class="card timer-card"><div class="mode-switch">${Object.entries(
    modeLabels,
  )
    .map(
      ([id, label]) =>
        `<button type="button" data-mode="${id}" class="${state.mode === id ? "active" : ""}">${label}</button>`,
    )
    .join(
      "",
    )}</div><div class="template-row">${TIMER_TEMPLATES.map((p) => `<button type="button" class="template-chip" data-template="${p.id}" title="Focus ${p.focus}:${String(p.focusSec ?? 0).padStart(2, "0")} · break ${p.short}:${String(p.shortSec ?? 0).padStart(2, "0")}">${p.name}</button>`).join("")}</div><div class="dur-row"><label class="field-label">Minutes<input class="input dur-input" id="dur-min" type="number" min="0" max="180" step="1" value="${Math.floor(durations[state.mode] / 60)}" aria-label="Custom minutes"></label><label class="field-label">Seconds<input class="input dur-input" id="dur-sec" type="number" min="0" max="59" step="1" value="${durations[state.mode] % 60}" aria-label="Custom seconds"></label><button type="button" class="ghost" data-set-dur title="Apply to ${modeLabels[state.mode]}">Set duration</button></div>${challengeLockBanner()}<div class="focus-live off" data-focus-live><span class="live-dot"></span>Focus live — leaving this page resets the session</div>${techTagMarkup()}<div class="timer-ring" style="--progress:${(state.time / durations[state.mode]) * 360}deg"><div><div class="time">${fmt(state.time)}</div><div class="timer-label">${modeLabels[state.mode]}</div></div></div><div class="timer-actions"><button type="button" class="icon-btn" data-reset title="Reset">↻</button><button type="button" class="primary" data-toggle>${state.running ? "Pause" : "Start session"}</button><button type="button" class="icon-btn" data-focusview title="Focus mode — just the timer">${sicon("expand")}</button></div><div class="muted" style="margin-top:36px">${state.sessions % 4}/4 sessions until a long break</div></div><div class="card tasks-card"><div class="section-row"><h2>Today’s tasks</h2><span class="tag" data-task-count>${state.tasks.filter((t) => t.done).length}/${state.tasks.length} complete</span><span class="sync-pill" data-sync-pill hidden></span></div><div class="input-row"><input class="input" id="task-input" placeholder="What are you working on?"><button type="button" class="primary" data-add-task>+</button></div><div id="task-list">${state.tasks.length ? state.tasks.map(taskRow).join("") : '<p class="muted" style="padding:25px 0">Your task list is clear. Add one small next step.</p>'}</div></div></div><div class="grid four stats"><div class="card stat"><span>Sessions</span><strong>${state.sessions}</strong><span>all time</span></div><div class="card stat"><span>Coins</span><strong data-coin="stat">${state.coins}</strong><span>available to spend</span></div><div class="card stat"><span>Tasks</span><strong>${state.tasks.filter((t) => t.done).length}</strong><span>completed</span></div><div class="card stat"><span>Focus streak</span><strong>${state.streak.count}</strong>${streakDots()}<span>day streak</span></div></div>${missionDeskMarkup()}${techOfDayMarkup()}${gardenMarkup()}${recordsMarkup()}${achievementsCabinetMarkup()}${masteryLadderMarkup()}`;
  $$("[data-mode]", target).forEach(
    (b) =>
      (b.onclick = () => {
        const next = b.dataset.mode;
        // The global session is never paused, reset or replaced by
        // switching modes — navigation only changes what is displayed.
        if (next !== state.mode && sessionInProgress()) {
          notify(
            `A ${modeLabels[state.mode]} session is in progress — it keeps running. Reset it to switch modes.`,
          );
          return;
        }
        state.mode = next;
        state.time = durations[next];
        state.sessionDuration = durations[next];
        state.running = false;
        state.endsAt = null;
        state.sessionTech = null;
        state.sprintSession = null;
        persist();
        renderTimer();
      }),
  );
  $("[data-toggle]", target).onclick = () => toggleTimer();
  const focusBtn = $("[data-focusview]", target);
  if (focusBtn) focusBtn.onclick = () => openFocusView();
  const untag = $("[data-untag]", target);
  if (untag)
    untag.onclick = () => {
      state.sessionTech = null;
      persist();
      renderTimer();
      renderMiniTimer();
    };
  $$("[data-template]", target).forEach(
    (b) =>
      (b.onclick = () => {
        const t = TIMER_TEMPLATES.find((x) => x.id === b.dataset.template);
        if (t) applyTemplate(t);
      }),
  );
  $("[data-set-dur]", target).onclick = () => applyCustomDuration(target);
  bindWinActions(target);
  bindMissionDesk(target);
  try {
    if (challengeLock()) {
      target.querySelectorAll('[data-template], #dur-min, #dur-sec, [data-set-dur]').forEach((el) => {
        el.disabled = true;
        el.title = "Locked by your group challenge — leave it to change";
      });
    }
  } catch {
    /* ignore */
  }
  $$("[data-challenge-leave]", target).forEach(
    (b) =>
      (b.onclick = () => {
        if (sessionInProgress()) {
          notify("Reset your running session first, then leave");
          return;
        }
        leaveChallenge(b.dataset.challengeLeave);
        applyDurations();
        state.mode = "focus";
        state.time = durations.focus;
        state.sessionDuration = durations.focus;
        state.running = false;
        state.endsAt = null;
        persist();
        renderTimer();
        renderMiniTimer();
        notify("Challenge left — timer is yours again");
      }),
  );
  try {
    if (window.__sfMissionTick) clearInterval(window.__sfMissionTick);
    if (target.querySelector("[data-mission-cd]")) {
      window.__sfMissionTick = setInterval(() => {
        if (state.tab !== "timer" || !document.querySelector("[data-mission-cd]")) return;
        updateTimerDom();
      }, 1000);
    }
  } catch {
    /* ignore */
  }
  const todayTech = $("[data-today-tech]", target);
  if (todayTech)
    // "Try it" takes you to the technique's full guide in the Techniques tab
    // (steps, mistakes, pads and its own "Set up my timer" button) instead of
    // silently reconfiguring the timer from behind your back.
    todayTech.onclick = () => openTechniqueGuide(todayTech.dataset.todayTech);
  $("[data-reset]", target).onclick = () => {
    clearInterval(timerHandle);
    state.time = durations[state.mode];
    state.sessionDuration = durations[state.mode];
    state.running = false;
    state.endsAt = null;
    state.sessionTech = null;
    state.sprintSession = null;
    persist();
    renderTimer();
    renderMiniTimer();
  };
  $("[data-add-task]", target).onclick = addTask;
  $("#task-input", target).onkeydown = (e) => {
    if (e.key === "Enter") addTask();
  };
  // Live sync status beside the task count (saving / saved / offline).
  try {
    const pill = $("[data-sync-pill]", target);
    if (pill)
      onSyncStatus((key, status) => {
        if (key !== "tasks") return;
        const label =
          status === "saving"
            ? "Saving…"
            : status === "loading"
              ? "Syncing…"
              : status === "error"
                ? "Saved on this device"
                : "";
        pill.textContent = label;
        pill.dataset.state = status;
        pill.hidden = !label;
      });
  } catch {
    /* status pill is cosmetic */
  }
  $$("[data-task-check]", target).forEach(
    (b) =>
      (b.onclick = () => {
        const t = state.tasks.find((t) => t.id === b.dataset.taskCheck);
        if (!t) return;
        t.done = !t.done;
        t.updated = Date.now();
        persist();
        mirrorTasks();
        if (t.done) {
          // One reward per completion state: unchecking + rechecking moves
          // `updated`, so only genuinely new completions pay.
          try {
            secureEarn({
              amount: REWARD_EVENTS.task_complete,
              reason: "Task completed",
              refKey: `task:${t.id}:${t.updated}`,
            }).catch(() => {});
          } catch {
            /* reward is best-effort */
          }
        }
        const row = target.querySelector(`[data-task-row="${t.id}"]`);
        if (row) row.classList.toggle("done", t.done);
        b.classList.toggle("done", t.done);
        b.setAttribute("aria-pressed", String(t.done));
        b.setAttribute("aria-label", t.done ? "Mark as not done" : "Mark as done");
        b.title = t.done ? "Mark as not done" : "Mark as done";
        const count = $("[data-task-count]", target);
        if (count)
          count.textContent = `${state.tasks.filter((x) => x.done).length}/${state.tasks.length} complete`;
      }),
  );
  $$("[data-edit-task]", target).forEach(
    (b) => (b.onclick = () => openTaskEditor(b.dataset.editTask)),
  );
  $$("[data-delete-task]", target).forEach(
    (b) =>
      (b.onclick = () =>
        confirmBox(
          "Remove task?",
          "Are you sure you want to remove this task?",
          () => {
            const id = b.dataset.deleteTask;
            state.tasks = state.tasks.filter((t) => t.id !== id);
            persist();
            deleteTaskEverywhere(id); // cloud delete (queued if offline)
            renderTimer();
          },
        )),
  );
}

function focusScore() {
  return Math.max(0, 100 - (state.distractions || 0) * 8);
}

function scoreGrade(s) {
  if (s >= 95) return "Locked in " + sicon("lock");
  if (s >= 85) return "Deep work " + sicon("brain");
  if (s >= 70) return "Solid " + sicon("strong");
  if (s >= 50) return "Drifty " + sicon("wave");
  return "Stormy " + sicon("storm");
}

const ACHIEVEMENTS = [
  { id: "first", icon: "sprout", emoji: sicon("sprout"), name: "First Session", desc: "Finish your very first focus session.", progress: () => ({ have: Math.min(state.sessions, 1), need: 1 }) },
  { id: "ten", icon: "star", emoji: sicon("ten"), name: "Ten Stack", desc: "Complete 10 focus sessions.", progress: () => ({ have: Math.min(state.sessions, 10), need: 10 }) },
  { id: "fifty", icon: "strong", emoji: sicon("strong"), name: "Fifty Strong", desc: "Complete 50 focus sessions.", progress: () => ({ have: Math.min(state.sessions, 50), need: 50 }) },
  { id: "hundred", icon: "medal", emoji: sicon("hundred"), name: "Century Club", desc: "Complete 100 focus sessions.", progress: () => ({ have: Math.min(state.sessions, 100), need: 100 }) },
  { id: "streak7", icon: "fire", emoji: sicon("fire"), name: "Week Warrior", desc: "Grow a 7-day focus streak.", progress: () => ({ have: Math.min(Math.max(state.streak.count, state.bestStreak || 0), 7), need: 7 }) },
  { id: "streak30", icon: "bolt", emoji: sicon("comet"), name: "Unstoppable", desc: "Grow a 30-day focus streak.", progress: () => ({ have: Math.min(Math.max(state.streak.count, state.bestStreak || 0), 30), need: 30 }) },
  { id: "hours10", icon: "timer", emoji: sicon("timer"), name: "10 Hours Deep", desc: "Accumulate 10 hours of total focus.", progress: () => ({ have: Math.min(state.totalFocusMin, 600), need: 600, suffix: "m" }) },
  { id: "hours50", icon: "mountain", emoji: sicon("mountain"), name: "50 Hours Deep", desc: "Accumulate 50 hours of total focus.", progress: () => ({ have: Math.min(state.totalFocusMin, 3000), need: 3000, suffix: "m" }) },
  { id: "hours100", icon: "crown", emoji: sicon("crown"), name: "Century Hours", desc: "Accumulate 100 hours of total focus.", progress: () => ({ have: Math.min(state.totalFocusMin, 6000), need: 6000, suffix: "m" }) },
  { id: "marathon", icon: "run", emoji: sicon("run"), name: "Marathon Day", desc: "Focus 120+ minutes in a single day.", progress: () => ({ have: Math.min(biggestDay(), 120), need: 120, suffix: "m" }) },
];

// MASTERY LADDER — Master → Grandmaster → Mythic → Legendary. These badges
// are NEVER sold, boxed, or gifted: they unlock only through brutal,
// months-long feats. Each entry carries its badge item definition so the
// unlock can grant it straight into the owned collection.
const MASTERY_LADDER = [
  {
    id: "master-focus", icon: "gem", emoji: sicon("gem"), tier: "Master",
    name: "Master of Focus",
    desc: "Complete 250 focus sessions. Months of showing up.",
    progress: () => ({ have: Math.min(state.sessions, 250), need: 250 }),
    badge: { id: "master-focus", name: "Master of Focus badge", category: "Badges", emoji: sicon("gem"), price: 0, description: "Earned through 250 focus sessions. Never sold.", tier: "Master", unbuyable: true },
  },
  {
    id: "grandmaster-resolve", icon: "crown", emoji: sicon("crown"), tier: "Grandmaster",
    name: "Grandmaster's Resolve",
    desc: "Reach a 60-day focus streak. Two relentless months.",
    progress: () => ({ have: Math.min(Math.max(state.streak.count, state.bestStreak || 0), 60), need: 60 }),
    badge: { id: "grandmaster-resolve", name: "Grandmaster's Resolve badge", category: "Badges", emoji: sicon("crown"), price: 0, description: "Earned through a 60-day streak. Never sold.", tier: "Grandmaster", unbuyable: true },
  },
  {
    id: "mythic-mind", icon: "planet", emoji: sicon("planet"), tier: "Mythic",
    name: "Mythic Mind",
    desc: "Accumulate 500 hours of total focus. A legend in the making.",
    progress: () => ({ have: Math.min(state.totalFocusMin, 30000), need: 30000, suffix: "m" }),
    badge: { id: "mythic-mind", name: "Mythic Mind badge", category: "Badges", emoji: sicon("planet"), price: 0, description: "Earned through 500 hours of focus. Never sold.", tier: "Mythic", unbuyable: true },
  },
  {
    id: "living-legend", icon: "trophy", emoji: sicon("trophy"), tier: "Legendary",
    name: "Living Legend",
    desc: "Reach a 365-day focus streak. Immortality, earned daily.",
    progress: () => ({ have: Math.min(Math.max(state.streak.count, state.bestStreak || 0), 365), need: 365 }),
    badge: { id: "living-legend", name: "Living Legend badge", category: "Badges", emoji: sicon("trophy"), price: 0, description: "Earned through a 365-day streak. Never sold.", tier: "Legendary", unbuyable: true },
  },
];

function masteryLadderMarkup() {
  const earned = MASTERY_LADDER.filter((m) => (state.achievements || []).includes(m.id));
  return `<div class="card mastery-ladder" style="margin-top:18px"><div class="section-row"><h2>${sicon("crown")} Mastery ladder</h2><span class="tag">${earned.length}/${MASTERY_LADDER.length} claimed</span></div><p class="muted">Four badges money can't buy — each one demands months of proof. Past bests count, so nothing you've already done is wasted.</p><div class="ladder">${MASTERY_LADDER.map((m, i) => {
    const isEarned = (state.achievements || []).includes(m.id);
    const p = achievementProgress(m);
    const pct = p ? Math.min(100, Math.round((p.have / p.need) * 100)) : 0;
    return `<div class="ladder-rung${isEarned ? " earned" : ""}${i === MASTERY_LADDER.length - 1 ? " final" : ""}"><span class="ladder-node tier-${m.tier.toLowerCase()}">${m.emoji}</span><div class="ladder-body"><div class="section-row"><strong>${esc(m.name)}</strong><span class="tag rarity-${m.tier.toLowerCase()}">${esc(m.tier)}</span></div><small class="muted">${esc(m.desc)}</small>${isEarned ? `<span class="tag">claimed ${sicon("check")}</span>` : p ? `<div class="crew-track slim"><span class="crew-fill" style="width:${pct}%"></span></div><small class="muted">${p.have}/${p.need}${p.suffix} · ${pct}%</small>` : ""}<span class="tag unbuyable-tag">never sold · earn only</span></div></div>`;
  }).join("")}</div></div>`;
}

function checkMasteryLadder() {
  let changed = false;
  MASTERY_LADDER.forEach((m) => {
    if ((state.achievements || []).includes(m.id)) return;
    const p = achievementProgress(m);
    if (!(p && p.have >= p.need)) return;
    state.achievements.push(m.id);
    changed = true;
    // Grant the badge item straight into the owned collection (deduped), so
    // it appears on the Badge shelf and can be showcased immediately.
    if (!(state.owned || []).some((o) => o && o.id === m.badge.id)) {
      state.owned = [...(state.owned || []), { ...m.badge, owner: "me", boughtAt: Date.now() }];
    }
    addNotification("Mastery claimed", m.name, m.icon || "crown");
    celebrate(false);
    notify(`${m.emoji} MASTERY CLAIMED: ${m.name}!`);
    if (cloudRewards()) {
      try {
        secureUnlock(m.id).catch(() => {});
      } catch {
        /* unlock sync is best-effort */
      }
    }
  });
  if (changed) persist();
}

function achievementProgress(a) {
  try {
    const p = a.progress ? a.progress() : null;
    if (!p || !Number.isFinite(+p.have) || !Number.isFinite(+p.need) || +p.need <= 0)
      return null;
    return { have: Math.max(0, Math.round(+p.have)), need: Math.round(+p.need), suffix: p.suffix || "" };
  } catch {
    return null;
  }
}

function achievementsCabinetMarkup() {
  const earned = ACHIEVEMENTS.filter((a) => (state.achievements || []).includes(a.id));
  return `<div class="card ach-cabinet" style="margin-top:18px"><div class="section-row"><h2>${sicon("trophy")} Achievement cabinet</h2><span class="tag">${earned.length}/${ACHIEVEMENTS.length} unlocked</span></div><p class="muted">Every badge below is earnable right inside your focus flow — here's exactly how.</p><div class="ach-grid">${ACHIEVEMENTS.map((a) => {
    const isEarned = (state.achievements || []).includes(a.id);
    const p = achievementProgress(a);
    const pct = p ? Math.min(100, Math.round((p.have / p.need) * 100)) : 0;
    return `<div class="ach-tile${isEarned ? " earned" : " locked"}"><span class="ach-tile-ico">${a.emoji}</span><div><strong>${esc(a.name)}</strong><small>${esc(a.desc)}</small>${isEarned ? `<span class="tag">unlocked ${sicon("check")}</span>` : p ? `<div class="crew-track slim"><span class="crew-fill" style="width:${pct}%"></span></div><small class="muted">${p.have}/${p.need}${p.suffix} · ${pct}%</small>` : ""}</div></div>`;
  }).join("")}</div></div>`;
}

function checkAchievements() {
  let changed = false;
  ACHIEVEMENTS.forEach((a) => {
    if ((state.achievements || []).includes(a.id)) return;
    // Achievements define progress() (have/need), not test() — unlock when
    // progress reaches the goal.
    const p = achievementProgress(a);
    const earned = Boolean(p && p.have >= p.need);
    if (earned) {
      state.achievements.push(a.id);
      changed = true;
      addNotification("Achievement unlocked", a.name, a.icon || "medal");
      celebrate(false);
      notify(`${a.emoji} Achievement unlocked: ${a.name}!`);
      // Cloud members: the unlock + its coin reward are recorded
      // idempotently server-side (unique user+achievement, one ledger row).
      if (cloudRewards()) {
        try {
          secureUnlock(a.id).catch(() => {});
        } catch {
          /* unlock sync is best-effort */
        }
      }
    }
  });
  // Mastery ladder runs on the same beat — brutal feats checked every session.
  checkMasteryLadder();
  if (changed) persist();
}

function saveAccomplishment() {
  const input = $("#accomp-input");
  const text = input?.value.trim();
  if (!text) return;
  state.focusLog.unshift({
    id: uid(),
    text,
    at: Date.now(),
    mins: Math.max(1, Math.round((state.sessionDuration || 0) / 60)),
  });
  state.focusLog = state.focusLog.slice(-100);
  persist();
}

const TIMER_TEMPLATES = [
  { id: "classic", name: "Classic 25/5", focus: 25, focusSec: 0, short: 5, shortSec: 0 },
  { id: "exam", name: "Exam 50/10", focus: 50, focusSec: 0, short: 10, shortSec: 0 },
  { id: "quick", name: "Quick 15/3", focus: 15, focusSec: 0, short: 3, shortSec: 0 },
  { id: "deep", name: "Deep 90/20", focus: 90, focusSec: 0, short: 20, shortSec: 0 },
];

function applyTemplate(t) {
  try {
    if (challengeLock()) {
      notify("Challenge lock — your focus length is set by the race. Leave it to switch.");
      return;
    }
  } catch {
    /* ignore */
  }
  if (sessionInProgress()) {
    notify("A session is in progress — reset it to switch templates.");
    return;
  }
  const clampMin = (v, fb) =>
    Number.isFinite(+v) ? Math.min(180, Math.max(0, +v)) : fb;
  const clampSec = (v, fb) =>
    Number.isFinite(+v) ? Math.min(59, Math.max(0, +v)) : fb;
  state.timerMinutes = {
    focus: clampMin(t.focus, 25),
    short: clampMin(t.short, 5),
    long: (state.timerMinutes || {}).long ?? 15,
  };
  state.timerSeconds = {
    focus: clampSec(t.focusSec, 0),
    short: clampSec(t.shortSec, 0),
    long: (state.timerSeconds || {}).long ?? 0,
  };
  applyDurations();
  state.mode = "focus";
  state.time = durations.focus;
  state.sessionDuration = durations.focus;
  state.running = false;
  state.endsAt = null;
  state.sessionTech = null;
  persist();
  renderTimer();
  notify(`${t.name} set — press Start when ready`);
}

function applyCustomDuration(root) {
  try {
    if (challengeLock()) {
      notify("Challenge lock — your focus length is set by the race. Leave it to change.");
      return;
    }
  } catch {
    /* ignore */
  }
  if (sessionInProgress()) {
    notify("A session is in progress — reset it to change the duration.");
    return;
  }
  const mode = state.mode;
  const rawMin = Number.parseInt($("#dur-min", root)?.value, 10);
  const rawSec = Number.parseInt($("#dur-sec", root)?.value, 10);
  if (!Number.isFinite(rawMin) || rawMin < 0 || rawMin > 180) {
    notify("Minutes must be a number between 0 and 180.");
    return;
  }
  if (!Number.isFinite(rawSec) || rawSec < 0 || rawSec > 59) {
    notify("Seconds must be a number between 0 and 59.");
    return;
  }
  if (rawMin === 0 && rawSec === 0) {
    notify("Duration can't be 0:00 — set at least 1 second.");
    return;
  }
  state.timerMinutes = { ...(state.timerMinutes || {}), [mode]: rawMin };
  state.timerSeconds = { ...(state.timerSeconds || {}), [mode]: rawSec };
  applyDurations();
  state.time = durations[mode];
  state.sessionDuration = durations[mode];
  state.running = false;
  state.endsAt = null;
  persist();
  renderTimer();
  renderMiniTimer();
  // Quiet confirmation: a non-blocking toast. A blocking "OK" dialog for a
  // routine save made the user dismiss a popup every single time.
  toast(`${modeLabels[mode]} set to ${fmt(durations[mode])} — press Start when ready`);
}

function restoreSession() {
  const saved = get("sf-session", null);
  const validMode = saved && modeLabels[saved.mode] ? saved.mode : "focus";
  if (saved && typeof saved.time === "number" && (saved.running || saved.time > 0)) {
    state.mode = validMode;
    state.sessionDuration = saved.duration || durations[validMode];
    if (saved.running && saved.endsAt) {
      // Returning visitor: derive the true remaining time from the
      // timestamp so throttled/closed periods stay accurate. Breaks
      // resume; a focus session left running is void and resets —
      // leaving the page ends it, exactly like switching browser tabs.
      const elapsed = Math.round((saved.endsAt - Date.now()) / 1000);
      if (validMode === "focus") {
        state.time = state.sessionDuration;
        state.running = false;
        state.endsAt = null;
      } else if (elapsed <= 0) {
        state.time = 0;
        state.running = false;
        state.endsAt = null;
        completeSession();
      } else {
        state.time = Math.min(elapsed, state.sessionDuration);
        state.running = true;
        state.endsAt = saved.endsAt;
        startTick();
      }
    } else {
      state.time = Math.min(Math.max(0, saved.time), state.sessionDuration);
      state.running = false;
      state.endsAt = null;
    }
  } else {
    state.mode = validMode === saved?.mode ? validMode : state.mode;
    state.sessionDuration = durations[state.mode];
    state.time = durations[state.mode];
    state.running = false;
    state.endsAt = null;
  }
}

function techniqueOfDay() {
  const day = Math.floor(Date.now() / 86400000);
  return techniques[day % techniques.length];
}

function techOfDayMarkup() {
  const x = techniqueOfDay();
  const details = TECH_DETAILS[x[0]] || {};
  return `<div class="card tech-day" style="margin-top:18px"><div class="section-row"><h2>${sicon("sun")} Technique of the day</h2><span class="tag tech-day-tag">today's pick</span></div><div class="tech-day-body"><span class="tech-day-ico" aria-hidden="true">${x[2]}</span><div class="tech-day-copy"><strong>${x[1]}</strong><span class="muted">${esc(x[3])}</span><span class="tech-day-meta">${details.category ? `${esc(details.category)} · ` : ""}${esc(x[4])}</span></div><button type="button" class="primary tech-day-btn" data-today-tech="${x[0]}" title="Opens the full ${esc(x[1])} guide in the Techniques tab">Read &amp; try it →</button></div></div>`;
}

function biggestDay() {
  return Math.max(0, ...Object.values(state.focusDays || {}));
}

function recordsMarkup() {
  const hours = Math.floor((state.totalFocusMin || 0) / 60);
  const mins = (state.totalFocusMin || 0) % 60;
  const earned = ACHIEVEMENTS.filter((a) =>
    (state.achievements || []).includes(a.id),
  );
  const locked = ACHIEVEMENTS.filter(
    (a) => !(state.achievements || []).includes(a.id),
  );
  const wins = (state.focusLog || []).slice(0, 5);
  return `<div class="grid two" style="margin-top:18px"><div class="card"><div class="section-row"><h2>Records</h2><span class="tag">all time</span></div><div class="records-grid"><div><strong>${state.bestStreak || 0}${sicon("fire")}</strong><span>longest streak</span></div><div><strong>${biggestDay()}m</strong><span>biggest day</span></div><div><strong>${hours}h ${mins}m</strong><span>total focus</span></div><div><strong>${state.sessions}</strong><span>sessions</span></div></div><div class="section-row" style="margin-top:14px"><h3>Achievements</h3><span class="tag">${earned.length}/${ACHIEVEMENTS.length}</span></div><div class="ach-row">${earned.map((a) => `<span class="ach earned" title="${esc(a.name)}">${a.emoji}</span>`).join("")}${locked.map((a) => `<span class="ach locked" title="${esc(a.name)} — locked">${a.emoji}</span>`).join("")}</div></div><div class="card"><div class="section-row"><h2>Win journal</h2><span class="tag">${(state.focusLog || []).length}</span></div>${wins.length ? wins.map((w) => `<div class="win-row"><span>${sicon("check")}</span><div><p data-win-text="${w.id}">${esc(w.text)}</p><small class="muted">${new Date(w.at).toLocaleDateString()} · ${w.mins}m focus</small></div><span class="win-actions"><button type="button" class="icon-btn" data-win-edit="${w.id}" title="Edit win" aria-label="Edit win">${sicon("memo")}</button><button type="button" class="icon-btn" data-win-copy="${w.id}" title="Copy win" aria-label="Copy win">${sicon("clip")}</button><button type="button" class="icon-btn" data-win-del="${w.id}" title="Delete win" aria-label="Delete win">${sicon("trash")}</button></span></div>`).join("") : '<p class="muted">After each focus session, note one win. Future-you will thank you on hard days.</p>'}</div></div>`;
}

function findWin(id) {
  return (state.focusLog || []).find((w) => w.id === id);
}

function editWin(id) {
  const win = findWin(id);
  if (!win) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Win journal</div><h2>Edit win</h2><textarea class="textarea" data-win-input rows="3" maxlength="600">${esc(win.text)}</textarea><p class="st-confirm-err" data-win-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-win-cancel>Cancel</button><button type="button" class="primary" data-win-save>Save</button></div></div>`;
  $("#modal-root").append(modal);
  const ta = modal.querySelector("[data-win-input]");
  ta.focus();
  ta.selectionStart = ta.value.length;
  const close = () => modal.remove();
  modal.querySelector("[data-win-cancel]").onclick = close;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  modal.querySelector("[data-win-save]").onclick = () => {
    const text = ta.value.trim();
    if (!text) {
      const err = modal.querySelector("[data-win-err]");
      err.textContent = "The win cannot be empty — delete it instead.";
      err.hidden = false;
      return;
    }
    win.text = text;
    win.editedAt = Date.now();
    persist();
    close();
    notify("Win updated " + sicon("check"));
    renderTimer();
  };
  ta.onkeydown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) modal.querySelector("[data-win-save]").click();
  };
}

async function copyWin(id) {
  const win = findWin(id);
  if (!win) return;
  const text = `🏆 ${win.text} (${new Date(win.at).toLocaleDateString()} · ${win.mins}m focus)`;
  try {
    await navigator.clipboard.writeText(text);
    notify("Win copied to clipboard " + sicon("check"));
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { document.execCommand("copy"); notify("Win copied to clipboard " + sicon("check")); } catch { notify("Could not copy — select the text manually"); }
    ta.remove();
  }
}

function deleteWin(id) {
  const win = findWin(id);
  if (!win) return;
  confirmBox(
    `Delete this win?`,
    esc(win.text.slice(0, 140)),
    () => {
      state.focusLog = (state.focusLog || []).filter((w) => w.id !== id);
      persist();
      notify("Win deleted");
      renderTimer();
    },
    { eyebrow: "Win journal", yesLabel: "Delete", noLabel: "Keep it" },
  );
}

function bindWinActions(target) {
  $$("[data-win-edit]", target).forEach((b) => (b.onclick = () => editWin(b.dataset.winEdit)));
  $$("[data-win-copy]", target).forEach((b) => (b.onclick = () => copyWin(b.dataset.winCopy)));
  $$("[data-win-del]", target).forEach((b) => (b.onclick = () => deleteWin(b.dataset.winDel)));
}

function techTagMarkup() {
  if (!state.sessionTech) return "";
  const x = techniques.find((y) => y[0] === state.sessionTech);
  if (!x) return "";
  return `<div class="tech-tag"><span>${x[2]} Focusing with ${esc(x[1])}</span><button type="button" class="tech-untag" data-untag title="Remove tag">×</button></div>`;
}

function toggleTimer() {
  if (state.running) {
    pauseTimer();
  } else {
    startTimer();
  }
  persist();
  updateTimerDom();
  renderMiniTimer();
}

function startTimer() {
  if (state.time <= 0) {
    state.sessionDuration = durations[state.mode];
    state.time = durations[state.mode];
  }
  if (!state.sessionDuration) state.sessionDuration = durations[state.mode];
  state.running = true;
  if (state.time >= (state.sessionDuration || 0)) {
    state.distractions = 0;
    state.lastScore = null;
    // Fresh session = fresh idempotency key for its completion reward.
    if (state.mode === "focus") state.sessionId = uid();
  }
  // Timestamp-based: remaining time is derived from endsAt, so the session
  // stays accurate even when the browser throttles inactive tabs.
  state.endsAt = Date.now() + state.time * 1000;
  // Warm the completion chime + notification permission off this tap,
  // since browsers gate audio/notifications behind user gestures.
  warmAudio();
  ensureNotifyPermission();
  startTick();
  applyLinkToTimer();
}

function pauseTimer() {
  if (state.endsAt) {
    state.time = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
  }
  state.running = false;
  state.endsAt = null;
  clearInterval(timerHandle);
}

function startTick() {
  clearInterval(timerHandle);
  timerHandle = setInterval(tickTimer, 500);
}

function tickTimer() {
  if (!state.running || !state.endsAt) return;
  state.time = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
  if (state.time <= 0) {
    completeSession();
    return;
  }
  updateTimerDom();
}

function completeSession() {
  clearInterval(timerHandle);
  state.time = 0;
  state.running = false;
  state.endsAt = null;
  if (state.mode === "focus") {
    state.sessions++;
    recordFocusDay(state.sessionId);
    if (state.sessionTech) {
      const tagged = state.sessionTech;
      state.techStats = {
        ...(state.techStats || {}),
        [tagged]: ((state.techStats || {})[tagged] || 0) + 1,
      };
      state.techTime = {
        ...(state.techTime || {}),
        [tagged]:
          ((state.techTime || {})[tagged] || 0) + (state.sessionDuration || 0),
      };
      mirrorTechniqueUsage();
      state.sessionTech = null;
    }
    const focusedMin = Math.max(
      1,
      Math.round((state.sessionDuration || 0) / 60),
    );
    logFocusDay(focusedMin);
    progressChallenges(focusedMin);
    if (state.sprintSession) {
      const sp = (state.sprints || []).find(
        (s) => s.id === state.sprintSession,
      );
      if (sp)
        sp.result = { status: "done", focusedMin, at: Date.now() };
      state.sprintSession = null;
    }
    const streakBonus = 2 * state.streak.count;
    let reward = 10 + streakBonus;
    const extras = [];
    if ((state.boosts?.multiplierUntil || 0) > Date.now()) {
      reward = Math.round(reward * 1.25);
      extras.push("multiplier");
    } else if (state.boosts) {
      state.boosts.multiplierUntil = 0;
    }
    if (state.boosts?.doubleArmed) {
      reward *= 2;
      state.boosts.doubleArmed = false;
      extras.push("doubled");
    }
    state.lastReward = reward;
    state.lastScore = focusScore();
    state.totalFocusMin += Math.max(
      1,
      Math.round((state.sessionDuration || 0) / 60),
    );
    plantFlower();
    checkAchievements();
    // Idempotent earn: the same session id can never pay twice, even if this
    // handler re-fires or the offline queue replays it after reconnect.
    try {
      secureEarn({
        amount: reward,
        reason: "Focus session complete",
        refKey: `focus:${state.sessionId || "legacy"}:${state.sessions}`,
        metadata: { sessions: state.sessions, streak: state.streak?.count || 0 },
      }).then((r) => {
        if (r && !r.ok && r.error) notify(r.error);
      }).catch(() => {});
    } catch {
      addCoins(reward);
    }
    addNotification(
      "Focus session complete",
      `You earned ${reward} coins (includes ${streakBonus} streak bonus${extras.length ? ` · ${extras.join(" · ")}` : ""}) for showing up and doing the work.`,
      "timer",
    );
    notify(
      `Session complete · +${reward} coins ${sicon("fire")} ${state.streak.count}-day streak`,
    );
    if (notifOn("completion")) {
      playChime("focus");
      browserNotify(
        "🎉 Focus complete",
        "Beautiful work — time for a well-earned break.",
      );
    }
    persist();
    updateTimerDom();
    renderMiniTimer();
    // Repaint the desk so the streak/stat cards reflect the session that
    // just completed — the completion card floats above stale numbers
    // otherwise ("1-day streak" on the card, 0 on the wall behind it).
    if (state.tab === "timer") renderTimer();
    showCompletionCard("focus");
    celebrate(true);
    return;
  }
  if (notifOn("completion")) {
    playChime("break");
    browserNotify("Break over", "Refreshed? Let's get back to focus.");
  }
  persist();
  updateTimerDom();
  renderMiniTimer();
  showCompletionCard("break");
}

const BREAK_IDEAS = [
  "Stretch tall like a tree " + sicon("tree"),
  "Drink a full glass of water " + sicon("drop"),
  "Look 20 feet away for 20 seconds " + sicon("eyes"),
  "Roll your shoulders 10 times " + sicon("strong"),
  "Step outside for fresh air " + sicon("sun"),
  "Shake out your hands " + sicon("hand"),
  "Take 5 slow breaths " + sicon("wind"),
  "Tidy one small thing " + sicon("sparkle"),
];

function randomBreakIdea() {
  return BREAK_IDEAS[Math.floor(Math.random() * BREAK_IDEAS.length)];
}

function armAutoStart(overlay, btn) {
  let n = 5;
  const base = btn.textContent;
  btn.textContent = `${base} (${n})`;
  const tick = setInterval(() => {
    if (state.running) {
      clearInterval(tick);
      overlay.remove();
      return;
    }
    n--;
    if (n <= 0) {
      clearInterval(tick);
      btn.click();
      return;
    }
    if (document.body.contains(btn)) btn.textContent = `${base} (${n})`;
  }, 1000);
  return tick;
}

function showCompletionCard(kind) {
  const root = $("#modal-root");
  if (!root) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  if (kind === "focus") {
    const suggestLong = state.sessions % 4 === 0;
    const next = suggestLong ? "long" : "short";
    const mins = Math.round(durations[next] / 60);
    overlay.innerHTML = `<div class="modal complete-card"><div class="complete-emoji">${sicon("party")}</div><div class="eyebrow">Focus session complete</div><h2>Beautiful work.</h2><p class="muted">+${state.lastReward || 10 + 2 * state.streak.count} coins earned · ${state.sessions} total sessions · ${state.streak.count}-day streak</p><div class="score-line"><strong>${state.lastScore ?? 100}</strong><span> · ${scoreGrade(state.lastScore ?? 100)}</span></div><input class="input" id="accomp-input" placeholder="What did you accomplish? (optional)" aria-label="What did you accomplish" style="margin-top:12px"><div class="modal-actions" style="justify-content:center;margin-top:18px"><button type="button" class="ghost" data-complete-close>Back to desk</button><button type="button" class="primary" data-complete-next>Start ${mins}-min ${next === "long" ? "long break" : "break"}</button></div></div>`;
    root.append(overlay);
    let overlayAuto = null;
    $("[data-complete-close]", overlay).onclick = () => {
      clearInterval(overlayAuto);
      saveAccomplishment();
      overlay.remove();
    };
    $("[data-complete-next]", overlay).onclick = () => {
      clearInterval(overlayAuto);
      saveAccomplishment();
      state.mode = next;
      state.time = durations[next];
      state.sessionDuration = durations[next];
      overlay.remove();
      startTimer();
      persist();
      updateTimerDom();
      shell();
      notify(`${modeLabels[next]} started — relax`);
    };
    if (state.autostart?.breaks)
      overlayAuto = armAutoStart(overlay, $("[data-complete-next]", overlay));
    return;
  }
  const mins = Math.round(durations.focus / 60);
  overlay.innerHTML = `<div class="modal complete-card"><div class="complete-emoji">${sicon("bolt")}</div><div class="eyebrow">${modeLabels[state.mode]} over</div><h2>Feeling refreshed?</h2><p class="muted">Your next focus session is a ${mins}-minute sprint away.</p><p class="muted" data-break-idea style="margin-top:10px">Try this break: <strong>${randomBreakIdea()}</strong></p><div class="modal-actions" style="justify-content:center;margin-top:18px"><button type="button" class="ghost" data-break-spin>${sicon("wheel")} Spin idea</button><button type="button" class="ghost" data-complete-close>Back to desk</button><button type="button" class="primary" data-complete-next>Start ${mins}-min focus</button></div></div>`;
  root.append(overlay);
  $("[data-break-spin]", overlay).onclick = () => {
    const idea = $("[data-break-idea]", overlay);
    if (idea) idea.innerHTML = `Try this break: <strong>${randomBreakIdea()}</strong>`;
  };
  let overlayAuto2 = null;
  $("[data-complete-close]", overlay).onclick = () => {
    clearInterval(overlayAuto2);
    overlay.remove();
  };
  $("[data-complete-next]", overlay).onclick = () => {
    clearInterval(overlayAuto2);
    state.mode = "focus";
    state.time = durations.focus;
    state.sessionDuration = durations.focus;
    overlay.remove();
    startTimer();
    persist();
    updateTimerDom();
    shell();
    notify("Focus started — you've got this");
  };
  if (state.autostart?.focus)
    overlayAuto2 = armAutoStart(overlay, $("[data-complete-next]", overlay));
}

function sessionInProgress() {
  const full = state.sessionDuration || durations[state.mode];
  return state.running || (state.time > 0 && state.time < full);
}

function resetFocusSession() {
  clearInterval(timerHandle);
  state.running = false;
  state.endsAt = null;
  state.time = state.sessionDuration || durations.focus;
  state.sessionTech = null;
  state.sprintSession = null;
  persist();
  updateTimerDom();
  renderMiniTimer();
  // Deliberately silent — the timer snapping back to full IS the feedback.
}

function handleWindowHidden() {
  if (state.running && state.mode === "focus" && state.time > 0) {
    resetFocusSession();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    handleWindowHidden();
  } else if (state.running) {
    tickTimer();
  }
});

window.addEventListener("blur", handleWindowHidden);

window.addEventListener("beforeunload", () => {
  if (state.running && state.endsAt) {
    state.time = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
  }
  persist();
});

function updateTimerDom() {
  $$(".timer-ring").forEach((ring) => {
    const timeEl = $(".time", ring);
    if (timeEl) timeEl.textContent = fmt(state.time);
    ring.style.setProperty(
      "--progress",
      `${(state.time / durations[state.mode]) * 360}deg`,
    );
    const labelEl = $(".timer-label", ring);
    if (labelEl) labelEl.textContent = modeLabels[state.mode];
  });
  $$("[data-toggle]").forEach((btn) => {
    btn.textContent = state.running ? "Pause" : "Start session";
  });
  $$("[data-mini-time]").forEach((el) => {
    el.textContent = fmt(state.time);
  });
  $$("[data-mini-toggle]").forEach((btn) => {
    btn.textContent = state.running ? "Pause" : "Resume";
  });
  updateBarPadding();
  $$("[data-mini-mode]").forEach((el) => {
    el.textContent = modeLabels[state.mode];
  });
  const live = state.running && state.mode === "focus";
  $$("[data-focus-live]").forEach((el) => el.classList.toggle("off", !live));
  // Focus-desk mission countdowns stay fresh while the timer ticks.
  $$("[data-mission-cd]").forEach((el) => {
    const sp = (state.sprints || []).find((x) => x.id === el.dataset.missionCd);
    if (!sp) return;
    const t = Date.now();
    if (t < sp.startsAt) {
      el.textContent = "starts " + new Date(sp.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (t < sp.startsAt + sp.durationSec * 1000) {
      const s = Math.max(0, Math.round((sp.startsAt + sp.durationSec * 1000 - t) / 1000));
      el.textContent = `● LIVE ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    } else {
      el.textContent = "ended";
    }
  });
  $$("[data-mini-live]").forEach((el) => el.classList.toggle("off", !live));
  // Tab title countdown — visible across all browser tabs.
  try {
    if (state.running) {
      document.title = `● ${fmt(state.time)} · ${modeLabels[state.mode]} — StudyFlow`;
    } else if (sessionInProgress()) {
      document.title = `○ ${fmt(state.time)} — StudyFlow`;
    } else {
      document.title = "StudyFlow | Focus with intention";
    }
  } catch {
    /* ignore */
  }
}

function renderMiniTimer() {
  const root = $("#mini-timer-root");
  if (!root) return;
  // The countdown is never stopped by switching tabs — this bar just
  // keeps it visible everywhere outside the Focus desk.
  if (state.tab === "timer" || !sessionInProgress()) {
    root.innerHTML = "";
    updateBarPadding();
    return;
  }
  root.innerHTML = `<div class="mini-timer"><span class="mini-live off" data-mini-live title="Focus live — leaving this page resets the session">${sicon("rec")}</span><span class="eyebrow" data-mini-mode style="color:#b7d0bd">${state.sessionTech && techniques.find((y) => y[0] === state.sessionTech) ? `${techniques.find((y) => y[0] === state.sessionTech)[2]} ` : ""}${modeLabels[state.mode]}</span><span class="mini-time" data-mini-time>${fmt(state.time)}</span><button type="button" class="mini-btn" data-mini-toggle>${state.running ? "Pause" : "Resume"}</button><button type="button" class="mini-btn ghost" data-mini-goto>Focus desk</button></div>`;
  $("[data-mini-toggle]", root).onclick = () => toggleTimer();
  $("[data-mini-goto]", root).onclick = () => {
    state.tab = "timer";
    persist();
    shell();
  };
  const miniEl = root.querySelector(".mini-timer");
  if (miniEl) makeDraggable(miniEl, miniEl);
  updateBarPadding();
}

function taskRow(task) {
  return `<div class="task ${task.done ? "done" : ""}" data-task-row="${task.id}"><button type="button" class="task-check ${task.done ? "done" : ""}" data-task-check="${task.id}" aria-pressed="${Boolean(task.done)}" title="${task.done ? "Mark as not done" : "Mark as done"}" aria-label="${task.done ? "Mark as not done" : "Mark as done"}"><span class="tc-box">${sicon("check")}</span></button><span class="task-text">${esc(task.text)}${task.desc ? `<br><small class="muted">${esc(task.desc)}</small>` : ""}</span><span class="task-meta">${task.pomodoros || 0} ◷</span><button type="button" class="ghost task-edit" data-edit-task="${task.id}">Edit</button><button type="button" class="delete" data-delete-task="${task.id}" title="Remove task">×</button></div>`;
}

function openTaskEditor(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return notify("That task no longer exists");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Edit task</div><h2>Make it right</h2><label class="field-label">Task<input class="input" data-task-title value="${esc(task.text)}"></label><label class="field-label">Description<textarea class="textarea autogrow" data-task-desc rows="2" placeholder="What does done look like?">${esc(task.desc || "")}</textarea></label><div class="modal-actions"><button type="button" class="ghost" data-task-cancel>Cancel</button><button type="button" class="primary" data-task-save>Save changes</button></div></div>`;
  $("#modal-root").append(modal);
  const titleInput = $("[data-task-title]", modal);
  $("[data-task-cancel]", modal).onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  $("[data-task-save]", modal).onclick = () => {
    const title = titleInput.value.trim();
    if (!title) return notify("Give the task a title");
    task.text = title;
    task.desc = $("[data-task-desc]", modal).value.trim();
    task.updated = Date.now();
    persist();
    mirrorTasks(); // debounced upsert — rapid saves collapse into one request
    modal.remove();
    renderTimer();
    notify("Task updated");
  };
  setTimeout(() => {
    titleInput.focus();
    titleInput.select();
  }, 0);
}

function addTask() {
  const input = $("#task-input");
  if (!input || !input.value.trim()) return;
  const now = Date.now();
  state.tasks.push({
    id: uid(),
    text: input.value.trim(),
    desc: "",
    done: false,
    pomodoros: 0,
    created: now,
    updated: now,
  });
  persist();
  mirrorTasks();
  input.value = "";
  renderTimer();
}



export { durations, applyDurations, modeLabels, timerHandle, recordFocusDay, STREAK_MILESTONES, checkStreakMilestone, GARDEN_COMMON, GARDEN_RARE, GARDEN_LEGENDARY, plantFlower, wiltNewest, gardenMarkup, streakDots, renderTimer, focusScore, scoreGrade, ACHIEVEMENTS, checkAchievements, achievementProgress, achievementsCabinetMarkup, MASTERY_LADDER, masteryLadderMarkup, checkMasteryLadder, saveAccomplishment, TIMER_TEMPLATES, applyTemplate, applyCustomDuration, techniqueOfDay, techOfDayMarkup, biggestDay, recordsMarkup, techTagMarkup, toggleTimer, startTimer, pauseTimer, startTick, tickTimer, completeSession, BREAK_IDEAS, randomBreakIdea, armAutoStart, showCompletionCard, sessionInProgress, resetFocusSession, handleWindowHidden, updateTimerDom, renderMiniTimer, taskRow, openTaskEditor, addTask, openFocusView, closeFocusView, toggleBoss };
