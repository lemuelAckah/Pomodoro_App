/* account.js — landing, auth, profile, settings, data management */

import {
  state,
  $,
  $$,
  uid,
  get,
  save,
  esc,
  sicon,
  stripIcon,
  haltPersist,
  pushUserSettings,
  persist,
  notify,
  confirmBox,
  viewHead,
  applyDisplay,
  applyEquippedTheme,
  applyMotion,
  avatarMarkup,
  cloudStateSubscription,
  dayKey,
  hydrateCloudState,
  openWhatsNew,
  setCloudSubscription,
  toggleNight,
  requireAuth,
  archiveStateForSignOut,
  restoreArchivedState,
  randomHandle,
} from "./core.js"

import { pullProductivity } from "./services/productivity-sync.js"

import { pullRewards } from "./services/rewards-sync.js"

import { pullMusic } from "./services/music-sync.js"

import { syncBooksLibrary } from "./books.js"

import {
  signUpWithEmail,
  signInWithEmail,
  resendVerification,
  requestPasswordReset,
  friendlyAuthError,
  updatePassword,
  signInWithProvider,
  signOut,
  getCurrentUser,
  syncProfile,
  uploadAvatar,
  removeAvatar,
  avatarPublicUrl,
  searchUsers,
  uploadUserFile,
  deleteMyBackendData,
  backendConfigured,
  hasActiveSession,
} from "./services/backend.js"

import { CHIMES, playChime, clearSongDatabase, stopAllLayers } from "./audio.js"

import {
  applyDurations,
  haltTimer,
  durations,
  renderTimer,
  sessionInProgress,
  timerHandle,
} from "./timer.js"

import { startTechCheck, techInfo, enterApp } from "./techniques.js"

import {
  equippedAvatarEmoji,
  equippedBadgeEmoji,
  showcasedBadgeIds,
  toggleShowcaseBadge,
  ownedBadges,
} from "./store.js"

import {
  disconnectRealtime,
  conversationSubscription,
  presenceSub,
} from "./community.js"

import { shell } from "./app.js"

// Username dice: roll a fresh handle into any username input. Checks the

// directory for collisions when signed in (best-effort — the server unique

// constraint is still the final arbiter). Typing your own always wins.

async function handleAvailable(handle) {
  try {
    if (!backendConfigured || !state.user) return true

    const clean = String(handle || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")

    if (clean.length < 2) return false

    const { data, error } = await searchUsers(clean, 5)

    if (error || !Array.isArray(data)) return true

    return !data.some((u) => String(u.handle || "").toLowerCase() === clean)
  } catch {
    return true
  }
}

async function rollHandleInto(input, btn) {
  if (!input) return

  if (btn) {
    btn.disabled = true

    btn.classList.add("rolling")
  }

  try {
    let pick = randomHandle()

    for (let i = 0; i < 6; i++) {
      const candidate = randomHandle()

      pick = candidate

      if (await handleAvailable(candidate)) break
    }

    input.value = pick

    try {
      input.focus()
    } catch {
      /* ignore */
    }
  } finally {
    if (btn) {
      btn.disabled = false

      btn.classList.remove("rolling")
    }
  }
}

function handleFieldMarkup(id, value, hint) {
  return `<label class="field-label">Username<span class="handle-row"><input class="input" id="${id}" value="${esc(value || "")}" placeholder="pick_a_name" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="dice-btn" data-dice-for="${id}" title="Roll a random username" aria-label="Roll a random username">${sicon("dice")}</button></span>${
    hint ? `<small class="muted">${esc(hint)}</small>` : ""
  }</label>`
}

function bindHandleDice(root) {
  $$("[data-dice-for]", root).forEach((b) => {
    if (b.dataset.diceBound) return

    b.dataset.diceBound = "1"

    b.onclick = () => {
      const sel = `#${b.dataset.diceFor}`

      const input =
        root.querySelector(sel) || document.getElementById(b.dataset.diceFor)

      rollHandleInto(input, b)
    }
  })
}

// Password visibility (👁): pure type toggle, works on every password field

// rendered with .pw-wrap. Never logs or stores the value anywhere.

function pwFieldMarkup(id, label, placeholder, autocomplete) {
  return `<label class="field-label">${esc(label)}<span class="pw-wrap"><input class="input" id="${id}" type="password" placeholder="${esc(placeholder)}" autocomplete="${autocomplete || "current-password"}"><button type="button" class="pw-toggle off" data-pw-toggle aria-label="Show password" title="Show password">${sicon("eyes")}</button></span></label>`
}

function bindPwToggles(root) {
  $$(".pw-toggle", root).forEach((b) => {
    if (b.dataset.pwBound) return

    b.dataset.pwBound = "1"

    b.onclick = () => {
      const input = b.closest(".pw-wrap")?.querySelector("input")

      if (!input) return

      const show = input.type === "password"

      input.type = show ? "text" : "password"

      b.setAttribute("aria-pressed", String(show))

      b.setAttribute("aria-label", show ? "Hide password" : "Show password")

      b.title = show ? "Hide password" : "Show password"

      b.classList.toggle("off", !show)

      try {
        input.focus()
      } catch {
        /* ignore */
      }
    }
  })
}

function openProfile() {
  const modal = document.createElement("div")

  modal.className = "modal-backdrop"

  let pendingPhoto = state.profile.photo || ""

  let photoDirty = false

  const previewMarkup = () =>
    pendingPhoto
      ? `<img src="${pendingPhoto}" alt="Profile photo">`
      : esc(equippedAvatarEmoji() || state.profile.avatar)

  modal.innerHTML = `<div class="modal profile-modal"><div class="eyebrow">Your account</div><h2>Profile &amp; preferences</h2><div class="profile-grid">
    <div class="profile-identity">
      <div class="profile-avatar-preview" id="profile-photo-preview">${previewMarkup()}</div>
      <div class="photo-row"><label class="ghost" style="font-size:12px;padding:9px 12px;cursor:pointer">Upload photo<input id="profile-photo" type="file" accept="image/*" hidden></label>${
        pendingPhoto
          ? `<button type="button" class="ghost" style="font-size:12px;padding:9px 12px" data-remove-photo>Remove photo</button>`
          : ""
      }</div>
      <label class="field-label">Display name<input class="input" id="profile-name" value="${esc(state.profile.name)}"></label>
      ${handleFieldMarkup("profile-handle", state.profile.handle, "Yours alone — no two learners share one.")}
    </div>
    <div class="profile-details">
      <label class="field-label">Bio<textarea class="textarea autogrow" id="profile-bio" rows="3">${esc(state.profile.bio)}</textarea></label>
      <label class="field-label">Email (optional)<input class="input" id="profile-email" type="email" placeholder="you@example.com" value="${esc(state.profile.email || "")}"></label>
      <label class="field-label">Country (optional)<input class="input" id="profile-country" placeholder="e.g. Ghana" value="${esc(state.profile.country || "")}"></label>
      <label class="field-label">Phone number (optional)<input class="input" id="profile-phone" type="tel" placeholder="e.g. +233 ..." value="${esc(state.profile.phone || "")}"></label>
      <label class="field-label">University (optional)<input class="input" id="profile-university" placeholder="Where do you school?" value="${esc(state.profile.university || "")}"></label>
      <label class="field-label">Subjects (optional, comma separated)<input class="input" id="profile-subjects" placeholder="e.g. Calculus, Web Development" value="${esc((state.profile.subjects || []).join(", "))}"></label>
    </div>
  </div>${
    state.user
      ? `<div class="auth-session"><span>Signed in as ${esc(state.user.email || state.profile.handle)}</span><button type="button" class="ghost" data-sign-out>Sign out</button></div>`
      : ""
  }<div class="modal-actions"><button type="button" class="ghost" data-profile-close>Cancel</button><button type="button" class="primary" data-profile-save>Save profile</button></div></div>`

  $("#modal-root").append(modal)

  bindHandleDice(modal)

  bindPwToggles(modal)

  $("[data-profile-close]", modal).onclick = () => modal.remove()

  $("#profile-photo", modal).onchange = (event) => {
    const file = event.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith("image/")) return notify("Choose an image file")

    const reader = new FileReader()

    reader.onload = () => {
      const image = new Image()

      image.onload = () => {
        const max = 256

        const scale = Math.min(1, max / Math.max(image.width, image.height))

        const canvas = document.createElement("canvas")

        canvas.width = Math.round(image.width * scale)

        canvas.height = Math.round(image.height * scale)

        canvas
          .getContext("2d")
          .drawImage(image, 0, 0, canvas.width, canvas.height)

        pendingPhoto = canvas.toDataURL("image/jpeg", 0.85)

        photoDirty = true

        $("#profile-photo-preview", modal).innerHTML = previewMarkup()

        notify("Photo ready — press Save profile")
      }

      image.src = reader.result
    }

    reader.readAsDataURL(file)
  }

  $("[data-remove-photo]", modal)?.addEventListener("click", () => {
    pendingPhoto = ""

    photoDirty = true

    $("#profile-photo-preview", modal).innerHTML = previewMarkup()
  })

  $("[data-sign-in]", modal)?.addEventListener("click", () =>
    authenticate(modal, false),
  )

  $("[data-sign-up]", modal)?.addEventListener("click", () =>
    authenticate(modal, true),
  )

  $("[data-sign-out]", modal)?.addEventListener("click", async () => {
    await signOut()

    cloudStateSubscription?.unsubscribe()

    setCloudSubscription(null)

    // Wipe every personal record from this browser: the next screen is a

    // true guest state (no coins, favorites, profile, notes…). The data is

    // archived and returns automatically on the next sign-in.

    archiveStateForSignOut(state.user?.id || null)

    haltPersist()

    sessionStorage.setItem("sf-signed-out", "1")

    location.reload()
  })

  $("[data-profile-save]", modal).onclick = async () => {
    if (!requireAuth("save your profile")) return

    const email = $("#profile-email", modal).value.trim()

    if (email && !/.+@.+\..+/.test(email))
      return notify("That email does not look valid")

    state.profile.name =
      $("#profile-name", modal).value.trim() || "Study Learner"

    state.profile.handle =
      $("#profile-handle", modal).value.trim().replace(/\s+/g, "_") ||
      randomHandle()

    state.profile.bio = $("#profile-bio", modal).value.trim()

    state.profile.email = email

    state.profile.country = $("#profile-country", modal).value.trim()

    state.profile.phone = $("#profile-phone", modal).value.trim()

    state.profile.university = $("#profile-university", modal).value.trim()

    state.profile.subjects = $("#profile-subjects", modal)

      .value.split(",")

      .map((s) => s.trim())

      .filter(Boolean)

      .slice(0, 12)

    // Photo: untouched stays exactly as-is (no re-upload). A fresh upload or

    // removal goes to Storage first so the old file never lingers behind.

    const prevPhoto = state.profile.photo || ""

    const prevPath = state.profile.photoPath || ""

    let uploadedNewPath = null

    if (photoDirty) {
      if (pendingPhoto && backendConfigured && state.user && navigator.onLine) {
        try {
          const blob = await (await fetch(pendingPhoto)).blob()

          const up = await uploadAvatar(
            new File([blob], "avatar.jpg", { type: "image/jpeg" }),
          )

          if (up.error) throw up.error

          if (prevPath && prevPath !== up.data.path)
            await removeAvatar(prevPath).catch(() => {})

          uploadedNewPath = up.data.path

          state.profile.photoPath = up.data.path

          state.profile.photo = avatarPublicUrl(up.data.path) || pendingPhoto

          notify("Photo synced to your cloud profile")
        } catch {
          state.profile.photo = pendingPhoto

          notify("Photo saved on this device; cloud upload failed")
        }
      } else if (
        photoDirty &&
        pendingPhoto &&
        backendConfigured &&
        state.user &&
        !navigator.onLine
      ) {
        // Offline: keep the new photo locally (data URL) — it shows right

        // away and uploads on the next online save instead of failing.

        state.profile.photo = pendingPhoto

        notify(
          "Photo saved on this device — it uploads when you're back online",
        )
      } else {
        if (prevPath && backendConfigured && state.user && navigator.onLine)
          await removeAvatar(prevPath).catch(() => {})

        state.profile.photo = pendingPhoto || ""

        state.profile.photoPath = ""
      }
    }

    state.profile.avatar = state.profile.name

      .split(/\s+/)

      .map((part) => part[0])

      .join("")

      .slice(0, 2)

      .toUpperCase()

    persist()

    let cloudOk = true

    if (state.user) {
      if (!navigator.onLine) {
        // Offline: nothing to send — the profile stays on this device and

        // syncs on the next online save. Never block the user on it.

        cloudOk = false
      }

      const res = cloudOk ? await syncProfile(state.profile) : { error: null }

      if (res.error) {
        cloudOk = false

        // Don't leave an orphaned fresh upload behind when the row save fails.

        if (uploadedNewPath && uploadedNewPath !== prevPath) {
          await removeAvatar(uploadedNewPath).catch(() => {})

          state.profile.photoPath = prevPath

          state.profile.photo = prevPhoto

          persist()
        }

        notify(friendlyProfileError(res.error))
      }
    }

    modal.remove()

    shell()

    notify(
      !navigator.onLine && state.user
        ? "Offline — profile saved on this device and will sync when you're back online"
        : cloudOk
          ? "Profile updated"
          : "Profile kept on this device",
    )
  }
}

// Translate sync failures into actions — a silent "saved" is worse than noise.

function friendlyProfileError(error) {
  const msg = String(error?.message || "")

  if (error?.code === "23505" || /duplicate key|already exists/i.test(msg))
    return "That username is already taken — try another one"

  if (/photo_path|schema cache|PGRST204|column .* does not exist/i.test(msg))
    return "Cloud table is outdated — apply migration 010, then save again"

  if (/jwt|expired|permission|policy|unauthorized|sign in/i.test(msg))
    return "Session expired — sign in again, then save"

  return `Saved on this device; cloud sync failed (${msg.slice(0, 120) || "unknown error"})`
}

function friendlySignupError(error) {
  const msg = String(error?.message || "")

  if (/already registered/i.test(msg))
    return "An account with this email already exists — sign in instead"

  if (/duplicate|handle|username/i.test(msg))
    return "That username is taken — change your handle, then retry"

  return msg || "Could not create the account"
}

async function authenticate(modal, createAccount) {
  const email = $("#auth-email", modal)?.value.trim()

  const password = $("#auth-password", modal)?.value

  if (!email || !password) return notify("Enter your email and password")

  if (createAccount && !$("#auth-privacy", modal)?.checked)
    return notify("Tick the Privacy & Guidelines box to create your account")

  const submitBtn = $("[data-auth-submit]", modal) || $(".primary", modal)

  const originalLabel = submitBtn?.textContent || ""

  if (submitBtn) {
    submitBtn.disabled = true

    submitBtn.textContent = createAccount ? "Creating account…" : "Signing in…"
  }

  let result

  try {
    result = createAccount
      ? await signUpWithEmail(email, password, state.profile)
      : await signInWithEmail(email, password)
  } catch (err) {
    result = { error: err }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false

      submitBtn.textContent = originalLabel
    }
  }

  if (result.error)
    return notify(
      createAccount
        ? friendlySignupError(result.error)
        : friendlyAuthError(result.error),
    )

  if (createAccount) markPrivacyAccepted()

  state.user = result.data?.user || (await getCurrentUser())

  // No session yet (email confirmation required): don't hydrate or pretend

  // we're signed in — tell the user what to do next.

  if (!state.user || !(await hasActiveSession())) {
    state.user = null

    return notify("Almost there — confirm your email first, then sign in.")
  }

  // Bring back anything archived at the last sign-out (same device, same

  // account). The archive is written to storage and a reload rebuilds the

  // whole app from it; cloud hydration then tops up on the fresh boot.

  if (restoreArchivedState(state.user.id)) {
    sessionStorage.setItem("sf-restored", "1")

    location.reload()

    return
  }

  await hydrateCloudState(state.user)

  await pullProductivity() // tasks, notes & technique data follow the account

  pullRewards().catch(() => {}) // coins, inventory, achievements, streak, boxes

  pullMusic().catch(() => {}) // music metadata + playlists (audio stays local)

  syncBooksLibrary().catch(() => {}) // book metadata rows (files stay local)

  persist()

  modal.remove()

  shell()

  notify(createAccount ? "Account created" : "Signed in")
}

// Every notification carries an icon name (new) or earns one from its title

// (legacy) — either way the centre renders a real badge, never raw markup.

function notifIcon(item) {
  // Any short plain name is safe — sicon() falls back to a sparkle for

  // unknown names, so stored markup can never leak through here.

  if (item && /^[a-z0-9-]{1,24}$/i.test(item.icon || "")) return item.icon

  const t = `${item?.title || ""} ${item?.text || ""}`.toLowerCase()

  if (t.includes("call") || t.includes("ringing") || t.includes("video call"))
    return "phone"

  if (t.includes("crown")) return "crown"

  if (t.includes("achievement")) return "medal"

  if (t.includes("streak") || t.includes("milestone")) return "fire"

  if (t.includes("challenge")) return "trophy"

  if (t.includes("sprint") || t.includes("race")) return "bolt"

  if (t.includes("session") || t.includes("schedul") || t.includes("rsvp"))
    return "calendar"

  if (t.includes("gift") || t.includes("invite")) return "gift"

  if (t.includes("friend") || t.includes("group")) return "users"

  if (t.includes("focus") || t.includes("session complete")) return "timer"

  if (t.includes("welcome")) return "sparkle"

  return "bell"
}

function openNotifications() {
  const modal = document.createElement("div")

  modal.className = "modal-backdrop"

  // Live call banner: an ongoing room is as important as unread history —

  // surface it at the top of the activity centre so the user can jump back.

  const liveCall = state.call
    ? `<div class="notif-live-call${
        state.callStatus === "connected" ? " live" : ""
      }" data-notif-live-call role="status">
        <span class="notif-live-ico">${sicon("phone")}</span>
        <div class="notif-live-txt">
          <strong>${esc(state.call.name || "Study partner")}</strong>
          <small>${
            state.callStatus === "connected"
              ? "On a video call"
              : state.callStatus === "connecting"
                ? "Connecting…"
                : "Ringing…"
          }</small>
        </div>
        <button type="button" class="primary notif-live-btn" data-notif-live-open>${
          state.callStatus === "connected" ? "Open call" : "View"
        }</button>
      </div>`
    : ""

  modal.innerHTML = `<div class="modal notification-modal"><div class="eyebrow">Activity centre</div><div class="section-row"><h2>Notifications</h2><button type="button" class="ghost" data-read-all>Mark all read</button></div>${liveCall}<div class="notification-list">${
    state.notifications.length
      ? state.notifications
          .map(
            (item) =>
              `<div class="notification ${
                item.read ? "read" : "unread"
              }"><div class="notification-ico">${sicon(notifIcon(item))}</div><div><strong>${esc(stripIcon(item.title))}</strong><p>${esc(stripIcon(item.text))}</p><small>${new Date(item.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small></div><div class="notification-mark">${
                item.read ? sicon("check") : "•"
              }</div></div>`,
          )
          .join("")
      : '<p class="muted">You are all caught up.</p>'
  }</div><div class="modal-actions"><button type="button" class="primary" data-notification-close>Done</button></div></div>`

  $("#modal-root").append(modal)

  $("[data-notif-live-open]", modal)?.addEventListener("click", () => {
    modal.remove()

    // Surface the floating call window (or open it if it was minimized).

    if (state.call) {
      state.callMinimized = false

      persist()

      // Re-render via a lightweight custom event the call module listens for.

      window.dispatchEvent(new CustomEvent("sf-call-focus"))
    }
  })

  $("[data-read-all]", modal).onclick = () => {
    state.notifications.forEach((item) => (item.read = true))

    persist()

    modal.remove()

    openNotifications()

    shell()
  }

  $("[data-notification-close]", modal).onclick = () => {
    state.notifications.forEach((item) => (item.read = true))

    persist()

    modal.remove()

    shell()
  }
}

function profileCompleteness() {
  const p = state.profile || {}

  const fields = [
    ["Display name", Boolean(p.name && p.name !== "Study Learner")],

    ["Username", Boolean(p.handle && p.handle !== "study_learner")],

    ["Bio", Boolean((p.bio || "").trim())],

    ["Profile photo", Boolean(p.photo)],

    ["Email", /.+@.+\..+/.test(p.email || "")],

    ["Country", Boolean((p.country || "").trim())],

    ["Phone number", Boolean((p.phone || "").trim())],

    ["University", Boolean((p.university || "").trim())],

    ["Subjects", (p.subjects || []).length > 0],
  ]

  const done = fields.filter(([, ok]) => ok).length

  return {
    pct: Math.round((done / fields.length) * 100),

    missing: fields.filter(([, ok]) => !ok).map(([label]) => label),
  }
}

function completenessMarkup() {
  const { pct, missing } = profileCompleteness()

  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Profile strength</h2><span class="tag">${pct}%</span></div><div class="complete-track"><span class="complete-fill" style="width:${pct}%"></span></div>${
    pct >= 100
      ? '<p class="muted" style="margin-top:10px">Profile complete — recommendations and buddy matching run at full power.</p>'
      : `<p class="muted" style="margin-top:10px">Add your ${esc(missing.slice(0, 2).join(" and "))} to unlock better matches.</p><div class="complete-missing">${missing.map((m) => `<button type="button" class="ghost complete-chip" data-complete-profile>${esc(m)}</button>`).join("")}</div>`
  }</div>`
}

function dataMarkup() {
  const cloudTag = backendConfigured
    ? state.user
      ? "cloud sync on"
      : "cloud ready"
    : "this browser only"

  return `<div class="card" style="margin-top:18px"><div class="section-row"><h2>Your data</h2><span class="tag">${cloudTag}</span></div><p class="muted">${
    state.user
      ? "Stored in this browser and mirrored to your cloud account. Export takes a full local snapshot; wipe clears this browser (server rows are removed too when the backend is available)."
      : "Everything lives in this browser. Take a copy with you, or erase it all — your call."
  }</p><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" class="ghost" data-export>Export my data</button><label class="ghost" style="cursor:pointer">Import backup<input type="file" id="import-file" accept="application/json,.json" hidden></label><button type="button" class="ghost" data-clear-history>Clear local history…</button><button type="button" class="ghost" data-wipe style="color:#c0392b">Delete my data…</button></div><p class="muted" style="font-size:11px;margin-top:10px">Clear local history removes chat messages and pins from this device only — your profile, settings, account, coins and server data stay put.</p></div>`
}

// Local-only history wipe: messages + pins (+ per-message tombstones) leave

// the browser; nothing on the server is touched and no account/settings keys

// are cleared. Safe to run while signed in.

function clearLocalHistory() {
  confirmBox(
    "Clear local history?",

    "Chat messages and pins are removed from this device only. Your profile, settings, account, coins, tasks and server data are not affected.",

    () => {
      state.messages = {}

      state.pins = {}

      state.deletedChats = {}

      state.deletedMsgs = {}

      state.messageStatus = {}

      persist()

      notify("Local history cleared — profile and settings kept")

      shell()
    },

    { eyebrow: "Your data", yesLabel: "Clear history", noLabel: "Cancel" },
  )
}

function exportData() {
  try {
    const data = {}

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)

      if (k && k.startsWith("sf-")) {
        try {
          data[k] = JSON.parse(localStorage.getItem(k))
        } catch {
          data[k] = localStorage.getItem(k)
        }
      }
    }

    const blob = new Blob(
      [
        JSON.stringify(
          { app: "StudyFlow", exportedAt: new Date().toISOString(), data },

          null,

          2,
        ),
      ],

      { type: "application/json" },
    )

    const a = document.createElement("a")

    a.href = URL.createObjectURL(blob)

    a.download = `studyflow-backup-${dayKey(new Date())}.json`

    document.body.append(a)

    a.click()

    setTimeout(() => {
      URL.revokeObjectURL(a.href)

      a.remove()
    }, 4000)

    notify("Backup downloaded")
  } catch {
    notify("Export failed — storage unavailable")
  }
}

function wipeData() {
  const modal = document.createElement("div")

  modal.className = "modal-backdrop"

  modal.innerHTML = `<div class="modal"><div class="eyebrow">Danger zone</div><h2>Delete all your data?</h2><p class="muted">This will permanently remove your account data, including coins, achievements, rewards, favorites, tasks, streaks, statuses, and other saved information. This action cannot be undone.</p><p class="st-confirm-err" data-wipe-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-wipe-cancel>Cancel</button><button type="button" class="danger-button" data-wipe-go>Delete Everything</button></div></div>`

  $("#modal-root").append(modal)

  const err = $("[data-wipe-err]", modal)

  const goBtn = $("[data-wipe-go]", modal)

  $("[data-wipe-cancel]", modal).onclick = () => modal.remove()

  modal.addEventListener("click", (e) => {
    if (e.target === modal && !goBtn.disabled) modal.remove()
  })

  goBtn.onclick = async () => {
    // Freeze all writers first: the farewell reload fires beforeunload

    // handlers that would otherwise re-save everything being deleted.

    haltPersist()

    goBtn.disabled = true

    goBtn.textContent = "Deleting…"

    err.hidden = true

    const fail = (message) => {
      err.textContent = message

      err.hidden = false

      goBtn.disabled = false

      goBtn.textContent = "Delete Everything"
    }

    try {
      clearInterval(timerHandle)
    } catch {
      /* ignore */
    }

    try {
      stopAllLayers()
    } catch {
      /* ignore */
    }

    try {
      conversationSubscription?.unsubscribe()
    } catch {
      /* ignore */
    }

    try {
      cloudStateSubscription?.unsubscribe()
    } catch {
      /* ignore */
    }

    try {
      if (presenceSub) presenceSub.untrack()
    } catch {
      /* ignore */
    }

    // Backend first: auth is still valid, so ownership rules apply.

    // Nothing local is touched until the server confirms deletion.

    try {
      const result = await deleteMyBackendData()

      if (!result.ok) {
        return fail(
          `Could not delete everything: ${result.failures.slice(0, 3).join("; ")}. Nothing was removed — please try again.`,
        )
      }
    } catch (e) {
      return fail(
        `Deletion failed before anything was removed (${e?.message || "network error"}). Please try again.`,
      )
    }

    // Imported songs live in IndexedDB, outside localStorage.

    try {
      await clearSongDatabase()
    } catch (e) {
      return fail(
        `Could not clear downloaded songs (${e?.message || "storage error"}). Nothing was removed — please try again.`,
      )
    }

    try {
      const doomed = []

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)

        if (k && k.startsWith("sf-")) doomed.push(k)
      }

      doomed.forEach((k) => localStorage.removeItem(k))
    } catch {
      return fail("Could not clear this browser's storage. Please try again.")
    }

    try {
      await signOut()
    } catch {
      /* session ends with the reload below regardless */
    }

    try {
      sessionStorage.setItem("sf-wiped", "1")
    } catch {
      /* ignore */
    }

    location.reload()
  }
}

function renderLanding() {
  const root = $("#root")

  if (!root) return

  applyEquippedTheme()

  applyDisplay()

  root.innerHTML = `<div class="landing landing-on-dusk"><div class="landing-dusk" aria-hidden="true"><span class="dusk-glow"></span><span class="dusk-dial"><i class="dusk-pie"></i><i class="dusk-ring"></i></span><span class="dusk-orbit"><b class="dusk-dot a"></b><b class="dusk-dot b"></b></span><span class="dusk-echo"></span></div><div class="landing-hero"><div class="brand-mark landing-mark">◷</div><div class="eyebrow">StudyFlow</div><h1>Focus with intention.</h1><p class="lede">Pomodoro sessions, streaks, study buddies and rewards — one calm workspace for deep work.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px"><button type="button" class="primary" data-enter style="padding:14px 28px;font-size:15px">Open Focus Desk →</button><button type="button" class="ghost landing-ghost" data-landing-how>How it works</button></div><div class="muted" style="margin-top:12px;font-size:12px">Free forever · No account needed to start</div></div><div class="grid three landing-feats"><div class="card"><div class="emoji">${sicon("timer")}</div><h3>Smart timer</h3><p class="muted">Focus, short and long breaks with custom lengths and gentle anti-distraction rules.</p></div><div class="card"><div class="emoji">${sicon("fire")}</div><h3>Streaks & garden</h3><p class="muted">Every session plants a flower and pays coins. Consistency compounds.</p></div><div class="card"><div class="emoji">${sicon("users")}</div><h3>Study together</h3><p class="muted">Sprint rooms, group challenges, messages and voice notes with buddies.</p></div></div><div class="card" id="landing-how" style="margin-top:18px"><h2>How it works</h2><ol class="detail-steps"><li><strong>Pick a task</strong> — name what you'll work on.</li><li><strong>Start a session</strong> — focused minutes, phone down.</li><li><strong>Rest & repeat</strong> — short breaks between, coins and streaks after.</li></ol></div><footer class="landing-foot muted">StudyFlow · made for deep work</footer></div>`

  $("[data-enter]").onclick = () => {
    state.entered = true

    persist()

    if (state.techCheck && state.techCheck.done) enterApp()
    else startTechCheck("onboard")
  }

  $("[data-landing-how]").onclick = () => {
    try {
      $("#landing-how")?.scrollIntoView({
        behavior: state.reduceMotion ? "auto" : "smooth",
      })
    } catch {
      /* ignore */
    }
  }
}

function renderAccount() {
  const target = $("#tab-account")

  const user = state.user

  const sidePanel = !user
    ? `<aside class="auth-side" aria-label="Why join StudyFlow"><div class="auth-side-glow" aria-hidden="true"></div><div class="eyebrow">Why join</div><h3>Everything you do here, kept.</h3><p class="muted">A free account follows you across devices and keeps every streak, coin and highlight safe.</p><div class="auth-side-stats"><div class="auth-side-stat"><b>${Math.max(0, Number(state.sessions) || 0)}</b><small>session${
        (Number(state.sessions) || 0) === 1 ? "" : "s"
      } focused so far</small></div><div class="auth-side-stat"><b>${state.coins || 0}</b><small>coins ready to sync</small></div><div class="auth-side-stat"><b>${(state.books || []).length}</b><small>book${
        (state.books || []).length === 1 ? "" : "s"
      } on your shelf</small></div></div><ul class="auth-side-perks"><li><span>${sicon("fire")}</span><div><strong>Streaks that travel</strong><small>Your garden and streak survive a lost laptop.</small></div></li><li><span>${sicon("users")}</span><div><strong>Study together</strong><small>Sprint rooms, gifts and group challenges.</small></div></li><li><span>${sicon("refresh")}</span><div><strong>Cloud save</strong><small>Pick up on your phone mid-revision.</small></div></li><li><span>${sicon("shield")}</span><div><strong>Private by default</strong><small>You choose who sees your activity.</small></div></li></ul></aside>`
    : ""

  target.innerHTML = `<div class="account-page"><div class="account-hero"><div><div class="eyebrow">StudyFlow identity</div><h1>${
    user ? "Your account, your space." : "A calmer way to sign in."
  }</h1><p class="lede">${
    user
      ? "Manage your profile, privacy, and connected sessions from one secure place."
      : "Join your focused workspace and keep your progress with you across devices."
  }</p></div><div class="account-orbit"><span>◷</span><i></i><b></b></div></div>${completenessMarkup()}<div class="auth-split"><div class="card auth-card">${
    user ? accountSignedInMarkup(user) : accountAuthMarkup()
  }</div>${sidePanel}</div>${
    user ? badgeShelfMarkup() : ""
  }${dataMarkup()}${privacyCard()}</div>`

  bindAccount(target)
}

// Badge shelf: every acquired badge on display, tap to showcase — there is

// NO cap, showcase as many as you own. Rarity ring glows for tiered

// box exclusives; plain badges get the sage ring.

function badgeShelfMarkup() {
  const owned = ownedBadges()

  const ids = showcasedBadgeIds()

  const tiles = owned
    .map((b) => {
      const on = ids.includes(b.id)

      const tier = String(b.tier || "").toLowerCase()

      return `<button type="button" class="badge-tile${on ? " on" : ""}${
        tier ? ` tier-${tier}` : ""
      }" data-shelf-badge="${esc(b.id)}" aria-pressed="${on}" title="${esc(b.name)} — ${
        on ? "tap to remove from showcase" : "tap to showcase"
      }"><span class="badge-medal">${b.emoji}</span>${
        on ? `<span class="badge-check">${sicon("check")}</span>` : ""
      }<strong>${esc(b.name.replace(/\s*badge\s*/i, ""))}</strong>${
        tier
          ? `<small class="rarity-${tier}">${esc(b.tier)}</small>`
          : `<small>${on ? "showcased" : "tap to showcase"}</small>`
      }</button>`
    })
    .join("")

  return `<div class="card badge-shelf"><div class="section-row"><h2>${sicon("trophy")} Badge shelf</h2><span class="tag" data-shelf-count>${ids.length} showcased</span></div>${
    owned.length
      ? `<p class="muted">Your collection — tap badges to line them up beside your name. Showcase as many as you like.</p><div class="badge-grid">${tiles}</div>`
      : `<div class="empty-state"><div class="emoji">${sicon("medal")}</div><h3>No badges yet</h3><p class="muted">Earn them in focus sessions, events and mystery boxes — then showcase your favorites here.</p><button type="button" class="primary" data-goto-store>Earn badges</button></div>`
  }</div>`
}

function bindBadgeShelf(root) {
  const grid = $("[data-shelf-badge]", root)

  if (!grid && !$("[data-goto-store]", root)) return

  $$("[data-shelf-badge]", root).forEach(
    (b) =>
      (b.onclick = () => {
        const item = (state.owned || []).find(
          (o) => o && o.id === b.dataset.shelfBadge,
        )

        if (!item) return

        const result = toggleShowcaseBadge(item)

        persist()

        renderAccount()

        notify(
          result === "added"
            ? `${item.name} showcased`
            : result === "removed"
              ? "Badge removed from showcase"
              : "That isn't a badge",
        )
      }),
  )

  $("[data-goto-store]", root)?.addEventListener("click", () => {
    state.tab = "store"

    persist()

    shell()
  })
}

function accountAuthMarkup() {
  const reset = state.accountView === "reset"

  const create = state.accountView === "create"

  return `<div class="auth-header"><span class="auth-kicker">${
    reset ? "Account recovery" : create ? "Start your journey" : "Welcome back"
  }</span><h2>${
    reset
      ? "Reset your password"
      : create
        ? "Create your StudyFlow account"
        : "Sign in to StudyFlow"
  }</h2><p class="muted">${
    reset
      ? "We will send a secure reset link to your email."
      : create
        ? "Your focus history should travel with you."
        : "Pick up exactly where your attention left off."
  }</p></div><div class="auth-tabs"><button type="button" data-auth-view="welcome" class="${
    !create && !reset ? "active" : ""
  }">Sign in</button><button type="button" data-auth-view="create" class="${
    create ? "active" : ""
  }">Create account</button><button type="button" data-auth-view="reset" class="${
    reset ? "active" : ""
  }">Reset password</button></div>${
    reset
      ? `<label class="field-label">Email<input class="input" id="account-email" type="email" placeholder="you@example.com"></label><button type="button" class="primary auth-submit" data-reset-password>Send reset link</button>`
      : `<label class="field-label">Email<input class="input" id="account-email" type="email" placeholder="you@example.com"></label>${pwFieldMarkup("account-password", "Password", "At least 6 characters", create ? "new-password" : "current-password")}${
          create
            ? `<label class="field-label">Display name<input class="input" id="account-name" placeholder="How should we call you?"></label>${handleFieldMarkup("account-handle", "", "Claim it now, or roll for ideas")}<label class="field-label">Country (optional)<input class="input" id="account-country" placeholder="e.g. Ghana"></label><label class="field-label">Phone number (optional)<input class="input" id="account-phone" type="tel" placeholder="e.g. +233 ..."></label><label class="field-label">University (optional)<input class="input" id="account-university" placeholder="Where do you school?"></label><label class="field-label">Subjects you study (optional)<input class="input" id="account-subjects" placeholder="e.g. Calculus, Web Development"></label>${
                create ? privacyConsentMarkup("account-privacy") : ""
              }`
            : ""
        }<button type="button" class="primary auth-submit" data-email-auth>${
          create ? "Create account" : "Sign in"
        }</button><div class="auth-divider"><span>or continue with</span></div><div class="oauth-row"><button type="button" class="oauth google" data-provider="google"><b>G</b> Google</button><button type="button" class="oauth apple" data-provider="apple"><b>●</b> Apple</button></div><p class="auth-foot">Already have a verification email? <button type="button" class="text-button" data-resend>Resend it</button></p>`
  }`
}

function accountSignedInMarkup(user) {
  const verified = Boolean(user.email_confirmed_at)

  return `<div class="auth-header"><span class="auth-kicker">${
    verified ? "Authenticated" : "Verification required"
  }</span><h2>${
    verified ? "You are signed in." : "Verify your email."
  }</h2><p class="muted">${esc(user.email || state.profile.handle)} · ${
    verified
      ? "Your cloud workspace is active."
      : "Confirm your email to unlock secure cloud access."
  }</p></div>${
    verified
      ? ""
      : `<div class="verification-banner"><strong>Check your inbox</strong><span>We sent a confirmation link to ${esc(user.email || "your email")}.</span><button type="button" class="ghost" data-resend-account>Resend verification</button></div>`
  }<div class="session-card"><div class="avatar">${avatarMarkup(state.profile.photo, equippedAvatarEmoji() || state.profile.avatar)}</div><div><strong>${esc(state.profile.name)}${
    equippedBadgeEmoji()
      ? ` <span class="showcase-badges" title="Showcased badges">${equippedBadgeEmoji()}</span>`
      : ""
  }</strong><small>@${esc(state.profile.handle)}${
    user.created_at
      ? ` · member since ${new Date(user.created_at).toLocaleDateString()}`
      : ""
  }${
    user.app_metadata?.provider && user.app_metadata.provider !== "email"
      ? ` · via ${esc(user.app_metadata.provider)}`
      : ""
  }</small></div><span class="status-pill">${
    verified ? "Active session" : "Pending verification"
  }</span></div><div class="privacy-panel"><div class="section-row"><h3>Privacy controls</h3><span class="tag">Saved locally + cloud</span></div><label class="toggle-row"><span><strong>Profile visibility</strong><small>Who can view your profile</small></span><select class="select" id="profile-visibility"><option value="private" ${
    state.privacy.profileVisibility === "private" ? "selected" : ""
  }>Only me</option><option value="friends" ${
    state.privacy.profileVisibility === "friends" ? "selected" : ""
  }>Friends</option><option value="public" ${
    state.privacy.profileVisibility === "public" ? "selected" : ""
  }>Everyone</option></select></label><label class="toggle-row"><span><strong>Activity visibility</strong><small>Who can see your study activity</small></span><select class="select" id="activity-visibility"><option value="private" ${
    state.privacy.activityVisibility === "private" ? "selected" : ""
  }>Only me</option><option value="friends" ${
    state.privacy.activityVisibility === "friends" ? "selected" : ""
  }>Friends</option><option value="public" ${
    state.privacy.activityVisibility === "public" ? "selected" : ""
  }>Everyone</option></select></label><label class="toggle-row"><span><strong>Searchable profile</strong><small>Allow others to find you by handle</small></span><input id="profile-searchable" type="checkbox" ${
    state.privacy.searchable ? "checked" : ""
  }></label></div><div class="auth-actions"><button type="button" class="ghost" data-profile-modal>Edit profile</button><button type="button" class="danger-button" data-global-signout>Sign out everywhere</button></div>`
}

function bindAccount(root) {
  bindBadgeShelf(root)

  bindHandleDice(root)

  bindPwToggles(root)

  $$("[data-auth-view]", root).forEach(
    (button) =>
      (button.onclick = () => {
        state.accountView = button.dataset.authView

        renderAccount()
      }),
  )

  // Consent gate: the Create-account button dims until the mandatory box is

  // ticked. The button stays clickable so an unticked tap can explain itself.

  const paintConsentGate = () => {
    const box = $("#account-privacy", root)

    const btn = $("[data-email-auth]", root)

    if (!box || !btn || state.accountView !== "create") return

    btn.classList.toggle("gated", !box.checked)

    const wrap = box.closest("[data-consent-wrap]")

    if (wrap) wrap.dataset.unticked = box.checked ? "0" : "1"
  }

  $("#account-privacy", root)?.addEventListener("change", paintConsentGate)

  paintConsentGate()

  $("[data-email-auth]", root)?.addEventListener("click", async (e) => {
    const btn = e.currentTarget

    const email = $("#account-email", root).value.trim()

    const password = $("#account-password", root).value

    const create = state.accountView === "create"

    if (create && !$("#account-privacy", root)?.checked) {
      notify(
        "Please tick “I agree to the Privacy & Community Guidelines” first — it's required to create your account.",
      )

      $("#account-privacy", root)
        ?.closest("[data-consent-wrap]")
        ?.scrollIntoView({ behavior: "smooth", block: "center" })

      return
    }

    if (!email || !password) return notify("Enter your email and password")

    btn.disabled = true

    const label = btn.textContent

    btn.textContent = "Signing in…"

    const done = () => {
      btn.disabled = false

      btn.textContent = label
    }

    const profileExtras = create
      ? {
          name: $("#account-name", root)?.value.trim() || "Study Learner",

          handle:
            $("#account-handle", root)?.value.trim().replace(/\s+/g, "_") ||
            randomHandle(),

          country: $("#account-country", root)?.value.trim() || "",

          phone: $("#account-phone", root)?.value.trim() || "",

          university: $("#account-university", root)?.value.trim() || "",

          subjects: ($("#account-subjects", root)?.value || "")

            .split(",")

            .map((s) => s.trim())

            .filter(Boolean)

            .slice(0, 12),
        }
      : {}

    const result = create
      ? await signUpWithEmail(email, password, profileExtras)
      : await signInWithEmail(email, password)

    if (result.error) {
      done()

      return notify(friendlyAuthError(result.error))
    }

    if (create) {
      if (profileExtras.name && state.profile.name === "Study Learner")
        state.profile.name = profileExtras.name

      state.profile.email = email

      state.profile.country = profileExtras.country

      state.profile.phone = profileExtras.phone

      state.profile.university = profileExtras.university

      state.profile.subjects = profileExtras.subjects || []

      markPrivacyAccepted()
    }

    state.user = result.data?.user || (await getCurrentUser())

    // When email confirmation is required, signUp returns the user but there

    // is NO session — hydrateCloudState would only misfire a sync error.

    if (await hasActiveSession()) {
      // Same-device archive from the last sign-out comes back first.

      if (restoreArchivedState(state.user.id)) {
        sessionStorage.setItem("sf-restored", "1")

        location.reload()

        return
      }

      await hydrateCloudState(state.user)

      await pullProductivity()

      pullRewards().catch(() => {})

      pullMusic().catch(() => {})

      syncBooksLibrary().catch(() => {})

      notify(create ? "Account created" : "Signed in successfully")
    } else {
      notify(
        "Account created — check your email for the confirmation link, then sign in.",
      )

      state.user = null
    }

    renderAccount()
  })

  $("[data-reset-password]", root)?.addEventListener("click", async () => {
    const email = $("#account-email", root).value.trim()

    if (!email) return notify("Enter your email first")

    const result = await requestPasswordReset(email)

    if (result.error) return notify(friendlyAuthError(result.error))

    notify("Password reset link sent — check your inbox")
  })

  $$("[data-provider]", root).forEach(
    (button) =>
      (button.onclick = async () => {
        if (
          state.accountView === "create" &&
          !$("#account-privacy", root)?.checked
        ) {
          notify(
            "Please tick “I agree to the Privacy & Community Guidelines” first — it's required to create your account.",
          )

          $("#account-privacy", root)
            ?.closest("[data-consent-wrap]")
            ?.scrollIntoView({ behavior: "smooth", block: "center" })

          return
        }

        const result = await signInWithProvider(button.dataset.provider)

        if (result.error) notify(friendlyAuthError(result.error))
        else if (state.accountView === "create") markPrivacyAccepted()
      }),
  )

  $("[data-resend]", root)?.addEventListener("click", async () => {
    const email = $("#account-email", root).value.trim()

    if (!email) return notify("Enter your email first")

    const result = await resendVerification(email)

    notify(
      result.error
        ? friendlyAuthError(result.error)
        : "Verification email sent — check your inbox",
    )
  })

  $("[data-resend-account]", root)?.addEventListener("click", async () => {
    const result = await resendVerification(state.user?.email)

    notify(
      result.error
        ? friendlyAuthError(result.error)
        : "Verification email sent — check your inbox",
    )
  })

  $("[data-profile-modal]", root)?.addEventListener("click", openProfile)

  $$("[data-complete-profile]", root).forEach(
    (b) => (b.onclick = openProfile),
  )

  $("[data-export]", root)?.addEventListener("click", exportData)

  $("[data-clear-history]", root)?.addEventListener("click", clearLocalHistory)

  bindDataZone(root)

  $("[data-global-signout]", root)?.addEventListener("click", async () => {
    await signOut()

    cloudStateSubscription?.unsubscribe()

    // Full guest state on sign-out: archive + purge all personal data.

    archiveStateForSignOut(state.user?.id || null)

    haltPersist()

    sessionStorage.setItem("sf-signed-out", "1")

    location.reload()
  })

  $("#profile-visibility", root)?.addEventListener("change", savePrivacy)

  $("#activity-visibility", root)?.addEventListener("change", savePrivacy)

  $("#profile-searchable", root)?.addEventListener("change", savePrivacy)
}

function savePrivacy() {
  state.privacy = {
    profileVisibility:
      $("#profile-visibility")?.value || state.privacy.profileVisibility,

    activityVisibility:
      $("#activity-visibility")?.value || state.privacy.activityVisibility,

    searchable: $("#profile-searchable")?.checked ?? state.privacy.searchable,
  }

  persist()

  if (state.user)
    syncProfile({ ...state.profile, ...state.privacy }).then((res) => {
      if (res?.error) notify(friendlyProfileError(res.error))
      else notify("Privacy settings saved")
    })
  else notify("Privacy settings saved")
}

/* ---------- Privacy & Community Guidelines ---------- */

const PRIVACY_VERSION = "1.0"

const PRIVACY_UPDATED = "September 2026"

const PRIVACY_DOC = {
  promise: [
    [
      "Your focus stays yours",
      "StudyFlow is local-first. Sessions, tasks and streaks live in your browser; cloud sync only switches on when you create an account.",
    ],

    [
      "Take it or erase it",
      "Export a full backup or wipe everything any time from Settings → Your data. No dark patterns, no ransom.",
    ],

    [
      "You control the room",
      "Block, mute and report tools sit wherever people can reach you — groups, chats, notes and calls.",
    ],

    [
      "Humans review reports",
      "Every report lands with a moderator, never on a public wall. Repeat offenders lose their accounts.",
    ],
  ],

  dos: [
    [
      "Focus honestly",
      "Run real sessions. Streaks, gardens and leaderboards only mean something because they are earned.",
    ],

    [
      "Be kind and encouraging",
      "Celebrate other learners' wins and give feedback that actually helps.",
    ],

    [
      "Share what you learn",
      "Notes, techniques and honest questions make the whole community sharper.",
    ],

    [
      "Protect your account",
      "Use a strong, unique password, verify your email, and never share login codes with anyone.",
    ],

    [
      "Keep your profile truthful",
      "Your real display name and handle, your own photo or avatar — no borrowed identities.",
    ],

    [
      "Report, don't retaliate",
      "See something wrong? Block and report it. Moderators handle the rest — clap-backs start fires.",
    ],

    [
      "Credit your sources",
      "Quote books, teachers and fellow learners. Shared knowledge grows when credit flows.",
    ],
  ],

  donts: [
    [
      "No fake sessions or timer gaming",
      "Bots, inflated minutes or backgrounded timers cheapen every shared board. Play straight.",
    ],

    [
      "No harassment, hate or threats",
      "Bullying, hate speech and intimidation carry zero tolerance — first offence can end an account.",
    ],

    [
      "No spam, scams or ads",
      "No flooding chats, phishing links, fake giveaways or referral farming outside the referral feature.",
    ],

    [
      "No adult or graphic content",
      "Stories, photos, videos and files stay safe-for-study, always.",
    ],

    [
      "No impersonation",
      "Never pose as another learner, a school, or StudyFlow staff.",
    ],

    [
      "No private info — yours or anyone's",
      "Phone numbers, addresses, passwords and personal photos of others stay off the platform.",
    ],

    [
      "No pirated materials",
      "Don't upload paid books, exam leaks or course content you don't own or can't share.",
    ],

    [
      "No ban evasion",
      "Blocked means blocked. New accounts made to dodge moderation will be removed with the old ones.",
    ],
  ],
}

function markPrivacyAccepted() {
  state.privacyAccepted = { version: PRIVACY_VERSION, at: Date.now() }

  persist()
}

function privacyAccepted() {
  return Boolean(
    state.privacyAccepted && state.privacyAccepted.version === PRIVACY_VERSION,
  )
}

function privacyAgreementMarkup(boxId) {
  return `<div class="agree-row"><input type="checkbox" id="${boxId}"><span>I agree to the <button type="button" class="linklike" data-privacy-open>Privacy &amp; Community Guidelines</button></span></div>`
}

// Mandatory consent block, shown ONLY inside the Create-account form,

// immediately above the Create account button. The checkbox gates the

// button until ticked (top-notch UX: the state is visible at a glance),

// and "Privacy & Community Guidelines" opens the full document.

function privacyConsentMarkup(boxId) {
  return `<div class="privacy-consent in-form" data-consent-wrap><label class="agree-row"><input type="checkbox" id="${boxId}" data-consent-check><span>I agree to the <button type="button" class="linklike" data-privacy-open>Privacy &amp; Community Guidelines</button> — required to create an account</span></label></div>`
}

function privacyDocSections() {
  return `<div class="privacy-sec"><div class="eyebrow">Our promise</div><div class="promise-grid">${PRIVACY_DOC.promise.map(([t, d]) => `<div class="promise-card"><strong>${esc(t)}</strong><span>${esc(d)}</span></div>`).join("")}</div></div>
  <div class="privacy-sec"><div class="eyebrow do">The do's</div><div class="rule-grid">${PRIVACY_DOC.dos.map(([t, d], i) => `<div class="rule-card do"><span class="rule-num">${i + 1}</span><div><strong>${esc(t)}</strong><span>${esc(d)}</span></div><span class="rule-mark">✓</span></div>`).join("")}</div></div>
  <div class="privacy-sec"><div class="eyebrow dont">The don'ts</div><div class="rule-grid">${PRIVACY_DOC.donts.map(([t, d], i) => `<div class="rule-card dont"><span class="rule-num">${i + 1}</span><div><strong>${esc(t)}</strong><span>${esc(d)}</span></div><span class="rule-mark">✕</span></div>`).join("")}</div></div>
  <div class="privacy-sec"><div class="eyebrow">Staying safe</div><p class="muted">Mute a noisy group · block anyone who crosses a line · report with a reason and it reaches moderation. Manage your visibility any time in Account → Privacy controls, and your data in Settings → Your data.</p></div>`
}

function openPrivacy() {
  document.querySelector("[data-privacy-modal]")?.remove()

  const modal = document.createElement("div")

  modal.className = "modal-backdrop"

  modal.setAttribute("data-privacy-modal", "")

  modal.innerHTML = `<div class="modal privacy-modal"><div class="privacy-hero"><div class="privacy-crest">◷</div><div><div class="eyebrow">StudyFlow · Trust &amp; safety</div><h2>Privacy &amp; Community Guidelines</h2><p class="muted">Version ${PRIVACY_VERSION} · ${PRIVACY_UPDATED} · the do's and don'ts of our study home</p></div></div>${privacyDocSections()}<div class="modal-actions" style="margin-top:18px"><button type="button" class="ghost" data-privacy-pdf>${sicon("download")} Save as PDF</button><button type="button" class="ghost" data-privacy-close>Close</button><button type="button" class="primary" data-privacy-accept>I accept</button></div></div>`

  $("#modal-root").append(modal)

  modal.querySelector("[data-privacy-close]").onclick = () => modal.remove()

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove()
  })

  modal.querySelector("[data-privacy-pdf]").onclick = () => downloadPrivacyPDF()

  modal.querySelector("[data-privacy-accept]").onclick = () => {
    markPrivacyAccepted()

    try {
      document
        .querySelectorAll("#account-privacy, #auth-privacy")
        .forEach((box) => {
          box.checked = true
        })
    } catch {
      /* ignore */
    }

    modal.remove()

    if (state.tab === "account") shell()

    notify("Guidelines accepted — welcome in " + sicon("check"))
  }
}

function privacyCrestSvg() {
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="#e9ae3f" stroke-width="3"/><circle cx="32" cy="32" r="22" fill="#ffffff" opacity="0.14"/><path d="M36 10 L22 36 h10 L28 54 L44 26 h-11 z" fill="#e9ae3f"/><circle cx="32" cy="32" r="29" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.35"/></svg>`
}

function downloadPrivacyPDF() {
  const rows = (list, mark, cls) =>
    list
      .map(
        ([t, d], i) =>
          `<div class="rule ${cls}"><span class="num">${i + 1}</span><div><strong>${t}</strong><span>${d}</span></div><span class="mark">${mark}</span></div>`,
      )
      .join("")

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>StudyFlow-Privacy-Guidelines-v${PRIVACY_VERSION}</title><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #17221d; background: #fff; }
    .hero { background: linear-gradient(135deg, #0f2a1e 0%, #1d4a32 55%, #47765a 100%); color: #fff; padding: 44px 48px 36px; position: relative; overflow: hidden; }
    .hero::after { content: ""; position: absolute; right: -70px; top: -70px; width: 260px; height: 260px; border-radius: 50%; border: 26px solid rgba(233,174,63,.25); }
    .hero::before { content: ""; position: absolute; right: 60px; bottom: -110px; width: 200px; height: 200px; border-radius: 50%; border: 18px solid rgba(255,255,255,.08); }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand svg { width: 54px; height: 54px; }
    .brand-name { font-size: 30px; font-weight: bold; letter-spacing: .5px; }
    .brand-sub { font-size: 12px; letter-spacing: 3px; text-transform: uppercase; color: #e9ae3f; margin-top: 2px; }
    h1 { font-size: 34px; margin: 22px 0 6px; }
    .meta { font-size: 12.5px; color: #cfe0d5; }
    .meta b { color: #e9ae3f; }
    .body { padding: 30px 48px 40px; }
    h2 { font-size: 13px; letter-spacing: 2.5px; text-transform: uppercase; color: #47765a; margin: 26px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e9e2cf; }
    h2.red { color: #b3402e; }
    .promise { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .promise div { background: #f2f6ef; border-left: 4px solid #47765a; border-radius: 0 10px 10px 0; padding: 10px 12px; font-size: 12.5px; }
    .promise strong { display: block; font-size: 13px; margin-bottom: 2px; }
    .rule { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #e4e8df; border-radius: 10px; padding: 9px 12px; margin-bottom: 8px; font-size: 12.5px; page-break-inside: avoid; }
    .rule .num { width: 22px; height: 22px; border-radius: 50%; background: #17221d; color: #fff; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; flex: none; }
    .rule strong { display: block; font-size: 13px; }
    .rule span span, .rule div span { color: #5c665e; }
    .rule .mark { margin-left: auto; font-weight: bold; font-size: 15px; flex: none; }
    .rule.do .mark { color: #2f7d4f; } .rule.dont .mark { color: #b3402e; }
    .rule.do { border-left: 4px solid #2f7d4f; } .rule.dont { border-left: 4px solid #b3402e; }
    .safe { background: #fdf6e3; border: 1px solid #ead9a8; border-radius: 10px; padding: 12px 14px; font-size: 12.5px; }
    .foot { margin-top: 26px; padding-top: 14px; border-top: 2px solid #17221d; display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: #5c665e; }
    .foot .sig { border-top: 1px solid #999; padding-top: 4px; min-width: 220px; text-align: center; }
    @media print { .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body><div class="hero"><div class="brand">${privacyCrestSvg()}<div><div class="brand-name">StudyFlow</div><div class="brand-sub">Focus with intention</div></div></div><h1>Privacy &amp; Community Guidelines</h1><div class="meta">The do's and don'ts of our study home · <b>Version ${PRIVACY_VERSION}</b> · ${PRIVACY_UPDATED}</div></div><div class="body">
  <h2>Our promise to you</h2><div class="promise">${PRIVACY_DOC.promise.map(([t, d]) => `<div><strong>${t}</strong>${d}</div>`).join("")}</div>
  <h2>The do's — how great members show up</h2>${rows(PRIVACY_DOC.dos, "✓", "do")}
  <h2 class="red">The don'ts — what ends accounts</h2>${rows(PRIVACY_DOC.donts, "✕", "dont")}
  <h2>Staying safe</h2><div class="safe">Mute a noisy group · block anyone who crosses a line · report with a reason and a moderator reviews it. Manage visibility in Account → Privacy controls, and your data in Settings → Your data (export or wipe any time).</div>
  <div class="foot"><span>StudyFlow · made for deep work · generated ${new Date().toLocaleDateString()}</span><span class="sig">Reader's signature &amp; date</span></div>
  </div><script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };<\/script></body></html>`

  let w = null

  try {
    w = window.open("", "_blank", "width=960,height=720")
  } catch {
    w = null
  }

  if (!w) {
    notify("Allow popups so the guidelines PDF can open")

    return
  }

  try {
    w.document.write(html)

    w.document.close()

    w.focus()
  } catch {
    notify("Could not open the PDF — try again")
  }
}

function privacyCard() {
  const a = state.privacyAccepted

  const ok = privacyAccepted()

  return `<div class="card" style="margin-top:18px"><div class="section-row"><h2>Privacy &amp; guidelines</h2><span class="tag">${
    ok ? "accepted" : "review"
  }</span></div><p class="muted">${
    ok
      ? `You accepted version ${esc(a.version)}${
          a.at ? ` on ${new Date(a.at).toLocaleDateString()}` : ""
        }. The house rules live here whenever you need them.`
      : "Read the do's and don'ts of StudyFlow — your data rights, safety tools and community rules in one place."
  }</p><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" class="ghost" data-privacy-open>Read guidelines</button><button type="button" class="ghost" data-privacy-pdf>${sicon("download")} Save as PDF</button></div></div>`
}

if (!window.__sfPrivacyBound) {
  window.__sfPrivacyBound = true

  document.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-privacy-open]")) {
      e.preventDefault()

      openPrivacy()

      return
    }

    if (e.target?.closest?.("[data-privacy-pdf]")) {
      e.preventDefault()

      downloadPrivacyPDF()
    }
  })
}

function flowCard() {
  const a = state.autostart || {}

  return `<div class="card"><div class="section-row"><h2>Flow</h2><span class="tag">auto</span></div><p class="muted">Chain sessions with a 5-second countdown. Backing out cancels it.</p><label class="toggle-row"><span><strong>Auto-start breaks</strong><small>After each focus session</small></span><input type="checkbox" data-auto="breaks"${
    a.breaks ? " checked" : ""
  }></label><label class="toggle-row"><span><strong>Auto-start focus</strong><small>After each break</small></span><input type="checkbox" data-auto="focus"${
    a.focus ? " checked" : ""
  }></label></div>`
}

function themeCard() {
  const skin = state.customSkin?.vars || {
    paper: "#f6f7f2",

    panel: "#ffffff",

    ink: "#17221d",

    muted: "#66736a",

    line: "#dfe6dc",

    sage: "#47765a",
  }

  const isCustom = state.equipped?.theme === "custom"

  const row = (key, label) =>
    `<label class="skin-row"><span>${label}</span><input type="color" data-skin="${key}" value="${skin[key] || "#000000"}"></label>`

  return `<div class="card"><div class="section-row"><h2>My theme</h2>${
    isCustom ? '<span class="tag">in use</span>' : ""
  }</div><p class="muted">Mix your own skin — previews live, saves instantly.</p><div class="skin-grid">${row("sage", "Primary")}${row("paper", "Background")}${row("panel", "Cards")}${row("ink", "Text")}${row("muted", "Muted text")}${row("line", "Borders")}</div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" class="primary" data-skin-use>Use my theme</button><button type="button" class="ghost" data-skin-reset>Reset</button></div></div>`
}

function displayCard() {
  const d = state.display || {}

  const zoom = d.zoom || 1

  return `<div class="card"><div class="section-row"><h2>Display</h2><span class="tag">comfort</span></div><label class="toggle-row"><span><strong>Compact mode</strong><small>Tighter spacing, smaller ring</small></span><input type="checkbox" id="set-compact"${
    d.compact ? " checked" : ""
  }></label><div class="section-row" style="margin-top:14px"><h3>Text size</h3></div><div class="seg-row" role="group" aria-label="Text size">${[
    [0.9, "S"],
    [1, "M"],
    [1.12, "L"],
  ]
    .map(
      ([v, label]) =>
        `<button type="button" class="seg${
          zoom === v ? " on" : ""
        }" data-zoom="${v}">${label}</button>`,
    )
    .join("")}</div></div>`
}

function notifCard() {
  const prefs = state.notifPrefs || {}

  const volPct = Math.round((state.chimeVolume ?? 0.8) * 100)

  const on = (k) => (prefs[k] !== false ? " checked" : "")

  return `<div class="card"><div class="section-row"><h2>Notifications</h2><span class="tag">alerts</span></div><label class="field-label">Completion chime<select class="select" id="set-chime">${Object.entries(
    CHIMES,
  )
    .map(
      ([id, c]) =>
        `<option value="${id}"${
          (state.chimeStyle || "arpeggio") === id ? " selected" : ""
        }>${c.label}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="mix-row"><span class="muted" style="min-width:56px">Volume</span><input type="range" min="0" max="100" value="${volPct}" data-chime-vol aria-label="Chime volume"><span class="mix-pct" data-chime-pct>${volPct}%</span><button type="button" class="ghost" data-chime-test style="padding:8px 12px">Test</button></div><label class="toggle-row"><span><strong>Session completions</strong><small>Chime + notification when timers finish</small></span><input type="checkbox" data-notif="completion"${on("completion")}></label><label class="toggle-row"><span><strong>Streak milestones</strong><small>Celebrate 7, 30, 100-day streaks</small></span><input type="checkbox" data-notif="streaks"${on("streaks")}></label><label class="toggle-row"><span><strong>Community messages</strong><small>Notify on new incoming messages</small></span><input type="checkbox" data-notif="community"${on("community")}></label></div>`
}

function comfortCard() {
  return `<div class="card"><div class="section-row"><h2>Daily reminder</h2><span class="tag">nudge</span></div><p class="muted">One gentle nudge a day, while StudyFlow is open.</p><label class="toggle-row"><span><strong>Remind me to focus</strong><small>Every day at your chosen time</small></span><input type="checkbox" id="set-reminder-on"${
    state.reminder?.enabled ? " checked" : ""
  }></label><label class="field-label">Reminder time<input class="input" id="set-reminder-time" type="time" value="${esc(state.reminder?.time || "18:00")}"></label><div class="section-row" style="margin-top:18px"><h2>Comfort</h2></div><label class="toggle-row"><span><strong>Reduce motion</strong><small>Still interface, no pulse or slide effects</small></span><input type="checkbox" id="set-motion"${
    state.reduceMotion ? " checked" : ""
  }></label></div>`
}

function shortcutsCard() {
  return `<div class="card"><div class="section-row"><h2>Shortcuts</h2><span class="tag">keys</span></div><div class="shortcut-list"><div><kbd>Space</kbd><span>Start / pause the timer</span></div><div><kbd>R</kbd><span>Reset the focus session</span></div><div><kbd>F</kbd><span>Focus view</span></div><div><kbd>Ctrl K</kbd><span>Search everything</span></div><div><kbd>Esc</kbd><span>Close the search</span></div></div><button type="button" class="ghost" data-whatsnew style="margin-top:12px">See what's new</button> <button type="button" class="ghost" data-tour-replay style="margin-top:12px">Replay tour</button></div>`
}

function appearanceCard() {
  return `<div class="card"><div class="section-row"><h2>Appearance</h2><span class="tag">${
    state.night ? "night" : "day"
  }</span></div><p class="muted">Switch the whole app between Day and Night mode. Your choice saves instantly and follows your account.</p><div class="seg-row" role="group" aria-label="Color mode"><button type="button" class="seg${
    !state.night ? " on" : ""
  }" data-mode-set="day">Day</button><button type="button" class="seg${
    state.night ? " on" : ""
  }" data-mode-set="night">Night</button></div></div>`
}

function techCheckCard() {
  const tc = state.techCheck

  if (tc && tc.done && (tc.top || []).length) {
    const first = techInfo(tc.top[0])

    return `<div class="card"><div class="section-row"><h2>Study technique profile</h2><span class="tag">your check</span></div><p class="muted">Top match: <strong>${
      first ? esc(first[1]) : "—"
    }</strong>${
      tc.date ? ` · checked ${new Date(tc.date).toLocaleDateString()}` : ""
    }. Your Techniques tab highlights these picks.</p><button type="button" class="ghost" data-tc-retake>Retake Technique Check</button></div>`
  }

  return `<div class="card"><div class="section-row"><h2>Study technique profile</h2><span class="tag">discover</span></div><p class="muted">Answer 12 quick questions and we will highlight the techniques that may fit you best.</p><button type="button" class="primary" data-tc-start>Take the Technique Check</button></div>`
}

function renderSettings() {
  const target = $("#tab-settings")

  const minutes = state.timerMinutes || { focus: 25, short: 5, long: 15 }

  const seconds = state.timerSeconds || { focus: 0, short: 0, long: 0 }

  target.innerHTML = `${viewHead("Settings", "Tune your timer and keep your account secure.")}<div class="grid two">${appearanceCard()}<div class="card"><div class="section-row"><h2>Timer durations</h2><span class="tag">min + sec</span></div><p class="muted">Customise how long each session lasts, down to the second. Short break defaults to 5:00, long break to 15:00.</p><div class="duration-grid"><div><div class="eyebrow">Focus</div><div class="dur-pair"><label class="field-label">Min<input class="input" id="set-focus" type="number" min="0" max="180" step="1" value="${minutes.focus}"></label><label class="field-label">Sec<input class="input" id="set-focus-s" type="number" min="0" max="59" step="1" value="${seconds.focus}"></label></div></div><div><div class="eyebrow">Short break</div><div class="dur-pair"><label class="field-label">Min<input class="input" id="set-short" type="number" min="0" max="180" step="1" value="${minutes.short}"></label><label class="field-label">Sec<input class="input" id="set-short-s" type="number" min="0" max="59" step="1" value="${seconds.short}"></label></div></div><div><div class="eyebrow">Long break</div><div class="dur-pair"><label class="field-label">Min<input class="input" id="set-long" type="number" min="0" max="180" step="1" value="${minutes.long}"></label><label class="field-label">Sec<input class="input" id="set-long-s" type="number" min="0" max="59" step="1" value="${seconds.long}"></label></div></div></div><button type="button" class="primary" data-save-durations>Save durations</button></div><div class="card"><div class="section-row"><h2>Change password</h2><span class="tag">cloud accounts</span></div>${
    state.user && backendConfigured
      ? `<p class="muted">Signed in as ${esc(state.user.email || state.profile.handle)}. Enter a new password below.</p>${pwFieldMarkup("set-new-password", "New password", "At least 6 characters", "new-password")}${pwFieldMarkup("set-confirm-password", "Confirm new password", "Repeat the new password", "new-password")}<button type="button" class="primary" data-change-password>Update password</button>`
      : `<p class="muted">Password changes apply to your cloud account. ${
          backendConfigured
            ? "Sign in from the Account tab first."
            : "Add Supabase keys to enable cloud accounts."
        }</p><label class="field-label">Email<input class="input" id="set-reset-email" type="email" placeholder="you@example.com" value="${esc(state.profile.email || (state.user && state.user.email) || "")}"></label><button type="button" class="ghost" data-send-reset>Send reset link</button>`
  }</div>${notifCard()}${comfortCard()}${shortcutsCard()}${flowCard()}${themeCard()}${displayCard()}${techCheckCard()}${dataMarkup()}</div>`

  bindSettings(target)
}

function bindDataZone(root) {
  $("#import-file", root)?.addEventListener("change", (e) => {
    const file = e.target.files[0]

    e.target.value = ""

    if (!file) return

    const reader = new FileReader()

    reader.onload = () => {
      let parsed = null

      try {
        parsed = JSON.parse(reader.result)
      } catch {
        parsed = null
      }

      if (
        !parsed ||
        parsed.app !== "StudyFlow" ||
        !parsed.data ||
        typeof parsed.data !== "object" ||
        Array.isArray(parsed.data)
      ) {
        notify("That file is not a StudyFlow backup")

        return
      }

      const count = Object.keys(parsed.data).length

      confirmBox(
        "Restore backup?",

        `${count} records will overwrite everything here. Continue?`,

        () => {
          try {
            // Freeze writers first: the reload fires beforeunload handlers

            // that would otherwise re-save the pre-import state over the

            // restored keys (the wipe path already does this).

            haltPersist()

            Object.entries(parsed.data).forEach(([k, v]) => {
              if (typeof k === "string" && k.startsWith("sf-")) {
                localStorage.setItem(
                  k,

                  typeof v === "string" ? v : JSON.stringify(v),
                )
              }
            })

            location.reload()
          } catch {
            notify("Restore failed — storage unavailable")
          }
        },
      )
    }

    reader.readAsText(file)
  })

  $("[data-wipe]", root)?.addEventListener("click", wipeData)
}

function bindSettings(root) {
  bindDataZone(root)

  bindPwToggles(root)

  $$("[data-mode-set]", root).forEach(
    (b) =>
      (b.onclick = () => {
        if ((b.dataset.modeSet === "night") !== Boolean(state.night))
          toggleNight()

        renderSettings()
      }),
  )
  $("[data-tc-start]", root)?.addEventListener("click", () =>
    startTechCheck("settings"),
  )

  $("[data-tc-retake]", root)?.addEventListener("click", () =>
    startTechCheck("settings"),
  )

  $("[data-save-durations]", root)?.addEventListener("click", () => {
    const readPair = (minId, secId, label) => {
      const m = Number.parseInt($(minId, root)?.value, 10)

      const s = Number.parseInt($(secId, root)?.value, 10)

      if (!Number.isFinite(m) || m < 0 || m > 180) {
        notify(`${label}: minutes must be a number between 0 and 180.`)

        return null
      }

      if (!Number.isFinite(s) || s < 0 || s > 59) {
        notify(`${label}: seconds must be a number between 0 and 59.`)

        return null
      }

      if (m === 0 && s === 0) {
        notify(`${label} can't be 0:00 — set at least 1 second.`)

        return null
      }

      return { min: m, sec: s }
    }

    const f = readPair("#set-focus", "#set-focus-s", "Focus")

    if (!f) return

    const sh = readPair("#set-short", "#set-short-s", "Short break")

    if (!sh) return

    const l = readPair("#set-long", "#set-long-s", "Long break")

    if (!l) return

    state.timerMinutes = { focus: f.min, short: sh.min, long: l.min }

    state.timerSeconds = { focus: f.sec, short: sh.sec, long: l.sec }

    applyDurations()

    pushUserSettings()

    if (!sessionInProgress()) {
      state.time = durations[state.mode]

      state.sessionDuration = durations[state.mode]
    }

    persist()

    if (state.tab === "timer") renderTimer()

    notify(
      state.running
        ? "Durations saved — applies from your next session"
        : "Durations saved",
    )

    renderSettings()
  })

  $("[data-change-password]", root)?.addEventListener("click", async () => {
    const next = $("#set-new-password", root)?.value || ""

    const confirm = $("#set-confirm-password", root)?.value || ""

    if (next.length < 6) return notify("Password must be at least 6 characters")

    if (next !== confirm) return notify("Passwords do not match")

    const result = await updatePassword(next)

    if (result.error) return notify(friendlyAuthError(result.error))

    $("#set-new-password", root).value = ""

    $("#set-confirm-password", root).value = ""

    notify("Password updated")
  })

  $("[data-send-reset]", root)?.addEventListener("click", async () => {
    const email = $("#set-reset-email", root)?.value.trim()

    if (!email) return notify("Enter your email first")

    const result = await requestPasswordReset(email)

    notify(
      result.error
        ? friendlyAuthError(result.error)
        : "Password reset link sent — check your inbox",
    )
  })

  $("#set-chime", root)?.addEventListener("change", (e) => {
    state.chimeStyle = e.target.value

    persist()

    pushUserSettings()

    playChime("focus")
  })

  const chimeVol = $("[data-chime-vol]", root)

  if (chimeVol) {
    chimeVol.oninput = () => {
      state.chimeVolume = chimeVol.value / 100

      const pct = $("[data-chime-pct]", root)

      if (pct) pct.textContent = `${chimeVol.value}%`
    }

    chimeVol.onchange = () => {
      persist()

      pushUserSettings()

      playChime("focus")
    }
  }

  $("[data-chime-test]", root)?.addEventListener("click", () =>
    playChime("focus"),
  )

  $$("[data-notif]", root).forEach((box) =>
    box.addEventListener("change", () => {
      state.notifPrefs = {
        completion: true,

        streaks: true,

        community: true,

        ...(state.notifPrefs || {}),

        [box.dataset.notif]: box.checked,
      }

      persist()

      pushUserSettings()

      notify("Notification preference saved")
    }),
  )

  $("#set-reminder-on", root)?.addEventListener("change", (e) => {
    state.reminder = {
      enabled: e.target.checked,

      time: state.reminder?.time || "18:00",

      lastFired: state.reminder?.lastFired || "",
    }

    persist()

    notify(
      e.target.checked
        ? `Daily nudge set for ${state.reminder.time}`
        : "Daily nudge off",
    )
  })

  $("#set-reminder-time", root)?.addEventListener("change", (e) => {
    state.reminder = {
      enabled: state.reminder?.enabled || false,

      time: e.target.value || "18:00",

      lastFired: "",
    }

    persist()
  })

  $("#set-motion", root)?.addEventListener("change", (e) => {
    state.reduceMotion = e.target.checked

    persist()

    applyMotion()
  })

  $("[data-whatsnew]", root)?.addEventListener("click", () =>
    openWhatsNew(true),
  )

  $("[data-tour-replay]", root)?.addEventListener("click", () => {
    // Don't pre-set state.tab — startTour always rebuilds the shell so the

    // timer anchors (#task-input, [data-toggle]) exist even mid-settings.

    startTour()
  })

  $$("[data-auto]", root).forEach((box) =>
    box.addEventListener("change", () => {
      state.autostart = {
        breaks: false,

        focus: false,

        ...(state.autostart || {}),

        [box.dataset.auto]: box.checked,
      }

      persist()

      notify(
        box.checked ? "Auto-start on — 5s countdown" : "Auto-start off",
      )
    }),
  )

  $$("[data-skin]", root).forEach((picker) =>
    picker.addEventListener("input", () => {
      const vars = {
        paper: "#f6f7f2",

        panel: "#ffffff",

        ink: "#17221d",

        muted: "#66736a",

        line: "#dfe6dc",

        sage: "#47765a",

        ...(state.customSkin?.vars || {}),

        [picker.dataset.skin]: picker.value,
      }

      state.customSkin = { vars }

      persist()

      if (state.equipped?.theme === "custom") applyEquippedTheme()
    }),
  )

  $("[data-skin-use]", root)?.addEventListener("click", () => {
    if (!state.customSkin?.vars) {
      state.customSkin = {
        vars: {
          paper: "#f6f7f2",

          panel: "#ffffff",

          ink: "#17221d",

          muted: "#66736a",

          line: "#dfe6dc",

          sage: "#47765a",
        },
      }
    }

    state.equipped = { ...(state.equipped || {}), theme: "custom" }

    persist()

    pushUserSettings()

    applyEquippedTheme()

    shell()

    notify("Your theme is live")
  })

  $("[data-skin-reset]", root)?.addEventListener("click", () => {
    state.customSkin = null

    state.equipped = { ...(state.equipped || {}), theme: null }

    persist()

    pushUserSettings()

    applyEquippedTheme()

    shell()

    notify("Back to the default look")
  })

  $("#set-compact", root)?.addEventListener("change", (e) => {
    state.display = { ...(state.display || {}), compact: e.target.checked }

    persist()

    pushUserSettings()

    applyDisplay()
  })

  $$("[data-zoom]", root).forEach(
    (b) =>
      (b.onclick = () => {
        state.display = { ...(state.display || {}), zoom: +b.dataset.zoom }

        persist()

        pushUserSettings()

        applyDisplay()

        $$("[data-zoom]", root).forEach((x) =>
          x.classList.toggle("on", x === b),
        )
      }),
  )
}

const TOUR_STEPS = [
  {
    sel: "[data-toggle]",
    icon: "timer",
    title: "Start a session",
    text: "One tap begins your focus timer. The ring tracks every second.",
  },

  {
    sel: "#task-input",
    icon: "check",
    title: "Name your task",
    text: "Type what you're working on — finished sessions attach to it.",
  },

  {
    sel: ".coins, [data-coin]",
    icon: "coin",
    title: "Earn coins",
    text: "Every focus session pays coins plus streak bonuses. Spend them in the Rewards store.",
  },

  {
    sel: ".nav",
    icon: "map",
    title: "Explore the tabs",
    text: "Techniques, sounds, community, store and more live in the sidebar.",
  },

  {
    sel: null,
    icon: "party",
    title: "You're set",
    text: "Finish a session to plant your first garden flower — and come back daily to grow the streak.",
  },
]

let tourStep = 0

let tourRaf = 0

function startTour() {
  tourStep = 0

  state.tab = "timer"

  persist()

  // Always rebuild the shell so tour anchors exist — even when state.tab was

  // already "timer" the view might still be Settings (replay path) or the

  // landing page (first-run), and a missing anchor centers the card uselessly.

  shell()

  // Wait for fonts + a double frame so anchor geometry is final before we

  // measure — a bare 350ms timer races webfont swap on slower devices.

  const begin = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => showTourStep()))

  if (document.fonts?.ready) {
    let done = false

    const go = () => {
      if (!done) {
        done = true
        begin()
      }
    }

    document.fonts.ready.then(go)

    setTimeout(go, 500)
  } else {
    setTimeout(begin, 350)
  }
}

function tourAnchorFor(step) {
  if (!step?.sel) return null

  try {
    const candidates = step.sel.split(",").map((s) => s.trim())

    for (const sel of candidates) {
      // Rect-size check, not offsetParent — offsetParent is null for

      // position:fixed elements and some transformed ancestors, which made

      // anchors look "hidden" on certain laptop/phone layouts.

      const visible = [...document.querySelectorAll(sel)].filter((el) => {
        if (el === document.body) return true

        const r = el.getBoundingClientRect()

        return (
          r.width > 0 &&
          r.height > 0 &&
          getComputedStyle(el).visibility !== "hidden"
        )
      })

      // Prefer the biggest visible match (e.g. the pill, not the label span).

      visible.sort(
        (a, b) =>
          b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight,
      )

      if (visible[0]) return visible[0]
    }
  } catch {
    /* bad selector — center the card instead */
  }

  return null
}

// Spotlight geometry: punch a soft rounded hole in the veil over the anchor

// using a radial mask — `polygon(evenodd)` renders glitchy diagonals on some

// GPU/driver combos, and a hard-edged hole looks harsher anyway.

function tourSpotStyle(r) {
  const cx = Math.max(0, (r.left + r.right) / 2)

  const cy = Math.max(0, (r.top + r.bottom) / 2)

  const rx = Math.max(60, (r.right - r.left) / 2 + 18)

  const ry = Math.max(40, (r.bottom - r.top) / 2 + 18)

  return `mask-image: radial-gradient(ellipse ${rx}px ${ry}px at ${cx}px ${cy}px, transparent 97%, #000 100%); -webkit-mask-image: radial-gradient(ellipse ${rx}px ${ry}px at ${cx}px ${cy}px, transparent 97%, #000 100%)`
}

function placeTourCard(veil, card, anchor) {
  if (!veil || !card) return

  const vw = window.innerWidth

  const vh = window.innerHeight

  const cw = card.offsetWidth

  const ch = card.offsetHeight

  const margin = 14

  // Dock to a bottom sheet on phones AND short/narrow laptop windows — a

  // fixed 640px threshold left mid-size windows clipping the card off-screen.

  const shouldDock = vw < 640 || vh < 560

  if (shouldDock) {
    card.style.top = ""

    card.style.left = ""

    card.style.right = ""

    card.style.bottom = "10px"

    card.style.transform = ""

    card.classList.add("tour-docked")

    if (anchor) {
      const r = anchor.getBoundingClientRect()

      const spot = veil.querySelector(".tour-spot")

      if (spot) spot.style.cssText = tourSpotStyle(r)
    }

    return
  }

  card.classList.remove("tour-docked")

  card.style.bottom = ""

  card.style.right = ""

  if (!anchor) {
    // Center purely via inline top/left — the .tour-center class no longer

    // applies its own transform (that double-offset pushed cards off-screen).

    card.style.top = Math.max(margin, Math.round((vh - ch) / 2)) + "px"

    card.style.left = Math.max(margin, Math.round((vw - cw) / 2)) + "px"

    card.style.transform = ""

    const spot0 = veil.querySelector(".tour-spot")

    if (spot0)
      spot0.style.cssText = tourSpotStyle({
        left: vw / 2 - 1,
        right: vw / 2 + 1,
        top: vh / 2 - 1,
        bottom: vh / 2 + 1,
      })

    return
  }

  const r = anchor.getBoundingClientRect()

  const spot = veil.querySelector(".tour-spot")

  if (spot) spot.style.cssText = tourSpotStyle(r)

  // Prefer below; flip above when there isn't room; clamp sideways.

  let top = r.bottom + 14

  if (top + ch > vh - margin) top = r.top - ch - 14

  if (top < margin)
    top = Math.min(Math.max(margin, r.bottom + 14), vh - ch - margin)

  let left = r.left + r.width / 2 - cw / 2

  left = Math.max(margin, Math.min(vw - cw - margin, left))

  // Keep the card connected to its anchor with a little arrow.

  const arrow = card.querySelector(".tour-arrow")

  if (arrow) {
    const ax = Math.min(Math.max(18, r.left + r.width / 2 - left), cw - 18)

    arrow.style.left = ax + "px"

    arrow.classList.toggle("up", top > r.top)
  }

  card.style.top = Math.max(margin, top) + "px"

  card.style.left = left + "px"

  card.style.transform = ""
}

function showTourStep() {
  closeTour()

  const step = TOUR_STEPS[tourStep]

  if (!step) return finishTour()

  const anchor = tourAnchorFor(step)

  // Bring the anchor into view first — on short screens the Start button sits

  // below the fold and the spotlight would punch a hole nobody can see.

  try {
    anchor?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    })
  } catch {
    /* older engines */
  }

  const veil = document.createElement("div")

  veil.id = "tour-veil"

  const spotStyle = anchor
    ? tourSpotStyle(anchor.getBoundingClientRect())
    : tourSpotStyle({
        left: window.innerWidth / 2 - 1,
        right: window.innerWidth / 2 + 1,
        top: window.innerHeight / 2 - 1,
        bottom: window.innerHeight / 2 + 1,
      })

  veil.innerHTML =
    `<div class="tour-spot" style="${spotStyle}"></div>` +
    `<div class="tour-tip${
      anchor ? "" : " tour-center"
    }" role="dialog" aria-modal="true" aria-label="${esc(step.title)}">` +
    `<span class="tour-arrow" aria-hidden="true"></span>` +
    `<div class="tour-tip-head"><span class="tour-tip-ico" aria-hidden="true">${sicon(step.icon || "sparkle")}</span><span class="eyebrow">Step ${tourStep + 1} of ${TOUR_STEPS.length}</span></div>` +
    `<h2>${step.title}</h2><p class="muted">${step.text}</p>` +
    `<div class="tour-progress" aria-hidden="true">${TOUR_STEPS.map((_, i) => `<i class="${i < tourStep ? "done" : i === tourStep ? "now" : ""}"></i>`).join("")}</div>` +
    `<div class="modal-actions tour-actions"><button type="button" class="ghost" data-tour-skip>Skip</button><span class="tour-nav"><span class="tour-keys" aria-hidden="true">← →</span>${
      tourStep
        ? '<button type="button" class="ghost" data-tour-back>Back</button>'
        : ""
    }<button type="button" class="primary" data-tour-next>${
      tourStep === TOUR_STEPS.length - 1
        ? "Start focusing " + sicon("fire")
        : "Next →"
    }</button></span></div>` +
    `</div>`

  document.body.append(veil)

  const card = veil.querySelector(".tour-tip")

  placeTourCard(veil, card, anchor)

  // Track reflows: rotation, keyboard, late images, devtools opening.

  const reflow = () => {
    if (!document.body.contains(veil)) return cleanup()

    const live =
      anchor && document.contains(anchor) ? anchor : tourAnchorFor(step)

    placeTourCard(veil, card, live)
  }

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      finishTour()
    } else if (e.key === "ArrowRight" || e.key === "Enter") {
      // Enter on a focused tour button would fire BOTH the keydown handler

      // and the button's native click — skip so a single press advances once.

      const ae = document.activeElement

      if (e.key === "Enter" && ae && ae !== document.body && veil.contains(ae))
        return

      if (ae?.tagName === "TEXTAREA" || ae?.tagName === "INPUT") return

      e.preventDefault()

      tourStep++

      showTourStep()
    } else if (e.key === "ArrowLeft" && tourStep > 0) {
      e.preventDefault()

      tourStep--

      showTourStep()
    }
  }

  const cleanup = () => {
    cancelAnimationFrame(tourRaf)

    window.removeEventListener("resize", reflow)

    window.removeEventListener("scroll", reflow, true)

    document.removeEventListener("keydown", onKey, true)
  }

  window.addEventListener("resize", reflow)

  window.addEventListener("scroll", reflow, true)

  document.addEventListener("keydown", onKey, true)

  veil._tourCleanup = cleanup

  // Continuous tracking: late webfonts, images, collapse animations and

  // device rotation all shift the anchor after the initial paint.

  const track = () => {
    if (!document.body.contains(veil)) return

    reflow()

    tourRaf = requestAnimationFrame(track)
  }

  tourRaf = requestAnimationFrame(track)

  if (anchor) anchor.classList.add("tour-glow")

  $("[data-tour-skip]", veil).onclick = () => finishTour()

  const back = $("[data-tour-back]", veil)

  if (back)
    back.onclick = () => {
      tourStep--

      showTourStep()
    }

  $("[data-tour-next]", veil).onclick = () => {
    tourStep++

    showTourStep()
  }

  setTimeout(() => $("[data-tour-next]", veil)?.focus(), 60)
}

function closeTour() {
  try {
    document

      .querySelectorAll(".tour-glow")

      .forEach((el) => el.classList.remove("tour-glow"))
  } catch {
    /* ignore */
  }

  const veil = $("#tour-veil")

  if (veil) {
    veil._tourCleanup?.()

    veil.remove()
  }
}

function finishTour() {
  closeTour()

  if (!state.toured) {
    state.toured = true

    persist()
  }
}

export {
  openProfile,
  authenticate,
  openNotifications,
  notifIcon,
  profileCompleteness,
  completenessMarkup,
  dataMarkup,
  clearLocalHistory,
  exportData,
  wipeData,
  renderLanding,
  renderAccount,
  accountAuthMarkup,
  accountSignedInMarkup,
  bindAccount,
  savePrivacy,
  flowCard,
  themeCard,
  displayCard,
  notifCard,
  comfortCard,
  shortcutsCard,
  techCheckCard,
  renderSettings,
  bindSettings,
  TOUR_STEPS,
  tourStep,
  startTour,
  showTourStep,
  closeTour,
  finishTour,
}

export {
  PRIVACY_VERSION,
  PRIVACY_UPDATED,
  PRIVACY_DOC,
  markPrivacyAccepted,
  privacyAccepted,
  privacyAgreementMarkup,
  privacyDocSections,
  openPrivacy,
  privacyCrestSvg,
  downloadPrivacyPDF,
  privacyCard,
}
