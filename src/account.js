/* account.js — landing, auth, profile, settings, data management */
import {
  state, $, $$, uid, get, save, esc, sicon, stripIcon, haltPersist, pushUserSettings, persist, notify, confirmBox, viewHead,
  applyDisplay, applyEquippedTheme, applyMotion, avatarMarkup, cloudStateSubscription,
  dayKey, hydrateCloudState, openWhatsNew, setCloudSubscription, toggleNight,
} from "./core.js";
import {
  signUpWithEmail, signInWithEmail, resendVerification, requestPasswordReset,
  friendlyAuthError,
  updatePassword, signInWithProvider, signOut, getCurrentUser, syncProfile,
  uploadAvatar, removeAvatar, avatarPublicUrl,
  uploadUserFile, deleteMyBackendData, backendConfigured, hasActiveSession,
} from "./services/backend.js";
import { CHIMES, playChime, clearSongDatabase, stopAllLayers } from "./audio.js";
import { applyDurations, haltTimer, durations, renderTimer, sessionInProgress, timerHandle } from "./timer.js";
import { startTechCheck, techInfo, enterApp } from "./techniques.js";
import { equippedAvatarEmoji, equippedBadgeEmoji } from "./store.js";
import { disconnectRealtime, conversationSubscription, presenceSub } from "./community.js";
import { shell } from "./app.js";
function openProfile() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  let pendingPhoto = state.profile.photo || "";
  let photoDirty = false;
  const previewMarkup = () =>
    pendingPhoto
      ? `<img src="${pendingPhoto}" alt="Profile photo">`
      : esc(equippedAvatarEmoji() || state.profile.avatar);
  modal.innerHTML = `<div class="modal profile-modal"><div class="eyebrow">Your account</div><h2>Profile &amp; preferences</h2><div class="profile-grid">
    <div class="profile-identity">
      <div class="profile-avatar-preview" id="profile-photo-preview">${previewMarkup()}</div>
      <div class="photo-row"><label class="ghost" style="font-size:12px;padding:9px 12px;cursor:pointer">Upload photo<input id="profile-photo" type="file" accept="image/*" hidden></label>${pendingPhoto ? `<button class="ghost" style="font-size:12px;padding:9px 12px" data-remove-photo>Remove photo</button>` : ""}</div>
      <label class="field-label">Display name<input class="input" id="profile-name" value="${esc(state.profile.name)}"></label>
      <label class="field-label">Username<input class="input" id="profile-handle" value="${esc(state.profile.handle)}"></label>
    </div>
    <div class="profile-details">
      <label class="field-label">Bio<textarea class="textarea autogrow" id="profile-bio" rows="3">${esc(state.profile.bio)}</textarea></label>
      <label class="field-label">Email (optional)<input class="input" id="profile-email" type="email" placeholder="you@example.com" value="${esc(state.profile.email || "")}"></label>
      <label class="field-label">Country (optional)<input class="input" id="profile-country" placeholder="e.g. Ghana" value="${esc(state.profile.country || "")}"></label>
      <label class="field-label">Phone number (optional)<input class="input" id="profile-phone" type="tel" placeholder="e.g. +233 ..." value="${esc(state.profile.phone || "")}"></label>
      <label class="field-label">University (optional)<input class="input" id="profile-university" placeholder="Where do you school?" value="${esc(state.profile.university || "")}"></label>
      <label class="field-label">Subjects (optional, comma separated)<input class="input" id="profile-subjects" placeholder="e.g. Calculus, Web Development" value="${esc((state.profile.subjects || []).join(", "))}"></label>
    </div>
  </div>${state.user ? `<div class="auth-session"><span>Signed in as ${esc(state.user.email || state.profile.handle)}</span><button class="ghost" data-sign-out>Sign out</button></div>` : ""}<div class="modal-actions"><button class="ghost" data-profile-close>Cancel</button><button class="primary" data-profile-save>Save profile</button></div></div>`;
  $("#modal-root").append(modal);
  $("[data-profile-close]", modal).onclick = () => modal.remove();
  $("#profile-photo", modal).onchange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Choose an image file");
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        pendingPhoto = canvas.toDataURL("image/jpeg", 0.85);
        photoDirty = true;
        $("#profile-photo-preview", modal).innerHTML = previewMarkup();
        notify("Photo ready — press Save profile");
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  $("[data-remove-photo]", modal)?.addEventListener("click", () => {
    pendingPhoto = "";
    photoDirty = true;
    $("#profile-photo-preview", modal).innerHTML = previewMarkup();
  });
  $("[data-sign-in]", modal)?.addEventListener("click", () =>
    authenticate(modal, false),
  );
  $("[data-sign-up]", modal)?.addEventListener("click", () =>
    authenticate(modal, true),
  );
  $("[data-sign-out]", modal)?.addEventListener("click", async () => {
    await signOut();
    cloudStateSubscription?.unsubscribe();
    setCloudSubscription(null);
    state.user = null;
    modal.remove();
    shell();
    notify("Signed out");
  });
  $("[data-profile-save]", modal).onclick = async () => {
    const email = $("#profile-email", modal).value.trim();
    if (email && !/.+@.+\..+/.test(email))
      return notify("That email does not look valid");
    state.profile.name =
      $("#profile-name", modal).value.trim() || "Study Learner";
    state.profile.handle =
      $("#profile-handle", modal).value.trim().replace(/\s+/g, "_") ||
      "study_learner";
    state.profile.bio = $("#profile-bio", modal).value.trim();
    state.profile.email = email;
    state.profile.country = $("#profile-country", modal).value.trim();
    state.profile.phone = $("#profile-phone", modal).value.trim();
    state.profile.university = $("#profile-university", modal).value.trim();
    state.profile.subjects = $("#profile-subjects", modal)
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    // Photo: untouched stays exactly as-is (no re-upload). A fresh upload or
    // removal goes to Storage first so the old file never lingers behind.
    const prevPhoto = state.profile.photo || "";
    const prevPath = state.profile.photoPath || "";
    let uploadedNewPath = null;
    if (photoDirty) {
      if (pendingPhoto && backendConfigured && state.user) {
        try {
          const blob = await (await fetch(pendingPhoto)).blob();
          const up = await uploadAvatar(
            new File([blob], "avatar.jpg", { type: "image/jpeg" }),
          );
          if (up.error) throw up.error;
          if (prevPath && prevPath !== up.data.path)
            await removeAvatar(prevPath).catch(() => {});
          uploadedNewPath = up.data.path;
          state.profile.photoPath = up.data.path;
          state.profile.photo =
            avatarPublicUrl(up.data.path) || pendingPhoto;
          notify("Photo synced to your cloud profile");
        } catch {
          state.profile.photo = pendingPhoto;
          notify("Photo saved on this device; cloud upload failed");
        }
      } else {
        if (prevPath && backendConfigured && state.user)
          await removeAvatar(prevPath).catch(() => {});
        state.profile.photo = pendingPhoto || "";
        state.profile.photoPath = "";
      }
    }
    state.profile.avatar = state.profile.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    persist();
    let cloudOk = true;
    if (state.user) {
      const res = await syncProfile(state.profile);
      if (res.error) {
        cloudOk = false;
        // Don't leave an orphaned fresh upload behind when the row save fails.
        if (uploadedNewPath && uploadedNewPath !== prevPath) {
          await removeAvatar(uploadedNewPath).catch(() => {});
          state.profile.photoPath = prevPath;
          state.profile.photo = prevPhoto;
          persist();
        }
        notify(friendlyProfileError(res.error));
      }
    }
    modal.remove();
    shell();
    notify(cloudOk ? "Profile updated" : "Profile kept on this device");
  };
}

// Translate sync failures into actions — a silent "saved" is worse than noise.
function friendlyProfileError(error) {
  const msg = String(error?.message || "");
  if (error?.code === "23505" || /duplicate key|already exists/i.test(msg))
    return "That username is already taken — try another one";
  if (/photo_path|schema cache|PGRST204|column .* does not exist/i.test(msg))
    return "Cloud table is outdated — apply migration 010, then save again";
  if (/jwt|expired|permission|policy|unauthorized|sign in/i.test(msg))
    return "Session expired — sign in again, then save";
  return `Saved on this device; cloud sync failed (${msg.slice(0, 120) || "unknown error"})`;
}

function friendlySignupError(error) {
  const msg = String(error?.message || "");
  if (/already registered/i.test(msg))
    return "An account with this email already exists — sign in instead";
  if (/duplicate|handle|username/i.test(msg))
    return "That username is taken — change your handle, then retry";
  return msg || "Could not create the account";
}

async function authenticate(modal, createAccount) {
  const email = $("#auth-email", modal)?.value.trim();
  const password = $("#auth-password", modal)?.value;
  if (!email || !password) return notify("Enter your email and password");
  if (createAccount && !$("#auth-privacy", modal)?.checked)
    return notify("Tick the Privacy & Guidelines box to create your account");
  const submitBtn = $("[data-auth-submit]", modal) || $(".primary", modal);
  const originalLabel = submitBtn?.textContent || "";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = createAccount ? "Creating account…" : "Signing in…";
  }
  let result;
  try {
    result = createAccount
      ? await signUpWithEmail(email, password, state.profile)
      : await signInWithEmail(email, password);
  } catch (err) {
    result = { error: err };
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }
  if (result.error)
    return notify(createAccount ? friendlySignupError(result.error) : friendlyAuthError(result.error));
  if (createAccount) markPrivacyAccepted();
  state.user = result.data?.user || (await getCurrentUser());
  // No session yet (email confirmation required): don't hydrate or pretend
  // we're signed in — tell the user what to do next.
  if (!state.user || !(await hasActiveSession())) {
    state.user = null;
    return notify("Almost there — confirm your email first, then sign in.");
  }
  await hydrateCloudState(state.user);
  persist();
  modal.remove();
  shell();
  notify(createAccount ? "Account created" : "Signed in");
}

// Every notification carries an icon name (new) or earns one from its title
// (legacy) — either way the centre renders a real badge, never raw markup.
function notifIcon(item) {
  // Any short plain name is safe — sicon() falls back to a sparkle for
  // unknown names, so stored markup can never leak through here.
  if (item && /^[a-z0-9-]{1,24}$/i.test(item.icon || "")) return item.icon;
  const t = `${item?.title || ""} ${item?.text || ""}`.toLowerCase();
  if (t.includes("crown")) return "crown";
  if (t.includes("achievement")) return "medal";
  if (t.includes("streak") || t.includes("milestone")) return "fire";
  if (t.includes("challenge")) return "trophy";
  if (t.includes("sprint") || t.includes("race")) return "bolt";
  if (t.includes("session") || t.includes("schedul") || t.includes("rsvp")) return "calendar";
  if (t.includes("gift") || t.includes("invite")) return "gift";
  if (t.includes("friend") || t.includes("group")) return "users";
  if (t.includes("focus") || t.includes("session complete")) return "timer";
  if (t.includes("welcome")) return "sparkle";
  return "bell";
}

function openNotifications() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal notification-modal"><div class="eyebrow">Activity centre</div><div class="section-row"><h2>Notifications</h2><button class="ghost" data-read-all>Mark all read</button></div><div class="notification-list">${state.notifications.length ? state.notifications.map((item) => `<div class="notification ${item.read ? "read" : "unread"}"><div class="notification-ico">${sicon(notifIcon(item))}</div><div><strong>${esc(stripIcon(item.title))}</strong><p>${esc(stripIcon(item.text))}</p><small>${new Date(item.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small></div><div class="notification-mark">${item.read ? sicon("check") : "•"}</div></div>`).join("") : '<p class="muted">You are all caught up.</p>'}</div><div class="modal-actions"><button class="primary" data-notification-close>Done</button></div></div>`;
  $("#modal-root").append(modal);
  $("[data-read-all]", modal).onclick = () => {
    state.notifications.forEach((item) => (item.read = true));
    persist();
    modal.remove();
    openNotifications();
    shell();
  };
  $("[data-notification-close]", modal).onclick = () => {
    state.notifications.forEach((item) => (item.read = true));
    persist();
    modal.remove();
    shell();
  };
}

function profileCompleteness() {
  const p = state.profile || {};
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
  ];
  const done = fields.filter(([, ok]) => ok).length;
  return {
    pct: Math.round((done / fields.length) * 100),
    missing: fields.filter(([, ok]) => !ok).map(([label]) => label),
  };
}

function completenessMarkup() {
  const { pct, missing } = profileCompleteness();
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Profile strength</h2><span class="tag">${pct}%</span></div><div class="complete-track"><span class="complete-fill" style="width:${pct}%"></span></div>${pct >= 100 ? '<p class="muted" style="margin-top:10px">Profile complete — recommendations and buddy matching run at full power.</p>' : `<p class="muted" style="margin-top:10px">Add your ${esc(missing.slice(0, 2).join(" and "))} to unlock better matches.</p><div class="complete-missing">${missing.map((m) => `<button class="ghost complete-chip" data-complete-profile>${esc(m)}</button>`).join("")}</div>`}</div>`;
}

function dataMarkup() {
  return `<div class="card" style="margin-top:18px"><div class="section-row"><h2>Your data</h2><span class="tag">${backendConfigured ? (state.user ? "cloud sync on" : "cloud ready") : "this browser only"}</span></div><p class="muted">Everything lives in this browser${backendConfigured ? " and syncs to your cloud account" : ""}. Take a copy with you, or erase it all — your call.</p><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="ghost" data-export>Export my data</button><label class="ghost" style="cursor:pointer">Import backup<input type="file" id="import-file" accept="application/json,.json" hidden></label><button class="ghost" data-wipe style="color:#c0392b">Delete my data…</button></div></div>`;
}

function exportData() {
  try {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sf-")) {
        try {
          data[k] = JSON.parse(localStorage.getItem(k));
        } catch {
          data[k] = localStorage.getItem(k);
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
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `studyflow-backup-${dayKey(new Date())}.json`;
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 4000);
    notify("Backup downloaded");
  } catch {
    notify("Export failed — storage unavailable");
  }
}

function wipeData() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Danger zone</div><h2>Delete all your data?</h2><p class="muted">This will permanently remove your account data, including coins, achievements, rewards, favorites, tasks, streaks, statuses, and other saved information. This action cannot be undone.</p><p class="st-confirm-err" data-wipe-err hidden></p><div class="modal-actions"><button class="ghost" data-wipe-cancel>Cancel</button><button class="danger-button" data-wipe-go>Delete Everything</button></div></div>`;
  $("#modal-root").append(modal);
  const err = $("[data-wipe-err]", modal);
  const goBtn = $("[data-wipe-go]", modal);
  $("[data-wipe-cancel]", modal).onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal && !goBtn.disabled) modal.remove();
  });
  goBtn.onclick = async () => {
    // Freeze all writers first: the farewell reload fires beforeunload
    // handlers that would otherwise re-save everything being deleted.
    haltPersist();
    goBtn.disabled = true;
    goBtn.textContent = "Deleting…";
    err.hidden = true;
    const fail = (message) => {
      err.textContent = message;
      err.hidden = false;
      goBtn.disabled = false;
      goBtn.textContent = "Delete Everything";
    };
    try {
      clearInterval(timerHandle);
    } catch {
      /* ignore */
    }
    try {
      stopAllLayers();
    } catch {
      /* ignore */
    }
    try {
      conversationSubscription?.unsubscribe();
    } catch {
      /* ignore */
    }
    try {
      cloudStateSubscription?.unsubscribe();
    } catch {
      /* ignore */
    }
    try {
      if (presenceSub) presenceSub.untrack();
    } catch {
      /* ignore */
    }
    // Backend first: auth is still valid, so ownership rules apply.
    // Nothing local is touched until the server confirms deletion.
    try {
      const result = await deleteMyBackendData();
      if (!result.ok) {
        return fail(
          `Could not delete everything: ${result.failures.slice(0, 3).join("; ")}. Nothing was removed — please try again.`,
        );
      }
    } catch (e) {
      return fail(
        `Deletion failed before anything was removed (${e?.message || "network error"}). Please try again.`,
      );
    }
    // Imported songs live in IndexedDB, outside localStorage.
    try {
      await clearSongDatabase();
    } catch (e) {
      return fail(
        `Could not clear downloaded songs (${e?.message || "storage error"}). Nothing was removed — please try again.`,
      );
    }
    try {
      const doomed = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sf-")) doomed.push(k);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    } catch {
      return fail("Could not clear this browser's storage. Please try again.");
    }
    try {
      await signOut();
    } catch {
      /* session ends with the reload below regardless */
    }
    try {
      sessionStorage.setItem("sf-wiped", "1");
    } catch {
      /* ignore */
    }
    location.reload();
  };
}

function renderLanding() {
  const root = $("#root");
  if (!root) return;
  applyEquippedTheme();
  applyDisplay();
  root.innerHTML = `<div class="landing"><div class="landing-hero"><div class="brand-mark landing-mark">◷</div><div class="eyebrow">StudyFlow</div><h1>Focus with intention.</h1><p class="lede">Pomodoro sessions, streaks, study buddies and rewards — one calm workspace for deep work.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px"><button class="primary" data-enter style="padding:14px 28px;font-size:15px">Open Focus Desk →</button><button class="ghost" data-landing-how>How it works</button></div><div class="muted" style="margin-top:12px;font-size:12px">Free forever · No account needed to start</div></div><div class="grid three landing-feats"><div class="card"><div class="emoji">${sicon("timer")}</div><h3>Smart timer</h3><p class="muted">Focus, short and long breaks with custom lengths and gentle anti-distraction rules.</p></div><div class="card"><div class="emoji">${sicon("fire")}</div><h3>Streaks & garden</h3><p class="muted">Every session plants a flower and pays coins. Consistency compounds.</p></div><div class="card"><div class="emoji">${sicon("users")}</div><h3>Study together</h3><p class="muted">Sprint rooms, group challenges, messages and voice notes with buddies.</p></div></div><div class="card" id="landing-how" style="margin-top:18px"><h2>How it works</h2><ol class="detail-steps"><li><strong>Pick a task</strong> — name what you'll work on.</li><li><strong>Start a session</strong> — focused minutes, phone down.</li><li><strong>Rest & repeat</strong> — short breaks between, coins and streaks after.</li></ol></div><footer class="landing-foot muted">StudyFlow · made for deep work</footer></div>`;
  $("[data-enter]").onclick = () => {
    state.entered = true;
    persist();
    if (state.techCheck && state.techCheck.done) enterApp();
    else startTechCheck("onboard");
  };
  $("[data-landing-how]").onclick = () => {
    try {
      $("#landing-how")?.scrollIntoView({
        behavior: state.reduceMotion ? "auto" : "smooth",
      });
    } catch {
      /* ignore */
    }
  };
}

function renderAccount() {
  const target = $("#tab-account");
  const user = state.user;
  target.innerHTML = `<div class="account-page"><div class="account-hero"><div><div class="eyebrow">StudyFlow identity</div><h1>${user ? "Your account, your space." : "A calmer way to sign in."}</h1><p class="lede">${user ? "Manage your profile, privacy, and connected sessions from one secure place." : "Join your focused workspace and keep your progress with you across devices."}</p></div><div class="account-orbit"><span>◷</span><i></i><b></b></div></div>${completenessMarkup()}<div class="card auth-card">${user ? accountSignedInMarkup(user) : accountAuthMarkup()}</div>${!user ? `<div class="privacy-consent" style="margin-top:16px">${privacyAgreementMarkup("account-privacy")}</div>` : ""}${dataMarkup()}${privacyCard()}</div>`;
  bindAccount(target);
}

function accountAuthMarkup() {
  const reset = state.accountView === "reset";
  const create = state.accountView === "create";
  return `<div class="auth-header"><span class="auth-kicker">${reset ? "Account recovery" : create ? "Start your journey" : "Welcome back"}</span><h2>${reset ? "Reset your password" : create ? "Create your StudyFlow account" : "Sign in to StudyFlow"}</h2><p class="muted">${reset ? "We will send a secure reset link to your email." : create ? "Your focus history should travel with you." : "Pick up exactly where your attention left off."}</p></div><div class="auth-tabs"><button data-auth-view="welcome" class="${!create && !reset ? "active" : ""}">Sign in</button><button data-auth-view="create" class="${create ? "active" : ""}">Create account</button><button data-auth-view="reset" class="${reset ? "active" : ""}">Reset password</button></div>${reset ? `<label class="field-label">Email<input class="input" id="account-email" type="email" placeholder="you@example.com"></label><button class="primary auth-submit" data-reset-password>Send reset link</button>` : `<label class="field-label">Email<input class="input" id="account-email" type="email" placeholder="you@example.com"></label><label class="field-label">Password<input class="input" id="account-password" type="password" placeholder="At least 6 characters"></label>${create ? `<label class="field-label">Display name<input class="input" id="account-name" placeholder="How should we call you?"></label><label class="field-label">Country (optional)<input class="input" id="account-country" placeholder="e.g. Ghana"></label><label class="field-label">Phone number (optional)<input class="input" id="account-phone" type="tel" placeholder="e.g. +233 ..."></label><label class="field-label">University (optional)<input class="input" id="account-university" placeholder="Where do you school?"></label><label class="field-label">Subjects you study (optional)<input class="input" id="account-subjects" placeholder="e.g. Calculus, Web Development"></label>` : ""}<button class="primary auth-submit" data-email-auth>${create ? "Create account" : "Sign in"}</button><div class="auth-divider"><span>or continue with</span></div><div class="oauth-row"><button class="oauth google" data-provider="google"><b>G</b> Google</button><button class="oauth apple" data-provider="apple"><b>●</b> Apple</button></div><p class="auth-foot">Already have a verification email? <button class="text-button" data-resend>Resend it</button></p>`}`;
}

function accountSignedInMarkup(user) {
  const verified = Boolean(user.email_confirmed_at);
  return `<div class="auth-header"><span class="auth-kicker">${verified ? "Authenticated" : "Verification required"}</span><h2>${verified ? "You are signed in." : "Verify your email."}</h2><p class="muted">${esc(user.email || state.profile.handle)} · ${verified ? "Your cloud workspace is active." : "Confirm your email to unlock secure cloud access."}</p></div>${verified ? "" : `<div class="verification-banner"><strong>Check your inbox</strong><span>We sent a confirmation link to ${esc(user.email || "your email")}.</span><button class="ghost" data-resend-account>Resend verification</button></div>`}<div class="session-card"><div class="avatar">${avatarMarkup(state.profile.photo, equippedAvatarEmoji() || state.profile.avatar)}</div><div><strong>${esc(state.profile.name)}${equippedBadgeEmoji() ? ` <span title="Showcase badge">${equippedBadgeEmoji()}</span>` : ""}</strong><small>@${esc(state.profile.handle)}${user.created_at ? ` · member since ${new Date(user.created_at).toLocaleDateString()}` : ""}${user.app_metadata?.provider && user.app_metadata.provider !== "email" ? ` · via ${esc(user.app_metadata.provider)}` : ""}</small></div><span class="status-pill">${verified ? "Active session" : "Pending verification"}</span></div><div class="privacy-panel"><div class="section-row"><h3>Privacy controls</h3><span class="tag">Saved locally + cloud</span></div><label class="toggle-row"><span><strong>Profile visibility</strong><small>Who can view your profile</small></span><select class="select" id="profile-visibility"><option value="private" ${state.privacy.profileVisibility === "private" ? "selected" : ""}>Only me</option><option value="friends" ${state.privacy.profileVisibility === "friends" ? "selected" : ""}>Friends</option><option value="public" ${state.privacy.profileVisibility === "public" ? "selected" : ""}>Everyone</option></select></label><label class="toggle-row"><span><strong>Activity visibility</strong><small>Who can see your study activity</small></span><select class="select" id="activity-visibility"><option value="private" ${state.privacy.activityVisibility === "private" ? "selected" : ""}>Only me</option><option value="friends" ${state.privacy.activityVisibility === "friends" ? "selected" : ""}>Friends</option><option value="public" ${state.privacy.activityVisibility === "public" ? "selected" : ""}>Everyone</option></select></label><label class="toggle-row"><span><strong>Searchable profile</strong><small>Allow others to find you by handle</small></span><input id="profile-searchable" type="checkbox" ${state.privacy.searchable ? "checked" : ""}></label></div><div class="auth-actions"><button class="ghost" data-profile-modal>Edit profile</button><button class="danger-button" data-global-signout>Sign out everywhere</button></div>`;
}

function bindAccount(root) {
  $$("[data-auth-view]", root).forEach(
    (button) =>
      (button.onclick = () => {
        state.accountView = button.dataset.authView;
        renderAccount();
      }),
  );
  $("[data-email-auth]", root)?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const email = $("#account-email", root).value.trim();
    const password = $("#account-password", root).value;
    if (!email || !password) return notify("Enter your email and password");
    const create = state.accountView === "create";
    if (create && !$("#account-privacy", root)?.checked)
      return notify("Tick the Privacy & Guidelines box to create your account");
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Signing in…";
    const done = () => {
      btn.disabled = false;
      btn.textContent = label;
    };
    const profileExtras = create
      ? {
          name: $("#account-name", root)?.value.trim() || "Study Learner",
          country: $("#account-country", root)?.value.trim() || "",
          phone: $("#account-phone", root)?.value.trim() || "",
          university: $("#account-university", root)?.value.trim() || "",
          subjects: ($("#account-subjects", root)?.value || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 12),
        }
      : {};
    const result = create
      ? await signUpWithEmail(email, password, profileExtras)
      : await signInWithEmail(email, password);
    if (result.error) {
      done();
      return notify(friendlyAuthError(result.error));
    }
    if (create) {
      if (profileExtras.name && state.profile.name === "Study Learner")
        state.profile.name = profileExtras.name;
      state.profile.email = email;
      state.profile.country = profileExtras.country;
      state.profile.phone = profileExtras.phone;
      state.profile.university = profileExtras.university;
      state.profile.subjects = profileExtras.subjects || [];
      markPrivacyAccepted();
    }
    state.user = result.data?.user || (await getCurrentUser());
    // When email confirmation is required, signUp returns the user but there
    // is NO session — hydrateCloudState would only misfire a sync error.
    if (await hasActiveSession()) {
      await hydrateCloudState(state.user);
      notify(create ? "Account created" : "Signed in successfully");
    } else {
      notify("Account created — check your email for the confirmation link, then sign in.");
      state.user = null;
    }
    renderAccount();
  });
  $("[data-reset-password]", root)?.addEventListener("click", async () => {
    const email = $("#account-email", root).value.trim();
    if (!email) return notify("Enter your email first");
    const result = await requestPasswordReset(email);
    if (result.error) return notify(friendlyAuthError(result.error));
    notify("Password reset link sent — check your inbox");
  });
  $$("[data-provider]", root).forEach(
    (button) =>
      (button.onclick = async () => {
        if (state.accountView === "create" && !$("#account-privacy", root)?.checked)
          return notify("Tick the Privacy & Guidelines box to create your account");
        const result = await signInWithProvider(button.dataset.provider);
        if (result.error) notify(friendlyAuthError(result.error));
        else if (state.accountView === "create") markPrivacyAccepted();
      }),
  );
  $("[data-resend]", root)?.addEventListener("click", async () => {
    const email = $("#account-email", root).value.trim();
    if (!email) return notify("Enter your email first");
    const result = await resendVerification(email);
    notify(result.error ? friendlyAuthError(result.error) : "Verification email sent — check your inbox");
  });
  $("[data-resend-account]", root)?.addEventListener("click", async () => {
    const result = await resendVerification(state.user?.email);
    notify(result.error ? friendlyAuthError(result.error) : "Verification email sent — check your inbox");
  });
  $("[data-profile-modal]", root)?.addEventListener("click", openProfile);
  $$("[data-complete-profile]", root).forEach(
    (b) => (b.onclick = openProfile),
  );
  $("[data-export]", root)?.addEventListener("click", exportData);
  bindDataZone(root);
  $("[data-global-signout]", root)?.addEventListener("click", async () => {
    await signOut();
    cloudStateSubscription?.unsubscribe();
    state.user = null;
    state.accountView = "welcome";
    shell();
    notify("Signed out on all devices");
  });
  $("#profile-visibility", root)?.addEventListener("change", savePrivacy);
  $("#activity-visibility", root)?.addEventListener("change", savePrivacy);
  $("#profile-searchable", root)?.addEventListener("change", savePrivacy);
}

function savePrivacy() {
  state.privacy = {
    profileVisibility:
      $("#profile-visibility")?.value || state.privacy.profileVisibility,
    activityVisibility:
      $("#activity-visibility")?.value || state.privacy.activityVisibility,
    searchable: $("#profile-searchable")?.checked ?? state.privacy.searchable,
  };
  persist();
  if (state.user)
    syncProfile({ ...state.profile, ...state.privacy }).then((res) => {
      if (res?.error) notify(friendlyProfileError(res.error));
      else notify("Privacy settings saved");
    });
  else notify("Privacy settings saved");
}

/* ---------- Privacy & Community Guidelines ---------- */
const PRIVACY_VERSION = "1.0";
const PRIVACY_UPDATED = "September 2026";

const PRIVACY_DOC = {
  promise: [
    ["Your focus stays yours", "StudyFlow is local-first. Sessions, tasks and streaks live in your browser; cloud sync only switches on when you create an account."],
    ["Take it or erase it", "Export a full backup or wipe everything any time from Settings → Your data. No dark patterns, no ransom."],
    ["You control the room", "Block, mute and report tools sit wherever people can reach you — groups, chats, notes and calls."],
    ["Humans review reports", "Every report lands with a moderator, never on a public wall. Repeat offenders lose their accounts."],
  ],
  dos: [
    ["Focus honestly", "Run real sessions. Streaks, gardens and leaderboards only mean something because they are earned."],
    ["Be kind and encouraging", "Celebrate other learners' wins and give feedback that actually helps."],
    ["Share what you learn", "Notes, techniques and honest questions make the whole community sharper."],
    ["Protect your account", "Use a strong, unique password, verify your email, and never share login codes with anyone."],
    ["Keep your profile truthful", "Your real display name and handle, your own photo or avatar — no borrowed identities."],
    ["Report, don't retaliate", "See something wrong? Block and report it. Moderators handle the rest — clap-backs start fires."],
    ["Credit your sources", "Quote books, teachers and fellow learners. Shared knowledge grows when credit flows."],
  ],
  donts: [
    ["No fake sessions or timer gaming", "Bots, inflated minutes or backgrounded timers cheapen every shared board. Play straight."],
    ["No harassment, hate or threats", "Bullying, hate speech and intimidation carry zero tolerance — first offence can end an account."],
    ["No spam, scams or ads", "No flooding chats, phishing links, fake giveaways or referral farming outside the referral feature."],
    ["No adult or graphic content", "Stories, photos, videos and files stay safe-for-study, always."],
    ["No impersonation", "Never pose as another learner, a school, or StudyFlow staff."],
    ["No private info — yours or anyone's", "Phone numbers, addresses, passwords and personal photos of others stay off the platform."],
    ["No pirated materials", "Don't upload paid books, exam leaks or course content you don't own or can't share."],
    ["No ban evasion", "Blocked means blocked. New accounts made to dodge moderation will be removed with the old ones."],
  ],
};

function markPrivacyAccepted() {
  state.privacyAccepted = { version: PRIVACY_VERSION, at: Date.now() };
  persist();
}

function privacyAccepted() {
  return Boolean(state.privacyAccepted && state.privacyAccepted.version === PRIVACY_VERSION);
}

function privacyAgreementMarkup(boxId) {
  return `<div class="agree-row"><input type="checkbox" id="${boxId}"><span>I agree to the <button type="button" class="linklike" data-privacy-open>Privacy &amp; Community Guidelines</button></span></div>`;
}

function privacyDocSections() {
  return `<div class="privacy-sec"><div class="eyebrow">Our promise</div><div class="promise-grid">${PRIVACY_DOC.promise.map(([t, d]) => `<div class="promise-card"><strong>${esc(t)}</strong><span>${esc(d)}</span></div>`).join("")}</div></div>
  <div class="privacy-sec"><div class="eyebrow do">The do's</div><div class="rule-grid">${PRIVACY_DOC.dos.map(([t, d], i) => `<div class="rule-card do"><span class="rule-num">${i + 1}</span><div><strong>${esc(t)}</strong><span>${esc(d)}</span></div><span class="rule-mark">✓</span></div>`).join("")}</div></div>
  <div class="privacy-sec"><div class="eyebrow dont">The don'ts</div><div class="rule-grid">${PRIVACY_DOC.donts.map(([t, d], i) => `<div class="rule-card dont"><span class="rule-num">${i + 1}</span><div><strong>${esc(t)}</strong><span>${esc(d)}</span></div><span class="rule-mark">✕</span></div>`).join("")}</div></div>
  <div class="privacy-sec"><div class="eyebrow">Staying safe</div><p class="muted">Mute a noisy group · block anyone who crosses a line · report with a reason and it reaches moderation. Manage your visibility any time in Account → Privacy controls, and your data in Settings → Your data.</p></div>`;
}

function openPrivacy() {
  document.querySelector("[data-privacy-modal]")?.remove();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.setAttribute("data-privacy-modal", "");
  modal.innerHTML = `<div class="modal privacy-modal"><div class="privacy-hero"><div class="privacy-crest">◷</div><div><div class="eyebrow">StudyFlow · Trust &amp; safety</div><h2>Privacy &amp; Community Guidelines</h2><p class="muted">Version ${PRIVACY_VERSION} · ${PRIVACY_UPDATED} · the do's and don'ts of our study home</p></div></div>${privacyDocSections()}<div class="modal-actions" style="margin-top:18px"><button class="ghost" data-privacy-pdf>${sicon("download")} Save as PDF</button><button class="ghost" data-privacy-close>Close</button><button class="primary" data-privacy-accept>I accept</button></div></div>`;
  $("#modal-root").append(modal);
  modal.querySelector("[data-privacy-close]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.querySelector("[data-privacy-pdf]").onclick = () => downloadPrivacyPDF();
  modal.querySelector("[data-privacy-accept]").onclick = () => {
    markPrivacyAccepted();
    try {
      document.querySelectorAll("#account-privacy, #auth-privacy").forEach((box) => {
        box.checked = true;
      });
    } catch {
      /* ignore */
    }
    modal.remove();
    if (state.tab === "account") shell();
    notify("Guidelines accepted — welcome in " + sicon("check"));
  };
}

function privacyCrestSvg() {
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="#e9ae3f" stroke-width="3"/><circle cx="32" cy="32" r="22" fill="#ffffff" opacity="0.14"/><path d="M36 10 L22 36 h10 L28 54 L44 26 h-11 z" fill="#e9ae3f"/><circle cx="32" cy="32" r="29" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.35"/></svg>`;
}

function downloadPrivacyPDF() {
  const rows = (list, mark, cls) =>
    list.map(([t, d], i) => `<div class="rule ${cls}"><span class="num">${i + 1}</span><div><strong>${t}</strong><span>${d}</span></div><span class="mark">${mark}</span></div>`).join("");
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
  </div><script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };<\/script></body></html>`;
  let w = null;
  try {
    w = window.open("", "_blank", "width=960,height=720");
  } catch {
    w = null;
  }
  if (!w) {
    notify("Allow popups so the guidelines PDF can open");
    return;
  }
  try {
    w.document.write(html);
    w.document.close();
    w.focus();
  } catch {
    notify("Could not open the PDF — try again");
  }
}

function privacyCard() {
  const a = state.privacyAccepted;
  const ok = privacyAccepted();
  return `<div class="card" style="margin-top:18px"><div class="section-row"><h2>Privacy &amp; guidelines</h2><span class="tag">${ok ? "accepted" : "review"}</span></div><p class="muted">${ok ? `You accepted version ${esc(a.version)}${a.at ? ` on ${new Date(a.at).toLocaleDateString()}` : ""}. The house rules live here whenever you need them.` : "Read the do's and don'ts of StudyFlow — your data rights, safety tools and community rules in one place."}</p><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="ghost" data-privacy-open>Read guidelines</button><button class="ghost" data-privacy-pdf>${sicon("download")} Save as PDF</button></div></div>`;
}

if (!window.__sfPrivacyBound) {
  window.__sfPrivacyBound = true;
  document.addEventListener("click", (e) => {
    if (e.target?.closest?.("[data-privacy-open]")) {
      e.preventDefault();
      openPrivacy();
      return;
    }
    if (e.target?.closest?.("[data-privacy-pdf]")) {
      e.preventDefault();
      downloadPrivacyPDF();
    }
  });
}

function flowCard() {
  const a = state.autostart || {};
  return `<div class="card"><div class="section-row"><h2>Flow</h2><span class="tag">auto</span></div><p class="muted">Chain sessions with a 5-second countdown. Backing out cancels it.</p><label class="toggle-row"><span><strong>Auto-start breaks</strong><small>After each focus session</small></span><input type="checkbox" data-auto="breaks"${a.breaks ? " checked" : ""}></label><label class="toggle-row"><span><strong>Auto-start focus</strong><small>After each break</small></span><input type="checkbox" data-auto="focus"${a.focus ? " checked" : ""}></label></div>`;
}

function themeCard() {
  const skin = state.customSkin?.vars || {
    paper: "#f6f7f2",
    panel: "#ffffff",
    ink: "#17221d",
    muted: "#66736a",
    line: "#dfe6dc",
    sage: "#47765a",
  };
  const isCustom = state.equipped?.theme === "custom";
  const row = (key, label) =>
    `<label class="skin-row"><span>${label}</span><input type="color" data-skin="${key}" value="${skin[key] || "#000000"}"></label>`;
  return `<div class="card"><div class="section-row"><h2>My theme</h2>${isCustom ? '<span class="tag">in use</span>' : ""}</div><p class="muted">Mix your own skin — previews live, saves instantly.</p><div class="skin-grid">${row("sage", "Primary")}${row("paper", "Background")}${row("panel", "Cards")}${row("ink", "Text")}${row("muted", "Muted text")}${row("line", "Borders")}</div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="primary" data-skin-use>Use my theme</button><button class="ghost" data-skin-reset>Reset</button></div></div>`;
}

function displayCard() {
  const d = state.display || {};
  const zoom = d.zoom || 1;
  return `<div class="card"><div class="section-row"><h2>Display</h2><span class="tag">comfort</span></div><label class="toggle-row"><span><strong>Compact mode</strong><small>Tighter spacing, smaller ring</small></span><input type="checkbox" id="set-compact"${d.compact ? " checked" : ""}></label><div class="section-row" style="margin-top:14px"><h3>Text size</h3></div><div class="seg-row" role="group" aria-label="Text size">${[[0.9, "S"], [1, "M"], [1.12, "L"]].map(([v, label]) => `<button class="seg${zoom === v ? " on" : ""}" data-zoom="${v}">${label}</button>`).join("")}</div></div>`;
}

function notifCard() {
  const prefs = state.notifPrefs || {};
  const volPct = Math.round((state.chimeVolume ?? 0.8) * 100);
  const on = (k) => (prefs[k] !== false ? " checked" : "");
  return `<div class="card"><div class="section-row"><h2>Notifications</h2><span class="tag">alerts</span></div><label class="field-label">Completion chime<select class="select" id="set-chime">${Object.entries(CHIMES).map(([id, c]) => `<option value="${id}"${(state.chimeStyle || "arpeggio") === id ? " selected" : ""}>${c.label}</option>`).join("")}</select></label><div class="mix-row"><span class="muted" style="min-width:56px">Volume</span><input type="range" min="0" max="100" value="${volPct}" data-chime-vol aria-label="Chime volume"><span class="mix-pct" data-chime-pct>${volPct}%</span><button class="ghost" data-chime-test style="padding:8px 12px">Test</button></div><label class="toggle-row"><span><strong>Session completions</strong><small>Chime + notification when timers finish</small></span><input type="checkbox" data-notif="completion"${on("completion")}></label><label class="toggle-row"><span><strong>Streak milestones</strong><small>Celebrate 7, 30, 100-day streaks</small></span><input type="checkbox" data-notif="streaks"${on("streaks")}></label><label class="toggle-row"><span><strong>Community messages</strong><small>Notify on new incoming messages</small></span><input type="checkbox" data-notif="community"${on("community")}></label></div>`;
}

function comfortCard() {
  return `<div class="card"><div class="section-row"><h2>Daily reminder</h2><span class="tag">nudge</span></div><p class="muted">One gentle nudge a day, while StudyFlow is open.</p><label class="toggle-row"><span><strong>Remind me to focus</strong><small>Every day at your chosen time</small></span><input type="checkbox" id="set-reminder-on"${state.reminder?.enabled ? " checked" : ""}></label><label class="field-label">Reminder time<input class="input" id="set-reminder-time" type="time" value="${esc(state.reminder?.time || "18:00")}"></label><div class="section-row" style="margin-top:18px"><h2>Comfort</h2></div><label class="toggle-row"><span><strong>Reduce motion</strong><small>Still interface, no pulse or slide effects</small></span><input type="checkbox" id="set-motion"${state.reduceMotion ? " checked" : ""}></label></div>`;
}

function shortcutsCard() {
  return `<div class="card"><div class="section-row"><h2>Shortcuts</h2><span class="tag">keys</span></div><div class="shortcut-list"><div><kbd>Space</kbd><span>Start / pause the timer</span></div><div><kbd>Ctrl K</kbd><span>Search everything</span></div><div><kbd>Esc</kbd><span>Close the search</span></div></div><button class="ghost" data-whatsnew style="margin-top:12px">See what's new</button> <button class="ghost" data-tour-replay style="margin-top:12px">Replay tour</button></div>`;
}

function appearanceCard() {
  return `<div class="card"><div class="section-row"><h2>Appearance</h2><span class="tag">${state.night ? "night" : "day"}</span></div><p class="muted">Switch the whole app between Day and Night mode. Your choice saves instantly and follows your account.</p><div class="seg-row" role="group" aria-label="Color mode"><button class="seg${!state.night ? " on" : ""}" data-mode-set="day">Day</button><button class="seg${state.night ? " on" : ""}" data-mode-set="night">Night</button></div></div>`;
}
function techCheckCard() {
  const tc = state.techCheck;
  if (tc && tc.done && (tc.top || []).length) {
    const first = techInfo(tc.top[0]);
    return `<div class="card"><div class="section-row"><h2>Study technique profile</h2><span class="tag">your check</span></div><p class="muted">Top match: <strong>${first ? esc(first[1]) : "—"}</strong>${tc.date ? ` · checked ${new Date(tc.date).toLocaleDateString()}` : ""}. Your Techniques tab highlights these picks.</p><button class="ghost" data-tc-retake>Retake Technique Check</button></div>`;
  }
  return `<div class="card"><div class="section-row"><h2>Study technique profile</h2><span class="tag">discover</span></div><p class="muted">Answer 12 quick questions and we will highlight the techniques that may fit you best.</p><button class="primary" data-tc-start>Take the Technique Check</button></div>`;
}

function renderSettings() {
  const target = $("#tab-settings");
  const minutes = state.timerMinutes || { focus: 25, short: 5, long: 15 };
  const seconds = state.timerSeconds || { focus: 0, short: 0, long: 0 };
  target.innerHTML = `${viewHead("Settings", "Tune your timer and keep your account secure.")}<div class="grid two">${appearanceCard()}<div class="card"><div class="section-row"><h2>Timer durations</h2><span class="tag">min + sec</span></div><p class="muted">Customise how long each session lasts, down to the second. Short break defaults to 5:00, long break to 15:00.</p><div class="duration-grid"><div><div class="eyebrow">Focus</div><div class="dur-pair"><label class="field-label">Min<input class="input" id="set-focus" type="number" min="0" max="180" step="1" value="${minutes.focus}"></label><label class="field-label">Sec<input class="input" id="set-focus-s" type="number" min="0" max="59" step="1" value="${seconds.focus}"></label></div></div><div><div class="eyebrow">Short break</div><div class="dur-pair"><label class="field-label">Min<input class="input" id="set-short" type="number" min="0" max="180" step="1" value="${minutes.short}"></label><label class="field-label">Sec<input class="input" id="set-short-s" type="number" min="0" max="59" step="1" value="${seconds.short}"></label></div></div><div><div class="eyebrow">Long break</div><div class="dur-pair"><label class="field-label">Min<input class="input" id="set-long" type="number" min="0" max="180" step="1" value="${minutes.long}"></label><label class="field-label">Sec<input class="input" id="set-long-s" type="number" min="0" max="59" step="1" value="${seconds.long}"></label></div></div></div><button class="primary" data-save-durations>Save durations</button></div><div class="card"><div class="section-row"><h2>Change password</h2><span class="tag">cloud accounts</span></div>${state.user && backendConfigured ? `<p class="muted">Signed in as ${esc(state.user.email || state.profile.handle)}. Enter a new password below.</p><label class="field-label">New password<input class="input" id="set-new-password" type="password" placeholder="At least 6 characters"></label><label class="field-label">Confirm new password<input class="input" id="set-confirm-password" type="password" placeholder="Repeat the new password"></label><button class="primary" data-change-password>Update password</button>` : `<p class="muted">Password changes apply to your cloud account. ${backendConfigured ? "Sign in from the Account tab first." : "Add Supabase keys to enable cloud accounts."}</p><label class="field-label">Email<input class="input" id="set-reset-email" type="email" placeholder="you@example.com" value="${esc(state.profile.email || (state.user && state.user.email) || "")}"></label><button class="ghost" data-send-reset>Send reset link</button>`}</div>${notifCard()}${comfortCard()}${shortcutsCard()}${flowCard()}${themeCard()}${displayCard()}${techCheckCard()}${dataMarkup()}</div>`;
  bindSettings(target);
}

function bindDataZone(root) {
  $("#import-file", root)?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        parsed = null;
      }
      if (
        !parsed ||
        parsed.app !== "StudyFlow" ||
        typeof parsed.data !== "object"
      ) {
        notify("That file is not a StudyFlow backup");
        return;
      }
      const count = Object.keys(parsed.data).length;
      confirmBox(
        "Restore backup?",
        `${count} records will overwrite everything here. Continue?`,
        () => {
          try {
            Object.entries(parsed.data).forEach(([k, v]) => {
              if (typeof k === "string" && k.startsWith("sf-")) {
                localStorage.setItem(
                  k,
                  typeof v === "string" ? v : JSON.stringify(v),
                );
              }
            });
            location.reload();
          } catch {
            notify("Restore failed — storage unavailable");
          }
        },
      );
    };
    reader.readAsText(file);
  });
  $("[data-wipe]", root)?.addEventListener("click", wipeData);
}
function bindSettings(root) {
  bindDataZone(root);
  $$("[data-mode-set]", root).forEach(
    (b) =>
      (b.onclick = () => {
        if ((b.dataset.modeSet === "night") !== Boolean(state.night))
          toggleNight();
        renderSettings();
      }),
  );  $("[data-tc-start]", root)?.addEventListener("click", () =>
    startTechCheck("settings"),
  );
  $("[data-tc-retake]", root)?.addEventListener("click", () =>
    startTechCheck("settings"),
  );
  $("[data-save-durations]", root)?.addEventListener("click", () => {
    const readPair = (minId, secId, label) => {
      const m = Number.parseInt($(minId, root)?.value, 10);
      const s = Number.parseInt($(secId, root)?.value, 10);
      if (!Number.isFinite(m) || m < 0 || m > 180) {
        notify(`${label}: minutes must be a number between 0 and 180.`);
        return null;
      }
      if (!Number.isFinite(s) || s < 0 || s > 59) {
        notify(`${label}: seconds must be a number between 0 and 59.`);
        return null;
      }
      if (m === 0 && s === 0) {
        notify(`${label} can't be 0:00 — set at least 1 second.`);
        return null;
      }
      return { min: m, sec: s };
    };
    const f = readPair("#set-focus", "#set-focus-s", "Focus");
    if (!f) return;
    const sh = readPair("#set-short", "#set-short-s", "Short break");
    if (!sh) return;
    const l = readPair("#set-long", "#set-long-s", "Long break");
    if (!l) return;
    state.timerMinutes = { focus: f.min, short: sh.min, long: l.min };
    state.timerSeconds = { focus: f.sec, short: sh.sec, long: l.sec };
    applyDurations();
    pushUserSettings();
    if (!sessionInProgress()) {
      state.time = durations[state.mode];
      state.sessionDuration = durations[state.mode];
    }
    persist();
    if (state.tab === "timer") renderTimer();
    notify(
      state.running
        ? "Durations saved — applies from your next session"
        : "Durations saved",
    );
    renderSettings();
  });
  $("[data-change-password]", root)?.addEventListener("click", async () => {
    const next = $("#set-new-password", root)?.value || "";
    const confirm = $("#set-confirm-password", root)?.value || "";
    if (next.length < 6) return notify("Password must be at least 6 characters");
    if (next !== confirm) return notify("Passwords do not match");
    const result = await updatePassword(next);
    if (result.error) return notify(friendlyAuthError(result.error));
    $("#set-new-password", root).value = "";
    $("#set-confirm-password", root).value = "";
    notify("Password updated");
  });
  $("[data-send-reset]", root)?.addEventListener("click", async () => {
    const email = $("#set-reset-email", root)?.value.trim();
    if (!email) return notify("Enter your email first");
    const result = await requestPasswordReset(email);
    notify(result.error ? friendlyAuthError(result.error) : "Password reset link sent — check your inbox");
  });
  $("#set-chime", root)?.addEventListener("change", (e) => {
    state.chimeStyle = e.target.value;
    persist();
    pushUserSettings();
    playChime("focus");
  });
  const chimeVol = $("[data-chime-vol]", root);
  if (chimeVol) {
    chimeVol.oninput = () => {
      state.chimeVolume = chimeVol.value / 100;
      const pct = $("[data-chime-pct]", root);
      if (pct) pct.textContent = `${chimeVol.value}%`;
    };
    chimeVol.onchange = () => {
      persist();
      pushUserSettings();
      playChime("focus");
    };
  }
  $("[data-chime-test]", root)?.addEventListener("click", () =>
    playChime("focus"),
  );
  $$("[data-notif]", root).forEach((box) =>
    box.addEventListener("change", () => {
      state.notifPrefs = {
        completion: true,
        streaks: true,
        community: true,
        ...(state.notifPrefs || {}),
        [box.dataset.notif]: box.checked,
      };
      persist();
      pushUserSettings();
      notify("Notification preference saved");
    }),
  );
  $("#set-reminder-on", root)?.addEventListener("change", (e) => {
    state.reminder = {
      enabled: e.target.checked,
      time: state.reminder?.time || "18:00",
      lastFired: state.reminder?.lastFired || "",
    };
    persist();
    notify(
      e.target.checked
        ? `Daily nudge set for ${state.reminder.time}`
        : "Daily nudge off",
    );
  });
  $("#set-reminder-time", root)?.addEventListener("change", (e) => {
    state.reminder = {
      enabled: state.reminder?.enabled || false,
      time: e.target.value || "18:00",
      lastFired: "",
    };
    persist();
  });
  $("#set-motion", root)?.addEventListener("change", (e) => {
    state.reduceMotion = e.target.checked;
    persist();
    applyMotion();
  });
  $("[data-whatsnew]", root)?.addEventListener("click", () =>
    openWhatsNew(true),
  );
  $("[data-tour-replay]", root)?.addEventListener("click", () => {
    state.tab = "timer";
    persist();
    startTour();
  });
  $$("[data-auto]", root).forEach((box) =>
    box.addEventListener("change", () => {
      state.autostart = {
        breaks: false,
        focus: false,
        ...(state.autostart || {}),
        [box.dataset.auto]: box.checked,
      };
      persist();
      notify(
        box.checked ? "Auto-start on — 5s countdown" : "Auto-start off",
      );
    }),
  );
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
      };
      state.customSkin = { vars };
      persist();
      if (state.equipped?.theme === "custom") applyEquippedTheme();
    }),
  );
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
      };
    }
    state.equipped = { ...(state.equipped || {}), theme: "custom" };
    persist();
    pushUserSettings();
    applyEquippedTheme();
    shell();
    notify("Your theme is live");
  });
  $("[data-skin-reset]", root)?.addEventListener("click", () => {
    state.customSkin = null;
    state.equipped = { ...(state.equipped || {}), theme: null };
    persist();
    pushUserSettings();
    applyEquippedTheme();
    shell();
    notify("Back to the default look");
  });
  $("#set-compact", root)?.addEventListener("change", (e) => {
    state.display = { ...(state.display || {}), compact: e.target.checked };
    persist();
    pushUserSettings();
    applyDisplay();
  });
  $$("[data-zoom]", root).forEach(
    (b) =>
      (b.onclick = () => {
        state.display = { ...(state.display || {}), zoom: +b.dataset.zoom };
        persist();
        pushUserSettings();
        applyDisplay();
        $$("[data-zoom]", root).forEach((x) =>
          x.classList.toggle("on", x === b),
        );
      }),
  );
}

const TOUR_STEPS = [
  { sel: "[data-toggle]", title: "Start a session", text: "One tap begins your focus timer. The ring tracks every second." },
  { sel: "#task-input", title: "Name your task", text: "Type what you're working on — finished sessions attach to it." },
  { sel: ".coins", title: "Earn coins", text: "Every focus session pays coins plus streak bonuses. Spend them in the Rewards store." },
  { sel: ".nav", title: "Explore the tabs", text: "Techniques, sounds, community, store and more live in the sidebar." },
  { sel: null, title: "You're set " + sicon("party"), text: "Finish a session to plant your first garden flower — and come back daily to grow the streak." },
];

let tourStep = 0;

function startTour() {
  tourStep = 0;
  if (state.tab !== "timer") {
    state.tab = "timer";
    persist();
    shell();
  }
  setTimeout(showTourStep, 350);
}

function showTourStep() {
  closeTour();
  const step = TOUR_STEPS[tourStep];
  if (!step) return finishTour();
  let anchor = null;
  if (step.sel) {
    try {
      const visible = [...document.querySelectorAll(step.sel)].filter(
        (el) => el.offsetParent !== null,
      );
      anchor = visible[0] || null;
    } catch {
      anchor = null;
    }
  }
  if (anchor) anchor.classList.add("tour-glow");
  const veil = document.createElement("div");
  veil.id = "tour-veil";
  let pos = "";
  if (anchor) {
    try {
      const r = anchor.getBoundingClientRect();
      const top = Math.min(window.innerHeight - 250, r.bottom + 12);
      const left = Math.max(
        12,
        Math.min(window.innerWidth - 340, r.left),
      );
      pos = ` style="top:${Math.max(12, top)}px;left:${left}px"`;
    } catch {
      pos = "";
    }
  }
  veil.innerHTML = `<div class="tour-tip${anchor ? "" : " tour-center"}"${pos}><div class="eyebrow">Tour ${tourStep + 1}/${TOUR_STEPS.length}</div><h2>${step.title}</h2><p class="muted">${step.text}</p><div class="modal-actions" style="margin-top:12px"><button class="ghost" data-tour-skip>Skip</button>${tourStep ? '<button class="ghost" data-tour-back>Back</button>' : ""}<button class="primary" data-tour-next>${tourStep === TOUR_STEPS.length - 1 ? "Start focusing" : "Next"}</button></div></div>`;
  document.body.append(veil);
  $("[data-tour-skip]", veil).onclick = () => finishTour();
  const back = $("[data-tour-back]", veil);
  if (back)
    back.onclick = () => {
      tourStep--;
      showTourStep();
    };
  $("[data-tour-next]", veil).onclick = () => {
    tourStep++;
    showTourStep();
  };
}

function closeTour() {
  try {
    document
      .querySelectorAll(".tour-glow")
      .forEach((el) => el.classList.remove("tour-glow"));
  } catch {
    /* ignore */
  }
  $("#tour-veil")?.remove();
}

function finishTour() {
  closeTour();
  if (!state.toured) {
    state.toured = true;
    persist();
  }
}



export { openProfile, authenticate, openNotifications, notifIcon, profileCompleteness, completenessMarkup, dataMarkup, exportData, wipeData, renderLanding, renderAccount, accountAuthMarkup, accountSignedInMarkup, bindAccount, savePrivacy, flowCard, themeCard, displayCard, notifCard, comfortCard, shortcutsCard, techCheckCard, renderSettings, bindSettings, TOUR_STEPS, tourStep, startTour, showTourStep, closeTour, finishTour };
export { PRIVACY_VERSION, PRIVACY_UPDATED, PRIVACY_DOC, markPrivacyAccepted, privacyAccepted, privacyAgreementMarkup, privacyDocSections, openPrivacy, privacyCrestSvg, downloadPrivacyPDF, privacyCard };
