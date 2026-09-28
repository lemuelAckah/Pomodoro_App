/* challenges.js — eager weekly-challenge state machine, focus-day logging
   and group system messages. Extracted from the lazy community route so
   the focus desk (challenge lock, focus logging, challenge completion)
   works before — and without — the community chunk. Pure state logic. */
import {
  state,
  persist,
  uid,
  dayKey,
  esc,
  sicon,
  notify,
  celebrate,
  addCoins,
  addNotification,
  notifOn,
  stripIcon,
} from "./core.js"
import { playChime } from "./audio.js"
import { applyDurations } from "./timer.js"
import { secureEarn } from "./services/rewards-sync.js"

const SPRINT_PEER_NAMES = [
  "Maya",
  "Leo",
  "Ava",
  "Noah",
  "Zoe",
  "Eli",
  "Ivy",
  "Max",
  "Ada",
  "Sam",
]

function weekKey(d) {
  const dt = new Date(d.getTime ? d.getTime() : d)

  const day = (dt.getDay() + 6) % 7

  dt.setDate(dt.getDate() - day)

  return dayKey(dt)
}

function logFocusDay(min) {
  const k = dayKey(new Date())

  state.focusDays[k] = (state.focusDays[k] || 0) + min

  const cutoff = Date.now() - 70 * 86400000

  Object.keys(state.focusDays).forEach((key) => {
    if (new Date(key + "T00:00:00").getTime() < cutoff)
      delete state.focusDays[key]
  })

  persist()
}

function weekMinutes(wk) {
  return Object.entries(state.focusDays || {})

    .filter(([date]) => weekKey(new Date(date + "T00:00:00")) === wk)

    .reduce((n, [, m]) => n + m, 0)
}

function progressChallenges(focusedMin) {
  const wk = weekKey(new Date())
  ;(state.challenges || []).forEach((c) => {
    sanitizeChallenge(c)

    if (c.weekKey !== wk || c.done || !c.joined) return

    const me = state.profile.handle || "you"

    bumpChallengeMember(c, me, true, focusedMin)

    c.progress += c.unit === "minutes" ? focusedMin : 1

    postGroupMessage(
      c.groupId,

      `@${me} finished a ${fmtPace(c)} session — ${Math.min(c.progress, c.target)}/${c.target} ${c.unit} in “${c.title}”.`,

      "trophy",
    )

    // A rival answers back — the leaderboard stays alive.

    if (!c.done && Math.random() < 0.4) mateChallengeSession(c, true)

    if (c.progress >= c.target) finishChallenge(c, null)
  })

  persist()
}

/* ---------- group challenges pro: prescribed pace, leaderboard, one-at-a-time lock ---------- */

function fmtPace(c) {
  const m = Math.max(0, c.sessionMin || 0)

  const s = Math.max(0, Math.min(59, c.sessionSec || 0))

  return `${m}:${String(s).padStart(2, "0")}`
}

function paceSec(c) {
  return Math.max(1, (c.sessionMin || 0) * 60 + (c.sessionSec || 0))
}

function sanitizeChallenge(c) {
  if (!c || typeof c !== "object") return c

  if (!Number.isFinite(+c.sessionMin)) c.sessionMin = 25

  if (!Number.isFinite(+c.sessionSec)) c.sessionSec = 0

  c.sessionMin = Math.min(180, Math.max(0, Math.floor(+c.sessionMin)))

  c.sessionSec = Math.min(59, Math.max(0, Math.floor(+c.sessionSec)))

  if (c.sessionMin === 0 && c.sessionSec === 0) c.sessionMin = 25

  if (!c.ownerId) c.ownerId = ""

  if (c.joined == null) c.joined = true // legacy rooms counted automatically

  if (!Array.isArray(c.members) || !c.members.length) {
    const names = [...SPRINT_PEER_NAMES]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)

    const per = paceSec(c) / 60

    c.members = names.map((name) => {
      const sessions = Math.floor(
        Math.random() * Math.max(1, Math.min(4, (c.target || 10) - 1)),
      )

      return {
        id: "cm-" + uid(),
        name,
        sessions,
        minutes: Math.round(sessions * per),
      }
    })
  }

  if (!c.members.some((m) => m.you)) {
    // Legacy progress was mine alone — carry it onto my leaderboard row.

    c.members.unshift({
      id: "cm-me",

      name: state.profile.handle || "you",

      you: true,

      sessions:
        c.unit === "sessions" ? Math.min(c.progress || 0, c.target || 0) : 0,

      minutes:
        c.unit === "minutes"
          ? c.progress || 0
          : Math.round(((c.progress || 0) * paceSec(c)) / 60),
    })
  }

  return c
}

// One race at a time: legacy weeks may hold several auto-counted challenges,

// so keep the first undone one and park the rest as joinable.

function ensureChallengeFields() {
  if (!Array.isArray(state.challenges)) state.challenges = []

  if (!Array.isArray(state.challengeInvites)) state.challengeInvites = []

  const wk = weekKey(new Date())

  let kept = false

  state.challenges.forEach((c) => {
    sanitizeChallenge(c)

    if (c.weekKey === wk && !c.done && c.joined) {
      if (kept) c.joined = false
      else kept = true
    }
  })

  const active = state.challenges.find(
    (c) => c.weekKey === wk && !c.done && c.joined,
  )

  if (active && state.activeChallengeId !== active.id) {
    state.activeChallengeId = active.id

    persist()
  }

  // Validate the pointer inline (never via challengeLock — that calls back

  // here and would recurse forever).

  const valid = (state.challenges || []).some(
    (x) =>
      x.id === state.activeChallengeId &&
      x.weekKey === wk &&
      !x.done &&
      x.joined,
  )

  if (!valid && state.activeChallengeId) state.activeChallengeId = null
}

// The challenge currently locking the focus timer (self-healing).

function challengeLock() {
  ensureChallengeFields()

  const wk = weekKey(new Date())

  const c = (state.challenges || []).find(
    (x) =>
      x.id === state.activeChallengeId &&
      x.weekKey === wk &&
      !x.done &&
      x.joined,
  )

  if (!c && state.activeChallengeId) {
    state.activeChallengeId = null

    persist()
  }

  return c || null
}

function otherActiveChallenge(id) {
  const wk = weekKey(new Date())

  return (state.challenges || []).find(
    (x) => x.id !== id && x.weekKey === wk && !x.done && x.joined,
  )
}

function leaveChallenge(id) {
  const c = (state.challenges || []).find((x) => x.id === id)

  if (state.activeChallengeId === id) state.activeChallengeId = null

  if (c) {
    c.joined = false

    c.progress = 0

    const me = c.members?.find((m) => m.you)

    if (me) {
      me.sessions = 0

      me.minutes = 0
    }
  }

  try {
    applyDurations()
  } catch {
    /* ignore */
  }

  persist()

  return true
}

// Focus-desk banner for the active challenge lock.

function challengeLockBanner() {
  const c = challengeLock()

  if (!c) return ""

  return `<div class="challenge-lock"><span class="lock-ico">${sicon("lock")}</span><div><strong>Challenge lock · “${esc(c.title)}”</strong><br><small class="muted">Every focus session runs ${fmtPace(c)} — templates and custom durations are paused until you leave.</small></div><button type="button" class="ghost" data-challenge-leave="${c.id}">Leave</button></div>`
}

function bumpChallengeMember(c, name, you, focusedMin) {
  c.members = Array.isArray(c.members) ? c.members : []

  let m = c.members.find((x) => (you && x.you) || (!you && x.name === name))

  if (!m) {
    m = { id: "cm-" + uid(), name, you: Boolean(you), sessions: 0, minutes: 0 }

    c.members.push(m)
  }

  m.sessions = (m.sessions || 0) + 1

  m.minutes =
    (m.minutes || 0) + Math.max(1, Math.round(focusedMin || paceSec(c) / 60))

  return m
}

function challengeScore(c, m) {
  return c.unit === "minutes" ? m.minutes || 0 : m.sessions || 0
}

function mateWon(c, m) {
  return challengeScore(c, m) >= (c.target || 0)
}

// A simulated group mate logs a session of their own.

function mateChallengeSession(c, announce) {
  const mates = (c.members || []).filter((m) => !m.you)

  let who =
    mates.length && Math.random() < 0.8
      ? mates[Math.floor(Math.random() * mates.length)]
      : null

  if (!who) {
    if ((c.members || []).length >= 6 && mates.length) {
      who = mates[Math.floor(Math.random() * mates.length)]
    } else {
      who = {
        id: "cm-" + uid(),
        name: SPRINT_PEER_NAMES[
          Math.floor(Math.random() * SPRINT_PEER_NAMES.length)
        ],
        sessions: 0,
        minutes: 0,
      }
      ;(c.members = c.members || []).push(who)
    }
  }

  const logged = bumpChallengeMember(c, who.name, false, paceSec(c) / 60)

  // Ambient posts are throttled — at most one shout per 90s per challenge.

  const nowT = Date.now()

  if (announce && nowT - (c._matePostAt || 0) > 90000) {
    c._matePostAt = nowT

    postGroupMessage(
      c.groupId,

      `@${who.name} finished a ${fmtPace(c)} session — now at ${logged.sessions} session${
        logged.sessions === 1 ? "" : "s"
      } in “${c.title}”.`,

      "fire",

      who.name,
    )
  }

  if (mateWon(c, logged)) finishChallenge(c, logged.name)

  persist()

  return logged
}

function finishChallenge(c, winnerName) {
  if (c.done) return

  c.done = true

  c.winner = winnerName || state.profile.handle || "you"

  if (!winnerName) {
    const award =
      c.unit === "minutes"
        ? Math.min(100, Math.round(c.target / 2))
        : Math.min(100, c.target * 5)

    // Ledger-routed (idempotent per challenge) for members; local otherwise.

    try {
      secureEarn({
        amount: award,
        reason: "Challenge complete",
        refKey: `challenge:${c.id}`,
      }).catch(() => {})
    } catch {
      addCoins(award)
    }

    addNotification(
      "Challenge complete",
      `${c.title} — +${award} coins showered.`,
      "trophy",
    )

    postGroupMessage(
      c.groupId,
      `“${c.title}” complete — @${c.winner} takes the crown with ${c.target} ${c.unit}. +${award} coins showered. 👑`,
      "crown",
    )

    notify(`${sicon("trophy")} Challenge complete · +${award} coins`)

    celebrate(true)

    if (notifOn("completion")) playChime("focus")
  } else {
    postGroupMessage(
      c.groupId,
      `👑 @${winnerName} takes “${c.title}” with ${c.target} ${c.unit}. The crown is theirs — run it back next week?`,
      "crown",
      winnerName,
    )

    addNotification(
      "Challenge crown taken",
      `@${winnerName} won “${c.title}” in your group.`,
      "crown",
    )

    notify(`👑 @${winnerName} takes “${c.title}” — run it back`)
  }

  if (state.activeChallengeId === c.id) state.activeChallengeId = null

  try {
    applyDurations()
  } catch {
    /* timer module warms it on next render */
  }

  persist()
}

function postGroupMessage(groupId, text, icon, from) {
  if (!groupId) return

  state.messages[groupId] = [
    ...(state.messages[groupId] || []),

    {
      id: uid(),
      me: !from,
      sysName: from || "",
      icon: icon || "",
      text: cleanText(text),
      ts: Date.now(),
    },
  ]
}

// System posts used to embed sicon() SVG straight into the message text, and

// chat renders text with esc() — so rooms showed raw "<svg ...>" markup.

// Icons now travel in their own field; this also heals messages already saved

// with the old flaw.

function cleanText(value) {
  return stripIcon(value)
}

export {
  SPRINT_PEER_NAMES,
  weekKey,
  logFocusDay,
  weekMinutes,
  progressChallenges,
  fmtPace,
  paceSec,
  sanitizeChallenge,
  ensureChallengeFields,
  challengeLock,
  leaveChallenge,
  challengeLockBanner,
  bumpChallengeMember,
  challengeScore,
  mateWon,
  otherActiveChallenge,
  mateChallengeSession,
  finishChallenge,
  postGroupMessage,
  cleanText,
}
