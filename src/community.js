/* community.js — community, chat, groups, stories/status loop, calls, sprints */
import {
  state, $, $$, uid, get, save, esc, sicon, stripIcon, persist, notify, confirmBox, viewHead,
  addCoins, addNotification, browserNotify, celebrate, fmt, fmtSize, avatarMarkup, dayKey, notifOn,
  setGroupLookup, fitTextarea, requireAuth, fmtClock, paintBackendPill, registerBackendPillResolver,
} from "./core.js";
import {
  sendCloudMessage, markMessageRead, subscribeToConversation, subscribeToPresence, avatarPublicUrl,
  createWebRtcPeer, recordCall, updateCall, upsertCallParticipant, getCallById, listCallParticipants,
  dmCallRoomId, subscribeToIncomingCalls,
  uploadUserFile, getUserFileUrl, backendConfigured, reportUser, listPublicGroups,
  createCloudGroup, joinCloudGroup, leaveCloudGroup, deleteCloudGroup,
  groupCreate, groupAddMember, groupSetMember, groupLeave, groupTransfer,
  groupDelete, groupUpdate, getMyGroups, getGroupMembers,
  loadConversation, deleteCloudMessage, reactToMessage, loadMessageReactions,
  listFriendships, sendFriendRequest, respondFriendRequest, removeFriend,
  listBlocks, blockUser, unblockUser as serverUnblock,
  createStory, listStories, viewStory, deleteStory, listStoryViews,
  listNotifications, markNotificationRead, markAllNotificationsRead,
  getPublicProfiles, listUserFriends, searchUsers, editCloudMessage,
  uploadGroupAvatar, removeGroupAvatar, getGroupAvatarUrl,
  uploadStoryPhoto, deleteStoryMedia, getStoryMediaUrl,
  setCloudMute, MUTE_FOREVER_AT, validateImageFile, IMAGE_FORMAT_ERROR,
} from "./services/backend.js";
import { playChime } from "./audio.js";
import { matchTech } from "./techniques.js";
import { renderMiniTimer, sessionInProgress, startTimer, updateTimerDom, applyDurations } from "./timer.js";
import { shell } from "./app.js";
import { secureEarn } from "./services/rewards-sync.js";
// Groups exist only when a user creates them — there is no built-in catalog.
// Cloud groups arrive from two reads: the public directory (discoverable by
// everyone) and my own memberships (which also carry private groups plus my
// role). Both merge into cloudGroups; membership rows auto-join sf-joined so
// every downstream flow (Messages, chat, menus) keeps working unchanged.
let cloudGroups = [];
let cloudGroupsAt = 0;
let cloudGroupsSig = "";
// Last backend probe outcome for the Discover status pill:
// "ok" | "degraded" (embed failed, fallback worked) | "down" | "offline" | null (never probed).
let groupsBackendStatus = null;
let groupsBackendStatusAt = 0;
let groupsBackendInflight = false;
// Same contract for the Friends tab's friendships probe. Signed-out users
// never probe (friends are local-only there) — the pill shows "local".
let friendsBackendStatus = null;
let friendsBackendStatusAt = 0;
// Cloud identity caches (in-memory only — never persisted; handles refresh).
let cloudFriends = []; // accepted connections: { id, handle, name, avatar, photo, bio }
// Friend profile-photo URLs (bucket is public-read). One cache per session —
// avatarPublicUrl is a cheap string join, so no network is involved.
const friendPhotoUrls = new Map(); // userId -> public URL or ""
function friendPhotoUrl(id) {
  if (friendPhotoUrls.has(id)) return friendPhotoUrls.get(id);
  const f = cloudFriends.find((x) => x.id === id)
    || cloudFriendReqs.filter((r) => r.incoming).find((r) => r.otherId === id)
    || null;
  const url = f?.photo ? (avatarPublicUrl(f.photo) || "") : "";
  friendPhotoUrls.set(id, url);
  return url;
}
// cloudFriends[].photo / profile.photo often hold a storage PATH — feeding it
// straight to <img src> renders a broken image. Resolve to a public URL once;
// already-absolute URLs and data/blob URIs pass through untouched.
function resolvePhoto(p) {
  if (!p) return "";
  if (/^(https?:|data:|blob:)/.test(p)) return p;
  return avatarPublicUrl(p) || "";
}
function friendAvatarMarkup(id, handle, name, cls) {
  const url = friendPhotoUrl(id);
  const initial = esc(((handle || name || "?")[0] || "?").toUpperCase());
  return url
    ? `<span class="friend-ava${cls ? " " + cls : ""}"><img src="${esc(url)}" alt="" loading="lazy"></span>`
    : `<span class="friend-ava${cls ? " " + cls : ""}">${initial}</span>`;
}
function friendStatusRing(id, handle, name, stories) {
  const has = stories.length > 0;
  const seenAll = stories.every((s) => isSeen("cstory:" + s.id));
  const ringCls = !has ? "none" : seenAll ? "seen" : "new";
  return `<button type="button" class="story-ring ${ringCls}" ${has ? `data-friend-stories="${esc(id)}"` : "disabled"} ${has ? `title="@${esc(handle)}'s status"` : `title="@${esc(handle)} has no status yet"`}>`
    + `<span class="ring-frame">${friendAvatarMarkup(id, handle, name)}</span>`
    + `<small>@${esc(String(handle || name || "?").slice(0, 9))}</small></button>`;
}
// Grouped stories by author: [{ author:{id,handle,name}, items:[...] }]
// Friends first (most recent). Statuses are friends-only: a non-friend's
// update never even enters a group here (defence in depth on top of RLS).
function cloudStoryGroups() {
  const groups = new Map();
  for (const s of cloudStories) {
    if (!s.mine && !cloudFriends.some((f) => f.id === s.userId)) continue;
    if (!groups.has(s.userId)) {
      groups.set(s.userId, {
        author: { id: s.userId, handle: s.handle || "member", name: s.name || s.handle || "member", photo: friendPhotoUrl(s.userId) },
        items: [],
      });
    }
    groups.get(s.userId).items.push(s);
  }
  return [...groups.values()]
    .sort((a, b) => new Date(b.items[0].createdAt) - new Date(a.items[0].createdAt));
}
function friendsWithStories() {
  return cloudStoryGroups().filter((g) => cloudFriends.some((f) => f.id === g.author.id));
}
let cloudFriendReqs = []; // { id, incoming, handle, name, otherId, ts }
function cloudFriendReqsById(id) {
  return cloudFriends.find((f) => f.id === id)
    || (() => { const r = cloudFriendReqs.find((x) => x.otherId === id); return r ? { id: id, handle: r.handle, name: r.name } : null; })();
}
let cloudFriendsAt = 0;
let cloudBlocked = new Set();
let cloudStories = [];
let cloudStoriesAt = 0;
let cloudNotifCount = 0;
let cloudNotifAt = 0;
function isPhase7Missing(error) {
  return /Phase 7 database update/i.test(error?.message || "");
}
// User-facing upload errors, one accurate message per failure class. Only a
// genuine validator verdict (exact IMAGE_FORMAT_ERROR) may surface as the
// format message — storage/auth/network failures get their own message and
// are never relabeled as format errors. (Original errors stay visible in the
// [sf-story-upload] DevTools trace.)
function friendlyUploadError(err) {
  const msg = String(err?.message || err || "");
  if (msg === IMAGE_FORMAT_ERROR) return msg;
  if (/phase 7 database update/i.test(msg)) return "Cloud photos need the latest database update.";
  if (!navigator.onLine || /network|fetch|failed to/i.test(msg))
    return "Couldn't upload the photo because the connection is unavailable.";
  if (/too large|too big|maximum size|exceeded|payload|under \d/i.test(msg))
    return msg.length < 120 ? msg : "Image is too large. Maximum size is 50 MB.";
  if (/not signed in|sign in|session|permission|policy|not allowed|unauthorized|forbidden|owner or an admin|GROUP_FORBIDDEN|NOT_SIGNED_IN/i.test(msg))
    return "You are not signed in or you do not have permission to upload this photo.";
  return "Couldn't upload that photo. Please try again.";
}
// Transient storage faults (5xx, rate limits, dropped connections) deserve
// one automatic retry before surfacing an error — a single retry fixes
// flaky uploads without ever fabricating success.
function isTransientUploadError(err) {
  const status = Number(err?.statusCode ?? err?.status);
  if ([502, 503, 504, 429].includes(status)) return true;
  return /network|fetch|failed to fetch|timeout|econnreset|503|502|504/i.test(String(err?.message || err || ""));
}
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
function cloudSocialSig() {
  return JSON.stringify([cloudFriends.map((f) => f.id), cloudFriendReqs.map((r) => r.id + r.incoming), [...cloudBlocked].sort()]);
}
function signedIn() {
  return Boolean(backendConfigured && state.user);
}
function toCloudGroup(r, mine) {
  return {
    id: r.id,
    name: r.name,
    emoji: sicon(r.logo || "book"),
    logoName: r.logo || "book",
    ownerId: r.owner_id,
    description: r.description || "",
    tags: r.focus_topics || [],
    members: r.member_count ?? 1,
    color: "#47765a",
    source: "cloud",
    visibility: r.visibility || "public",
    myRole: mine?.myRole || null,
    avatarPath: r.avatar_path || null,
    mutedAt: mine?.mutedAt || null,
  };
}
function myGroupRole(id) {
  return (cloudGroups.find((g) => g.id === id) || {}).myRole || null;
}
function isCloudGroup(id) {
  return cloudGroups.some((g) => g.id === id);
}
// Group avatars live in the private studyflow-groups bucket, so <img> tags
// start as the emoji logo and are swapped to signed URLs asynchronously.
// No object URLs (nothing to revoke), no repeated downloads: the backend
// caches signed URLs in memory and each wrap element fetches at most once
// per rendered path (data-av-ok claim).
function groupAvatarMarkup(g) {
  const path = g?.avatarPath || null;
  if (!path || !signedIn()) return `<div class="group-logo">${g?.emoji || "●"}</div>`;
  return `<div class="group-logo" data-av-wrap="${esc(path)}">${g?.emoji || "●"}</div>`;
}
function paintGroupAvatars(root) {
  const scope = root || document;
  if (!signedIn()) return;
  $$("[data-av-wrap]", scope).forEach((el) => {
    const path = el.getAttribute("data-av-wrap");
    if (!path || el.dataset.avOk === path) return;
    el.dataset.avOk = path; // claim first: re-renders replace the node anyway
    getGroupAvatarUrl(path).then(({ data, error } = {}) => {
      if (error || !data?.signedUrl || !el.isConnected) {
        delete el.dataset.avOk;
        return;
      }
      el.innerHTML = `<img src="${esc(data.signedUrl)}" alt="Group avatar">`;
    }).catch(() => { delete el.dataset.avOk; });
  });
}
// Mute sync: local state.mutedChats is the offline-first source of truth for
// the UI; the server (group_memberships.muted_at via sf_mute_set, 017) is the
// cross-device copy. "forever" maps to the MUTE_FOREVER_AT sentinel so expiry
// comparisons keep working everywhere. Mute NEVER blocks delivery — it only
// gates the notification path; realtime + history are untouched.
function muteToCloudValue(rec) {
  if (rec == null) return null;
  if (rec === "forever") return MUTE_FOREVER_AT;
  const n = Number(rec);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
function cloudValueToMute(mutedAt) {
  if (!mutedAt) return undefined;
  if (String(mutedAt) >= "9999") return "forever";
  const t = new Date(mutedAt).getTime();
  return Number.isFinite(t) ? t : undefined;
}
const mutePushInFlight = new Set();
function pushMuteToCloud(id) {
  if (!signedIn() || !isCloudGroup(id) || mutePushInFlight.has(id)) return;
  mutePushInFlight.add(id);
  setCloudMute(id, muteToCloudValue((state.mutedChats || {})[id]))
    .catch(() => {}) // silent: local state stands, retried on next change/load
    .finally(() => mutePushInFlight.delete(id));
}
function adoptServerMutes(groups) {
  // One-way adopt on load: a server mute fills gaps where local has none.
  // Never clobbers a local choice (local wins conflicts; pushes happen on
  // every local change, so divergence self-heals).
  if (!signedIn()) return;
  let changed = false;
  for (const g of groups || []) {
    if (!g?.id || !g.mutedAt) continue;
    if ((state.mutedChats || {})[g.id] != null) continue;
    const v = cloudValueToMute(g.mutedAt);
    if (v == null) continue;
    if (v !== "forever" && v <= Date.now()) continue; // expired server mute
    state.mutedChats = { ...(state.mutedChats || {}), [g.id]: v };
    changed = true;
  }
  if (changed) persist();
}
async function refreshCloudGroups(force) {
  if (!backendConfigured) return cloudGroups;
  if (!force && Date.now() - cloudGroupsAt < 60000 && cloudGroups.length) return cloudGroups;
  if (groupsBackendInflight) return cloudGroups;
  groupsBackendInflight = true;
  try {
    const { data, error, degraded } = await listPublicGroups(200);
    if (!error && Array.isArray(data)) {
      // "degraded": only the no-embed fallback worked — server is up but
      // sick (e.g. the 42P17 policy recursion). Groups still load.
      groupsBackendStatus = degraded ? "degraded" : "ok";
      groupsBackendStatusAt = Date.now();
      const mine = signedIn() ? await getMyGroups().catch(() => ({ data: [] })) : { data: [] };
      const byId = new Map();
      for (const r of data) byId.set(r.id, toCloudGroup(r, null));
      for (const m of mine.data || []) {
        if (!m || !m.id) continue;
        byId.set(m.id, toCloudGroup(m, m));
        if (!(get("sf-joined", []).includes(m.id))) {
          save("sf-joined", [...get("sf-joined", []), m.id]);
        }
      }
      const next = [...byId.values()];
      adoptServerMutes(next);
      const sig = JSON.stringify(next.map((g) => [g.id, g.name, g.myRole, g.visibility, g.avatarPath || "", g.mutedAt || ""]));
      if (sig !== cloudGroupsSig) {
        cloudGroups = next;
        cloudGroupsSig = sig;
        cloudGroupsAt = Date.now();
      }
    } else if (error) {
      // The embed fallback in listPublicGroups already retried without the
      // count; an error here means even the plain query failed (policy
      // recursion, outage) — the 500 case.
      groupsBackendStatus = /Failed to fetch|network|NetworkError/i.test(error.message || "") ? "offline" : "down";
      groupsBackendStatusAt = Date.now();
    }
  } catch {
    /* offline — keep stale cache */
    groupsBackendStatus = "offline";
    groupsBackendStatusAt = Date.now();
  } finally {
    groupsBackendInflight = false;
  }
  return cloudGroups;
}

function allGroups() {
  const seen = new Set();
  return [...(state.customGroups || []), ...cloudGroups].filter((g) => {
    if (!g || !g.id || seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}
setGroupLookup(() => allGroups());

// Friendships / blocks / notification badge, refreshed at most once a minute.
// Failures (offline, or a project without migration 016) keep the previous
// cache — every caller falls back to local-only behavior.
async function refreshCloudSocial(force) {
  if (!signedIn()) return;
  // Connections feed chats, pickers, the Notifications inbox and every
  // avatar on the site — a 60s throttle made those feel stale. 10s keeps
  // requests/acceptances near-instant without hammering the directory.
  if (!force && Date.now() - cloudFriendsAt < 10000 && cloudFriendsAt) return;
  try {
    // allSettled instead of per-call catch: a transient failure must NOT
    // silently wipe the connections list to empty — keep the stale cache
    // and surface the failure on the status pill instead.
    const results = await Promise.allSettled([listFriendships(), listBlocks()]);
    const shipsFail = results[0].status === "rejected";
    const ships = shipsFail ? null : results[0].value;
    const blocks = results[1].status === "fulfilled" ? results[1].value : { data: [] };
    if (shipsFail) {
      friendsBackendStatus = /fetch|network/i.test(String(results[0].reason)) ? "offline" : "down";
      friendsBackendStatusAt = Date.now();
      return; // stale cache stands
    }
    const rows = Array.isArray(ships?.data) ? ships.data : [];
    const me = state.user.id;
    const others = [...new Set(rows.map((r) => (r.user_id === me ? r.friend_id : r.user_id)).filter(Boolean))];
    const profRes = await Promise.allSettled([getPublicProfiles(others)]);
    const profFail = profRes[0].status === "rejected";
    const profiles = profFail ? { data: [] } : profRes[0].value;
    const byId = new Map((profiles?.data || []).map((p) => [p.id, p]));
    // Profiles are cosmetic (fallback handle exists) — a profiles-only
    // failure reads as "degraded", not "down".
    friendsBackendStatus = profFail ? "degraded" : "ok";
    friendsBackendStatusAt = Date.now();
    cloudFriends = rows
      .filter((r) => r.status === "accepted")
      .map((r) => {
        const oid = r.user_id === me ? r.friend_id : r.user_id;
        const p = byId.get(oid) || {};
        return { id: oid, handle: p.handle || "member", name: p.name || p.handle || "Member", avatar: p.avatar || "•", photo: p.photo_path || "", bio: p.bio || "" };
      });
    cloudFriendReqs = rows
      .filter((r) => r.status === "pending")
      .map((r) => {
        const incoming = r.friend_id === me;
        const oid = incoming ? r.user_id : r.friend_id;
        const p = byId.get(oid) || {};
        return { id: r.id, incoming, otherId: oid, handle: p.handle || "member", name: p.name || p.handle || "Member", photo: p.photo_path || "", ts: r.created_at };
      });
    cloudBlocked = new Set((Array.isArray(blocks) ? blocks : []).map((b) => b.blocked_id).filter(Boolean));
    cloudFriendsAt = Date.now();
    friendPhotoUrls.clear(); // profiles may have updated photos
  } catch {
    /* offline — keep stale cache */
    friendsBackendStatus = "offline";
    friendsBackendStatusAt = Date.now();
  }
}
async function refreshCloudNotifCount(force) {
  if (!signedIn()) return 0;
  if (!force && Date.now() - cloudNotifAt < 60000 && cloudNotifAt) return cloudNotifCount;
  try {
    const { data } = await listNotifications(50).catch(() => ({ data: [] }));
    cloudNotifCount = (data || []).filter((n) => !n.read_at).length;
    cloudNotifAt = Date.now();
  } catch {
    /* offline — keep stale count */
  }
  return cloudNotifCount;
}

let activePeer;
// Full-mesh group calls: one RTCPeerConnection per remote peer (cap 6).
// 1:1 keeps a single entry so existing mute/camera/share paths still work
// through activePeer (bound to the first/only peer).
const callPeers = new Map(); // peerId -> { peer, close }
const callRemotes = new Map(); // peerId -> MediaStream
let callIsInitiator = false; // true = we offer; false = we wait for offer
let incomingCallSub = null;
let pendingIncomingCall = null; // ringing call_history row awaiting our Accept
let outgoingRingT = 0;
let meshWatchT = 0; // periodic mid-call peer discovery (cap 6)
let connectInFlight = false;
let forceConnectPending = false; // Accept raced a live connect — re-offer after

function callRoomSignalingId(roomId, a, b) {
  // Pair-scoped channel inside a shared call room so group mesh signals
  // never cross wires between different peer pairs.
  if (!a || !b) return roomId;
  return `${roomId}:${[a, b].sort().join("--")}`;
}

async function resolveCallTargets() {
  const myId = state.user?.id || uid();
  const targets = new Set();
  const extras = Array.isArray(state.call?.extras) ? state.call.extras : [];
  for (const id of extras) if (id && id !== myId) targets.add(id);
  if (state.call?.kind === "group") {
    try {
      const { data: members } = await getGroupMembers(state.call.id);
      for (const m of members || []) {
        const id = m.user_id || m.id;
        if (id && id !== myId) targets.add(id);
      }
    } catch {
      /* roster unavailable — extras / participants still dial */
    }
  }
  if (activeCallHistoryId) {
    try {
      const { data: parts } = await listCallParticipants(activeCallHistoryId);
      for (const p of parts || []) {
        if (p.user_id && p.user_id !== myId) targets.add(p.user_id);
      }
    } catch {
      /* offline — local targets stand */
    }
  }
  if (state.call?.peerId && state.call.peerId !== myId) targets.add(state.call.peerId);
  if (!targets.size && state.call?.kind === "dm" && state.call.id) {
    targets.add(state.call.id);
  }
  // Mesh cap: self + 5 remotes = 6.
  return [...targets].slice(0, 5);
}

async function ensureCallPeer(peerId, stream) {
  if (!peerId || callPeers.has(peerId) || !state.call) return;
  const myId = state.user?.id || uid();
  if (peerId === myId) return;
  const pureDm = state.call.kind === "dm" && !(state.call.extras || []).length;
  const initiator = pureDm ? callIsInitiator : myId < peerId;
  try {
    const handle = await createWebRtcPeer({
      roomId: callRoomSignalingId(state.call.id, myId, peerId),
      userId: myId,
      initiator,
      stream,
      peerId,
      onTrack: (incoming) => {
        if (incoming) callRemotes.set(peerId, incoming);
        remoteStream = callRemotes.values().next().value || remoteStream;
        if (state.callStatus !== "connected") {
          state.callStatus = "connected";
          notify(sicon("user") + " A study partner joined the call");
        }
        renderCall();
      },
      onStateChange: (status) => {
        if (status === "connected") {
          if (state.callStatus !== "connected") state.callStatus = "connected";
          startMeshWatch();
        } else if (status === "failed" || status === "disconnected") {
          callRemotes.delete(peerId);
          if (!callRemotes.size && state.callStatus === "connected") {
            state.callStatus = "connecting";
            notify("Call connection lost. Press Connect to retry.");
          }
        }
        renderCall();
      },
    });
    callPeers.set(peerId, handle);
    if (!activePeer) activePeer = handle;
  } catch (err) {
    console.warn("[call] peer failed", peerId, err);
  }
}

// Additive mesh fill: dial any known participant we don't already have —
// used by mid-call invites without tearing live peers.
async function meshMissingPeers() {
  if (!state.call || !activeCallStream) return;
  const targets = await resolveCallTargets();
  await Promise.all(targets.map((id) => ensureCallPeer(id, activeCallStream)));
  if (callPeers.size) startMeshWatch();
  renderCall();
}

function startMeshWatch() {
  if (meshWatchT) return;
  meshWatchT = setInterval(() => {
    if (!state.call || state.callStatus === "idle") {
      stopMeshWatch();
      return;
    }
    meshMissingPeers().catch(() => {});
  }, 8000);
}

function stopMeshWatch() {
  if (meshWatchT) {
    clearInterval(meshWatchT);
    meshWatchT = 0;
  }
}

function ensureIncomingCallSubscription() {
  if (!backendConfigured || !state.user || incomingCallSub) return;
  incomingCallSub = subscribeToIncomingCalls(state.user.id, {
    onRinging: async (row) => {
      if (!row?.id || pendingIncomingCall?.id === row.id) return;
      if (row.initiator_id && row.initiator_id === state.user.id) return;
      if (state.call && state.callStatus !== "idle") return; // already in a call
      // Mid-call participant inserts only carry call_id — hydrate the full
      // history row so Accept has room_id / initiator / group.
      if (row._fromParticipant || !row.room_id) {
        try {
          const { data } = await getCallById(row.id);
          if (data) row = data;
        } catch {
          /* fall through with partial row */
        }
        if (!row?.room_id || !row?.initiator_id) return;
        if (row.initiator_id === state.user.id) return;
      }
      showIncomingCall(row);
    },
    onAccepted: (row) => {
      if (!row?.id) return;
      if (activeCallHistoryId && row.id !== activeCallHistoryId) return;
      if (row.initiator_id !== state.user?.id || !state.call) return;
      // They accepted — we offer (or re-offer if our early timeout offer
      // went out before their signaling channel was up).
      callIsInitiator = true;
      if (state.callStatus === "connected" && activeCallStream) {
        meshMissingPeers().catch(() => {});
      } else {
        connectCall({ force: true }).catch(() => {});
      }
    },
    onCancelled: (row) => {
      if (!row?.id) return;
      if (pendingIncomingCall?.id === row.id) {
        pendingIncomingCall = null;
        $("#incoming-call-modal")?.remove();
        notify("Missed call");
      }
      if (activeCallHistoryId && row.id === activeCallHistoryId && state.call) {
        teardownCall(false);
        notify("The other side ended the call");
      }
    },
  });
}

function teardownCall(notifyEnd = true) {
  clearTimeout(outgoingRingT);
  stopMeshWatch();
  callPeers.forEach((p) => {
    try { p.close(); } catch { /* ignore */ }
  });
  callPeers.clear();
  callRemotes.clear();
  activePeer = null;
  try {
    activeCallStream?.getTracks().forEach((t) => t.stop());
  } catch { /* ignore */ }
  activeCallStream = null;
  remoteStream = null;
  state.call = null;
  state.callStatus = "idle";
  state.callStartedAt = 0;
  state.callMinimized = false;
  stopCallClock();
  $("#call-window")?.remove();
  if (activeCallHistoryId) {
    updateCall(activeCallHistoryId, { status: "ended", ended_at: new Date().toISOString() }).catch(() => {});
    if (state.user)
      upsertCallParticipant({
        call_id: activeCallHistoryId,
        user_id: state.user.id,
        status: "left",
        left_at: new Date().toISOString(),
      }).catch(() => {});
    activeCallHistoryId = null;
  }
  if (notifyEnd) notify("Call ended — great studying together " + sicon("check"));
}

function showIncomingCall(row) {
  if ($("#incoming-call-modal")) return;
  pendingIncomingCall = row;
  const friend = cloudFriends.find((f) => f.id === row.initiator_id) || null;
  const name = friend?.name || friend?.handle || "Someone";
  const handle = friend?.handle || "";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "incoming-call-modal";
  modal.innerHTML = `<div class="modal incoming-call"><div class="eyebrow">Incoming call</div><div class="incoming-call-who">${friendAvatarMarkup(row.initiator_id, handle || "?", name)}<div><h2>${esc(name)}</h2><p class="muted">${handle ? "@" + esc(handle) : ""} is calling you</p></div></div><div class="modal-actions"><button type="button" class="danger-button" data-ic-decline>${sicon("x")} Decline</button><button type="button" class="primary" data-ic-accept>${sicon("phone")} Accept</button></div></div>`;
  $("#modal-root")?.append(modal);
  modal.querySelector("[data-ic-decline]").onclick = async () => {
    pendingIncomingCall = null;
    modal.remove();
    await updateCall(row.id, { status: "missed", ended_at: new Date().toISOString() }).catch(() => {});
    await upsertCallParticipant({
      call_id: row.id,
      user_id: state.user.id,
      status: "declined",
      left_at: new Date().toISOString(),
    }).catch(() => {});
  };
  modal.querySelector("[data-ic-accept]").onclick = async () => {
    pendingIncomingCall = null;
    modal.remove();
    await acceptIncomingCall(row);
  };
}

async function acceptIncomingCall(row) {
  if (!state.user) return;
  const friend = cloudFriends.find((f) => f.id === row.initiator_id) || null;
  const room = row.room_id || dmCallRoomId(row.initiator_id, state.user.id);
  state.call = {
    id: room,
    peerId: row.initiator_id,
    kind: row.group_id ? "group" : "dm",
    name: friend?.name || friend?.handle || "Study partner",
    emoji: "◉",
    color: "#47765a",
    extras: [],
  };
  state.callMinimized = false;
  state.callStatus = "connecting";
  activeCallHistoryId = row.id;
  callIsInitiator = false; // callee waits for the offer
  renderCall();
  // Join signaling BEFORE flipping history: the initiator's onAccepted
  // offer must not race an empty channel.
  try {
    await connectCall();
  } catch {
    /* surface stays in connecting — user can retry */
  }
  await updateCall(row.id, { status: "connecting", connected_at: new Date().toISOString() }).catch(() => {});
  await upsertCallParticipant({
    call_id: row.id,
    user_id: state.user.id,
    status: "connected",
    joined_at: new Date().toISOString(),
  }).catch(() => {});
  startMeshWatch();
}
async function startOutgoingCall(chatId) {
  if (!requireAuth("start a call")) return;
  const group = allGroups().find((g) => g.id === chatId);
  const isGroup = Boolean(group);
  const peerId = isGroup ? null : chatId;
  const roomId = isGroup ? chatId : dmCallRoomId(state.user.id, chatId);
  const peer = peerId ? (cloudFriends.find((f) => f.id === peerId) || null) : null;
  state.call = isGroup
    ? { id: roomId, kind: "group", name: group?.name || "Group call", emoji: group?.emoji || "◉", color: group?.color || "#47765a", extras: [] }
    : { id: roomId, peerId, kind: "dm", name: peer?.name || peer?.handle || "Study partner", emoji: "◉", color: "#47765a", extras: [] };
  state.callMinimized = false;
  state.callStatus = "connecting";
  callIsInitiator = true;
  activeCallHistoryId = null;
  renderCall();
  if (backendConfigured && state.user && navigator.onLine !== false) {
    try {
      const result = await recordCall({
        room_id: roomId,
        initiator_id: state.user.id,
        recipient_id: isGroup ? null : peerId,
        group_id: isGroup ? chatId : null,
        status: "ringing",
        started_at: new Date().toISOString(),
      });
      activeCallHistoryId = result.data?.id || null;
      if (activeCallHistoryId) {
        await upsertCallParticipant({
          call_id: activeCallHistoryId,
          user_id: state.user.id,
          status: "ringing",
          joined_at: new Date().toISOString(),
        }).catch(() => {});
        if (peerId) {
          await upsertCallParticipant({
            call_id: activeCallHistoryId,
            user_id: peerId,
            status: "ringing",
          }).catch(() => {});
        } else {
          // Group: ring every member (participant INSERT drives their modal).
          try {
            const { data: members } = await getGroupMembers(chatId);
            for (const m of members || []) {
              if (m.user_id && m.user_id !== state.user.id)
                await upsertCallParticipant({
                  call_id: activeCallHistoryId,
                  user_id: m.user_id,
                  status: "ringing",
                }).catch(() => {});
            }
          } catch {
            /* members list unavailable — mesh still dials known peers */
          }
        }
      }
      // 1:1: wait for Accept before offering (grace retry covers a lost
      // early offer if their channel wasn't up yet).
      if (!isGroup) {
        clearTimeout(outgoingRingT);
        outgoingRingT = setTimeout(() => {
          if (state.call && state.callStatus === "connecting" && !callPeers.size) {
            connectCall({ force: true }).catch(() => {});
          }
        }, 2500);
        return;
      }
    } catch {
      /* offline/local fallback below */
    }
  }
  // Group or no backend: join immediately as mesh initiator for known peers.
  connectCall().catch(() => {});
  if (isGroup) startMeshWatch();
}

let conversationSubscription;
let chatSubTarget = null; // id of the chat conversationSubscription points at

let activeCallHistoryId;

let activeCallStream = null;

let chatReply = null;

let chatTypingSentAt = 0;

const typingTimeouts = {};

let voiceRec = null;

/* Seeded pseudo-random waveform bars — every voice message gets a unique but
   stable voiceprint-like shape (deterministic per message id). */
function waveSeed(id) {
  let h = 2166136261;
  for (const ch of String(id)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
}
const VMSG_BARS = 36;
const vmsgWave = (id) => {
  const rnd = waveSeed(id);
  let out = "";
  for (let i = 0; i < VMSG_BARS; i++) {
    const peak = 22 + Math.round(rnd() * 68);
    out += `<i style="height:${peak}%"></i>`;
  }
  return out;
};

/* One shared <audio> element — opening a new voice message stops the previous
   one, exactly like WhatsApp. `activeVoice` tracks the message id, and the
   widget is re-resolved from the live DOM on every paint: ambient re-renders
   replace bubble elements, so a held element reference would go stale. */
let activeVoice = null;
const liveWidget = (id) =>
  [...document.querySelectorAll("[data-vmsg]")].find(
    (w) => w.dataset.vid === id,
  ) || null;
function stopActiveVoice() {
  if (!activeVoice) return;
  try {
    activeVoice.audio.pause();
    activeVoice.audio.currentTime = 0;
  } catch {
    /* ignore */
  }
  // The 80ms paint loop belongs to this session — clear it so finished
  // sessions don't leave orphaned intervals ticking forever.
  try {
    clearInterval(activeVoice.raf);
  } catch {
    /* ignore */
  }
  const widget = liveWidget(activeVoice.id);
  widget?.classList.remove("playing");
  paintVoice(activeVoice.id, 0);
  stopVoiceEngine();
  activeVoice = null;
}
function paintVoice(id, frac) {
  const widget = liveWidget(id);
  if (!widget) return;
  const wave = widget.querySelector("[data-vmsg-wave]");
  if (!wave) return;
  if (activeVoice?.id === id) {
    widget.classList.toggle("playing", !activeVoice.audio.paused);
  }
  const bars = wave.children;
  const played = frac * bars.length;
  for (let i = 0; i < bars.length; i++) {
    bars[i].classList.toggle("on", i < played);
  }
  const now = widget.querySelector("[data-vmsg-now]");
  if (now) {
    now.textContent = fmtClock(
      Math.round(frac * (Number(widget.dataset.dur) || 0)),
    );
  }
}
function ensureActiveVoice() {
  if (activeVoice?.audio) return activeVoice;
  const audio = new Audio();
  audio.preload = "metadata";
  // Paint loop instead of relying on `timeupdate`: some browsers throttle or
  // skip that event, and the loop doubles as the ended-detector.
  activeVoice = {
    audio,
    id: null,
    raf: setInterval(() => {
      if (!activeVoice || audio !== activeVoice.audio) return;
      if (audio.paused && !audio.ended) return;
      const widget = liveWidget(activeVoice.id);
      const dur = Number(widget?.dataset.dur) || audio.duration || 1;
      if (audio.ended || (!audio.paused && dur > 0 && audio.currentTime >= dur - 0.05)) {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          /* ignore */
        }
        paintVoice(activeVoice.id, 0);
        widget?.classList.remove("playing");
        clearInterval(activeVoice.raf);
        activeVoice = null;
        return;
      }
      paintVoice(activeVoice.id, Math.min(1, audio.currentTime / dur));
    }, 80),
  };
  return activeVoice;
}
function stopVoiceEngine() {
  if (activeVoice?.raf) clearInterval(activeVoice.raf);
}

let presenceSub = null;

let presenceInfo = { chatId: null, users: [] };

let sprintTicker = null;

// True while the user is mid-action on this page — typing, holding a pointer
// or mouse button, or with an open menu/select/modal. Ambient loops must not
// rebuild the panel underneath them; anything they produced is picked up on
// the next natural render instead.
function userIsBusy() {
  try {
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return true;
    // A pressed pointer (dragging, selecting, mid-click) blocks re-render.
    if (window.__sfPointerDown > 0) return true;
    // Any open modal, popup or expanded menu blocks re-render too.
    if (document.querySelector(".modal-backdrop, [data-picker]:not([hidden]), .post-menu:not([hidden]), [data-chat-pop]:not([hidden]), [data-chat-extras-pop]:not([hidden]), .friend-pick.drop:not([hidden])")) return true;
  } catch {
    /* never let a busy-check break the ticker */
  }
  return false;
}

if (!window.__sfPointerWatch) {
  window.__sfPointerWatch = true;
  window.__sfPointerDown = 0;
  const releasePointer = () => {
    window.__sfPointerDown = Math.max(0, window.__sfPointerDown - 1);
  };
  document.addEventListener("pointerdown", () => {
    window.__sfPointerDown++;
  }, true);
  document.addEventListener("pointerup", releasePointer, true);
  document.addEventListener("pointercancel", releasePointer, true);
  // Released outside the window (drag out, OS-level steal) never fires
  // pointerup here — clear on blur so "busy" can never stick permanently.
  window.addEventListener("blur", () => {
    window.__sfPointerDown = 0;
  });
}

function weekKey(d) {
  const dt = new Date(d.getTime ? d.getTime() : d);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  return dayKey(dt);
}

function logFocusDay(min) {
  const k = dayKey(new Date());
  state.focusDays[k] = (state.focusDays[k] || 0) + min;
  const cutoff = Date.now() - 70 * 86400000;
  Object.keys(state.focusDays).forEach((key) => {
    if (new Date(key + "T00:00:00").getTime() < cutoff)
      delete state.focusDays[key];
  });
  persist();
}

function weekMinutes(wk) {
  return Object.entries(state.focusDays || {})
    .filter(([date]) => weekKey(new Date(date + "T00:00:00")) === wk)
    .reduce((n, [, m]) => n + m, 0);
}

function progressChallenges(focusedMin) {
  const wk = weekKey(new Date());
  (state.challenges || []).forEach((c) => {
    sanitizeChallenge(c);
    if (c.weekKey !== wk || c.done || !c.joined) return;
    const me = state.profile.handle || "you";
    bumpChallengeMember(c, me, true, focusedMin);
    c.progress += c.unit === "minutes" ? focusedMin : 1;
    postGroupMessage(
      c.groupId,
      `@${me} finished a ${fmtPace(c)} session — ${Math.min(c.progress, c.target)}/${c.target} ${c.unit} in “${c.title}”.`,
      "trophy",
    );
    // A rival answers back — the leaderboard stays alive.
    if (!c.done && Math.random() < 0.4) mateChallengeSession(c, true);
    if (c.progress >= c.target) finishChallenge(c, null);
  });
  persist();
}

/* ---------- group challenges pro: prescribed pace, leaderboard, one-at-a-time lock ---------- */
function fmtPace(c) {
  const m = Math.max(0, c.sessionMin || 0);
  const s = Math.max(0, Math.min(59, c.sessionSec || 0));
  return `${m}:${String(s).padStart(2, "0")}`;
}

function paceSec(c) {
  return Math.max(1, (c.sessionMin || 0) * 60 + (c.sessionSec || 0));
}

function sanitizeChallenge(c) {
  if (!c || typeof c !== "object") return c;
  if (!Number.isFinite(+c.sessionMin)) c.sessionMin = 25;
  if (!Number.isFinite(+c.sessionSec)) c.sessionSec = 0;
  c.sessionMin = Math.min(180, Math.max(0, Math.floor(+c.sessionMin)));
  c.sessionSec = Math.min(59, Math.max(0, Math.floor(+c.sessionSec)));
  if (c.sessionMin === 0 && c.sessionSec === 0) c.sessionMin = 25;
  if (!c.ownerId) c.ownerId = "";
  if (c.joined == null) c.joined = true; // legacy rooms counted automatically
  if (!Array.isArray(c.members) || !c.members.length) {
    const names = [...SPRINT_PEER_NAMES].sort(() => Math.random() - 0.5).slice(0, 3);
    const per = paceSec(c) / 60;
    c.members = names.map((name) => {
      const sessions = Math.floor(Math.random() * Math.max(1, Math.min(4, (c.target || 10) - 1)));
      return { id: "cm-" + uid(), name, sessions, minutes: Math.round(sessions * per) };
    });
  }
  if (!c.members.some((m) => m.you)) {
    // Legacy progress was mine alone — carry it onto my leaderboard row.
    c.members.unshift({
      id: "cm-me",
      name: state.profile.handle || "you",
      you: true,
      sessions: c.unit === "sessions" ? Math.min(c.progress || 0, c.target || 0) : 0,
      minutes: c.unit === "minutes" ? c.progress || 0 : Math.round((c.progress || 0) * paceSec(c) / 60),
    });
  }
  return c;
}

// One race at a time: legacy weeks may hold several auto-counted challenges,
// so keep the first undone one and park the rest as joinable.
function ensureChallengeFields() {
  if (!Array.isArray(state.challenges)) state.challenges = [];
  const wk = weekKey(new Date());
  let kept = false;
  state.challenges.forEach((c) => {
    sanitizeChallenge(c);
    if (c.weekKey === wk && !c.done && c.joined) {
      if (kept) c.joined = false;
      else kept = true;
    }
  });
  const active = state.challenges.find((c) => c.weekKey === wk && !c.done && c.joined);
  if (active && state.activeChallengeId !== active.id) {
    state.activeChallengeId = active.id;
    persist();
  }
  // Validate the pointer inline (never via challengeLock — that calls back
  // here and would recurse forever).
  const valid = (state.challenges || []).some(
    (x) => x.id === state.activeChallengeId && x.weekKey === wk && !x.done && x.joined,
  );
  if (!valid && state.activeChallengeId) state.activeChallengeId = null;
}

// The challenge currently locking the focus timer (self-healing).
function challengeLock() {
  ensureChallengeFields();
  const wk = weekKey(new Date());
  const c = (state.challenges || []).find(
    (x) => x.id === state.activeChallengeId && x.weekKey === wk && !x.done && x.joined,
  );
  if (!c && state.activeChallengeId) {
    state.activeChallengeId = null;
    persist();
  }
  return c || null;
}

function otherActiveChallenge(id) {
  const wk = weekKey(new Date());
  return (state.challenges || []).find(
    (x) => x.id !== id && x.weekKey === wk && !x.done && x.joined,
  );
}

function joinChallenge(id) {
  const c = (state.challenges || []).find((x) => x.id === id);
  if (!c || c.done) return false;
  sanitizeChallenge(c);
  const other = otherActiveChallenge(id);
  if (other) {
    notify(`One race at a time — finish or leave “${other.title}” first`);
    return false;
  }
  if (sessionInProgress()) {
    notify("Finish or reset your current session before joining");
    return false;
  }
  c.joined = true;
  state.activeChallengeId = c.id;
  const dur = paceSec(c);
  state.mode = "focus";
  state.time = dur;
  state.sessionDuration = dur;
  state.running = false;
  state.endsAt = null;
  state.sessionTech = null;
  state.sprintSession = null;
  try {
    applyDurations();
  } catch {
    /* timer module warms it on next render */
  }
  persist();
  return true;
}

function leaveChallenge(id) {
  const c = (state.challenges || []).find((x) => x.id === id);
  if (state.activeChallengeId === id) state.activeChallengeId = null;
  if (c) {
    c.joined = false;
    c.progress = 0;
    const me = c.members?.find((m) => m.you);
    if (me) {
      me.sessions = 0;
      me.minutes = 0;
    }
  }
  try {
    applyDurations();
  } catch {
    /* ignore */
  }
  persist();
  return true;
}

// Focus-desk banner for the active challenge lock.
function challengeLockBanner() {
  const c = challengeLock();
  if (!c) return "";
  return `<div class="challenge-lock"><span class="lock-ico">${sicon("lock")}</span><div><strong>Challenge lock · “${esc(c.title)}”</strong><br><small class="muted">Every focus session runs ${fmtPace(c)} — templates and custom durations are paused until you leave.</small></div><button type="button" class="ghost" data-challenge-leave="${c.id}">Leave</button></div>`;
}

function bumpChallengeMember(c, name, you, focusedMin) {
  c.members = Array.isArray(c.members) ? c.members : [];
  let m = c.members.find((x) => (you && x.you) || (!you && x.name === name));
  if (!m) {
    m = { id: "cm-" + uid(), name, you: Boolean(you), sessions: 0, minutes: 0 };
    c.members.push(m);
  }
  m.sessions = (m.sessions || 0) + 1;
  m.minutes = (m.minutes || 0) + Math.max(1, Math.round(focusedMin || paceSec(c) / 60));
  return m;
}

function challengeScore(c, m) {
  return c.unit === "minutes" ? m.minutes || 0 : m.sessions || 0;
}

function mateWon(c, m) {
  return challengeScore(c, m) >= (c.target || 0);
}

// A simulated group mate logs a session of their own.
function mateChallengeSession(c, announce) {
  const mates = (c.members || []).filter((m) => !m.you);
  let who = mates.length && Math.random() < 0.8
    ? mates[Math.floor(Math.random() * mates.length)]
    : null;
  if (!who) {
    if ((c.members || []).length >= 6 && mates.length) {
      who = mates[Math.floor(Math.random() * mates.length)];
    } else {
      who = { id: "cm-" + uid(), name: SPRINT_PEER_NAMES[Math.floor(Math.random() * SPRINT_PEER_NAMES.length)], sessions: 0, minutes: 0 };
      (c.members = c.members || []).push(who);
    }
  }
  const logged = bumpChallengeMember(c, who.name, false, paceSec(c) / 60);
  // Ambient posts are throttled — at most one shout per 90s per challenge.
  const nowT = Date.now();
  if (announce && nowT - (c._matePostAt || 0) > 90000) {
    c._matePostAt = nowT;
    postGroupMessage(
      c.groupId,
      `@${who.name} finished a ${fmtPace(c)} session — now at ${logged.sessions} session${logged.sessions === 1 ? "" : "s"} in “${c.title}”.`,
      "fire",
      who.name,
    );
  }
  if (mateWon(c, logged)) finishChallenge(c, logged.name);
  persist();
  return logged;
}

function finishChallenge(c, winnerName) {
  if (c.done) return;
  c.done = true;
  c.winner = winnerName || state.profile.handle || "you";
  if (!winnerName) {
    const award = c.unit === "minutes"
      ? Math.min(100, Math.round(c.target / 2))
      : Math.min(100, c.target * 5);
    // Ledger-routed (idempotent per challenge) for members; local otherwise.
    try {
      secureEarn({ amount: award, reason: "Challenge complete", refKey: `challenge:${c.id}` }).catch(() => {});
    } catch {
      addCoins(award);
    }
    addNotification("Challenge complete", `${c.title} — +${award} coins showered.`, "trophy");
    postGroupMessage(c.groupId, `“${c.title}” complete — @${c.winner} takes the crown with ${c.target} ${c.unit}. +${award} coins showered. 👑`, "crown");
    notify(`${sicon("trophy")} Challenge complete · +${award} coins`);
    celebrate(true);
    if (notifOn("completion")) playChime("focus");
  } else {
    postGroupMessage(c.groupId, `👑 @${winnerName} takes “${c.title}” with ${c.target} ${c.unit}. The crown is theirs — run it back next week?`, "crown", winnerName);
    addNotification("Challenge crown taken", `@${winnerName} won “${c.title}” in your group.`, "crown");
    notify(`👑 @${winnerName} takes “${c.title}” — run it back`);
  }
  if (state.activeChallengeId === c.id) state.activeChallengeId = null;
  try {
    applyDurations();
  } catch {
    /* timer module warms it on next render */
  }
  persist();
}

function fmtCountdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function clearSprintTicker() {
  if (sprintTicker) {
    clearInterval(sprintTicker);
    sprintTicker = null;
  }
}

function ensureSprintTicker() {
  clearSprintTicker();
  sprintTicker = setInterval(() => {
    if (state.tab !== "community" || state.subtab !== "sprints") {
      clearSprintTicker();
      return;
    }
    const now = Date.now();
    let changed = false;
    (state.sprints || []).forEach((sp) => {
      sanitizeSprint(sp);
      // Friends simulate reading their invite and replying while you watch.
      if (!sp.result && (sp.invites || []).some((i) => i.status === "pending") && Math.random() < 0.03) {
        if (resolveOneInvite(sp)) {
          changed = true;
          // Never wipe a half-typed room title / open menu for ambient news —
          // just persist and let the chips catch up on the next render.
          if (!userIsBusy()) {
            renderCommunity();
            return;
          } else {
            notify("A friend just replied to your sprint invite");
          }
        }
      }
      // Live crew members inch forward; some finish a sprint of their own.
      const liveNow = now >= sp.startsAt && now < sp.startsAt + sp.durationSec * 1000;
      if (!sp.result && liveNow && Array.isArray(sp.roster)) {
        sp.roster.forEach((c) => {
          if (c.you || (c.left ?? 0) === 0) return;
          c.pct = Math.min(99, (c.pct || 0) + Math.random() * 2.2);
          if (c.pct >= 99 && Math.random() < 0.25) {
            c.left = Math.max(0, (c.left ?? 1) - 1);
            c.pct = c.left === 0 ? 100 : 4;
            changed = true;
          }
        });
      }
      if (sp.result || !sp.joined) return;
      const end = sp.startsAt + sp.durationSec * 1000;
      if (now >= sp.startsAt && !sp.liveNotified) {
        sp.liveNotified = true;
        changed = true;
        const lock = challengeLock();
        if (lock) {
          notify(`🔒 “${sp.title}” is live, but your challenge lock holds the pace`);
        } else if (!sessionInProgress()) {
          state.mode = "focus";
          state.time = sp.durationSec;
          state.sessionDuration = sp.durationSec;
          state.sprintSession = sp.id;
          startTimer();
          persist();
          updateTimerDom();
          renderMiniTimer();
          notify(`${sicon("bolt")} Sprint live — ${Math.round(sp.durationSec / 60)} min focus started`);
        } else {
          notify(sicon("bolt") + " Your sprint started — finish this session first");
        }
      }
      if (now >= end && !sp.result) {
        if (state.running && state.mode === "focus" && !state.sprintSession) {
          state.sprintSession = sp.id;
        } else if (state.sprintSession === sp.id) {
          state.sprintSession = null;
          sp.result = { status: "dnf", at: now };
        } else {
          sp.result = { status: "missed", at: now };
        }
        changed = true;
      }
    });
    // Rivals log sessions while you watch — the leaderboard breathes.
    const wk = weekKey(new Date());
    let raceNews = false;
    (state.challenges || []).forEach((c) => {
      if (c.weekKey !== wk || c.done || !c.joined) return;
      if (Math.random() < 0.012) {
        mateChallengeSession(c, true);
        raceNews = true;
      }
    });
    // Session invites get answered while you watch.
    (state.events || []).forEach((e) => {
      if (!e || e.at < Date.now() || !(e.invites || []).some((i) => i.status === "pending")) return;
      if (Math.random() < 0.02 && resolveOneEventInvite(e)) raceNews = true;
    });
    if (raceNews) {
      if (!userIsBusy() && state.tab === "community" && state.subtab === "sprints") {
        persist();
        renderCommunity();
        return;
      }
      changed = true;
    }
    if (changed) persist();
    // Live-patch crew bars + countdowns so the board feels alive without
    // wiping whatever the user is typing in the create form.
    $$("[data-crew-fill]").forEach((el) => {
      const [sid, ci] = (el.dataset.crewFill || "").split(":");
      const sp = (state.sprints || []).find((x) => x.id === sid);
      const crew = sp ? sprintCrewWithMe(sp) : null;
      const member = crew?.[Number(ci)];
      if (!member) return;
      el.style.width = `${Math.min(100, Math.max(2, member.pct || 0))}%`;
      el.classList.toggle("live", Boolean(member.live && (member.left ?? 0) > 0));
      const tag = document.querySelector(`[data-crew-tag="${sid}:${ci}"]`);
      if (tag) {
        const done = (member.left ?? 0) === 0;
        tag.classList.toggle("live", !done);
        tag.innerHTML = done ? sicon("check") + " done" : `${member.left} sprint${member.left === 1 ? "" : "s"} left`;
      }
    });
    $$("[data-mission-cd]").forEach((el) => {
      const sp = (state.sprints || []).find((x) => x.id === el.dataset.missionCd);
      if (!sp) return;
      const t = Date.now();
      el.textContent =
        t < sp.startsAt
          ? "starts " + new Date(sp.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : t < sp.startsAt + sp.durationSec * 1000
            ? "● LIVE " + fmtCountdown(sp.startsAt + sp.durationSec * 1000 - t)
            : "ended";
    });
    $$("[data-sprint-cd]").forEach((el) => {
      const sp = (state.sprints || []).find(
        (x) => x.id === el.dataset.sprintCd,
      );
      if (!sp) return;
      const t = Date.now();
      el.textContent =
        t < sp.startsAt
          ? "starts in " + fmtCountdown(sp.startsAt - t)
          : t < sp.startsAt + sp.durationSec * 1000
            ? "● LIVE " + fmtCountdown(sp.startsAt + sp.durationSec * 1000 - t)
            : "ended";
    });
  }, 1000);
}

// Total unread across conversations — drives the Messages subtab badge.
// Only counts chats that still resolve to a joined group or a live friend —
// after leaving a group or unfriending, old histories stay on disk (the chat
// view needs them) but must never bleed into the unread badge.
function totalUnreadCount() {
  const joinedGroups = new Set(
    allGroups().filter((g) => get("sf-joined", []).includes(g.id)).map((g) => g.id),
  );
  const friendIds = new Set([
    ...(state.friends || []).map((f) => f.id),
    ...cloudFriends.filter((f) => !cloudBlocked.has(f.id)).map((f) => f.id),
  ]);
  let sum = 0;
  for (const chatId of Object.keys(state.messages || {})) {
    if (!joinedGroups.has(chatId) && !friendIds.has(chatId)) continue;
    sum += unreadCount(chatId);
  }
  return sum;
}

function paintMessagesBadge(count) {
  const btn = document.querySelector('[data-subtab="messages"]');
  if (!btn) return;
  const label = "Messages";
  const badge = count ? ` <span class="subnav-badge" data-msgs-unread>${count > 99 ? "99+" : count}</span>` : "";
  const current = btn.querySelector("[data-msgs-unread]");
  if (current) current.remove();
  btn.innerHTML = label + badge;
}
// Story strip on the Messages tab: friend rings with live seen-state.
function messagesStoryStrip() {
  if (!signedIn()) return "";
  const groups = friendsWithStories();
  if (!groups.length) return "";
  return `<div class="msg-story-strip">${groups
    .map((g) => friendStatusRing(g.author.id, g.author.handle, g.author.name, g.items))
    .join("")}</div>`;
}
// Open one author's grouped stories in the cloud viewer.
function bindFriendStoryRings(root) {
  $$('[data-friend-stories]', root).forEach((b) => (b.onclick = () => {
    const userId = b.dataset.friendStories;
    // Friends-only statuses: a friendship removed since render must not
    // open a stale ring.
    if (!cloudFriends.some((f) => f.id === userId)) return;
    const hit = cloudStories.find((s) => s.userId === userId);
    if (!hit) return;
    const items = cloudStories
      .filter((s) => s.userId === hit.userId)
      .sort((a, b2) => new Date(a.createdAt) - new Date(b2.createdAt));
    openStoryViewer(items, Math.max(0, items.findIndex((s) => !isSeen("cstory:" + s.id))));
  }));
}

function renderCommunity() {
  clearSprintTicker();
  // Immersive messaging: while a conversation is open, the community page
  // drops its own heading, subtabs and spacing so the chat owns the screen
  // (WhatsApp behaviour). The back chip / Esc returns everything.
  const immersive = state.tab === "community" && state.subtab === "messages" && Boolean(state.activeChat);
  const t = $("#tab-community");
  t.classList.toggle("immersive-chat", immersive);
  t.innerHTML = `${immersive ? "" : viewHead("Community", "Find people who are learning what you are learning, make a group, and keep the conversation moving.")}${immersive ? "" : `<div class="subnav">${[
    ["discover", "Discover"],
    ["status", "Status"],
    ["mygroups", "My groups"],
    ["friends", "Friends"],
    ["messages", "Messages"],
    ["notifications", `Notifications${cloudNotifCount ? ` (${cloudNotifCount})` : ""}`],
    ["sprints", "Sprints"],
  ]
    .map(
      (x) =>
        `<button type="button" data-subtab="${x[0]}" class="${state.subtab === x[0] ? "active" : ""}">${x[1]}</button>`,
    )
    .join("")}</div>`}<div id="community-body"></div>`;
  $$("[data-subtab]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const leaving = state.subtab === "discover" || state.subtab === "status";
        if (leaving && b.dataset.subtab !== "discover" && b.dataset.subtab !== "status") clearCloudStoryPhoto();
        state.subtab = b.dataset.subtab;
        state.activeChat = null;
        renderCommunity();
      }),
  );
  paintMessagesBadge(totalUnreadCount());
  const body = $("#community-body", t);
  const panels = {
    discover: renderDiscover,
    status: renderStatus,
    mygroups: renderMyGroups,
    friends: renderFriends,
    messages: renderMessages,
    notifications: renderNotifications,
    sprints: renderSprints,
  };
  if (!panels[state.subtab]) state.subtab = "discover";
  panels[state.subtab](body);
  paintGroupAvatars(body);
  paintStoryThumbs(body);
  if (state.subtab === "sprints") ensureSprintTicker();
  // Refresh the shared public group list in the background; repaint only when
  // it actually changed AND the user isn't mid-action (an open menu or half-
  // typed draft outlives the repaint — the next render picks the data up).
  const seenCloudAt = cloudGroupsAt;
  refreshCloudGroups(false).then(() => {
    // The status pill always reflects the freshest probe, even when the
    // group list itself didn't change (or the user is mid-action).
    paintBackendStatus();
    if (cloudGroupsAt === seenCloudAt || !cloudGroups.length) return;
    if (state.tab === "community" && !userIsBusy()) renderCommunity();
  }).catch(() => {});
  // Social caches + notification badge refresh silently; repaint only the badge.
  if (signedIn()) {
    refreshCloudSocial(false).then(() => paintBackendPill("friends")).catch(() => {});
    refreshCloudNotifCount(false).then((n) => {
      if (!n) return;
      const btn = t.querySelector('[data-subtab="notifications"]');
      if (btn && !btn.textContent.includes("(")) btn.textContent = `Notifications (${n})`;
    }).catch(() => {});
  }
}

function groupMatches(group) {
  const interests = (state.profile.subjects || [])
    .map((s) => String(s || "").toLowerCase().trim())
    .filter(Boolean);
  if (!interests.length) return null;
  const haystack =
    `${group.name} ${(group.tags || []).join(" ")} ${group.description || ""}`.toLowerCase();
  const hits = interests.filter(
    (interest) =>
      haystack.includes(interest) ||
      interest
        .split(/\s+/)
        .some((word) => word.length > 2 && haystack.includes(word)),
  );
  return hits.length ? hits : null;
}

function groupCardWithReason(g, hits) {
  return groupCard(g).replace(
    '<div class="group-top">',
    `<div class="match-reason">${sicon("sparkle")} Matches your interest in ${esc(hits.slice(0, 2).join(", "))}</div><div class="group-top">`,
  );
}

function renderSprints(body) {
  // Sprints/challenges are device-only — the pill says so honestly instead
  // of pretending to report backend health there is no dependency to probe.
  body.innerHTML = `<div class="backend-pill-row"><button type="button" class="backend-pill local" data-backend-status="sprints" title="Sprints and challenges live entirely on this device — nothing to fetch." aria-label="Sprints are stored locally"><i></i><span>Local data</span></button></div>${leaderboardMarkup()}${sprintBoardMarkup()}${challengeMarkup()}${eventMarkup()}`;
  paintBackendPill("sprints", body);
  bindSprints(body);
}

function leaderboardMarkup() {
  const days = [];
  const now = new Date();
  const mondayOff = (now.getDay() + 6) % 7;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - mondayOff + i);
    const key = dayKey(d);
    days.push({
      label: ["M", "T", "W", "T", "F", "S", "S"][i],
      min: (state.focusDays || {})[key] || 0,
      today: key === dayKey(now),
    });
  }
  const total = days.reduce((n, d) => n + d.min, 0);
  const best = Math.max(...days.map((d) => d.min), 0);
  const prevWk = weekKey(new Date(Date.now() - 7 * 86400000));
  const delta = total - weekMinutes(prevWk);
  const max = Math.max(best, 1);
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>This week's focus</h2><span class="tag">${total} min</span></div><div class="week-bars">${days.map((d) => `<div class="week-bar${d.today ? " today" : ""}" title="${d.min} min"><span style="height:${Math.round((d.min / max) * 100)}%"></span><small>${d.label}</small></div>`).join("")}</div><p class="muted" style="margin-top:10px">Best day ${best} min · ${delta >= 0 ? `+${delta}` : delta} min vs last week</p><div class="section-row" style="margin-top:12px"><h3>Global board</h3></div><p class="muted">${backendConfigured && state.user ? "Season board syncs with cloud accounts — invite friends from the Friends tab to race you." : sicon("globe") + " The global board unlocks with cloud accounts. Your week already counts — invite friends to race you."}</p><button type="button" class="ghost" data-invite-race>Copy race invite</button></div>`;
}

function sprintGroupName(sp) {
  const g = allGroups().find((x) => x.id === sp.groupId);
  return g ? g.name : "Open room";
}

/* ---------- sprint rooms pro: purpose, friends-only invites, crew pace ---------- */
const SPRINT_PEER_NAMES = ["Maya", "Leo", "Ava", "Noah", "Zoe", "Eli", "Ivy", "Max", "Ada", "Sam"];

function mySprintId() {
  return chatKey();
}

function makeCrewPeer(name) {
  const total = 3 + Math.floor(Math.random() * 4); // 3–6 sprints in the relay
  const left = Math.max(0, Math.min(total, Math.floor(Math.random() * (total + 1))));
  return {
    id: "peer-" + uid(),
    name,
    total,
    left,
    pct: left === 0 ? 100 : 5 + Math.floor(Math.random() * 90),
    live: Math.random() < 0.6,
  };
}

function sanitizeSprint(sp) {
  if (!sp || typeof sp !== "object") return sp;
  if (sp.purpose == null) sp.purpose = "";
  if (!sp.visibility) sp.visibility = "open";
  if (!sp.ownerId) sp.ownerId = "";
  if (!Array.isArray(sp.invites)) sp.invites = [];
  if (!Array.isArray(sp.roster)) {
    // Legacy rooms get a simulated crew so the pace board never looks empty.
    const peers = [...SPRINT_PEER_NAMES].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
    sp.roster = peers.map(makeCrewPeer);
  }
  sp.invites = sp.invites.map((inv) =>
    typeof inv === "string" ? { id: "inv-" + uid(), username: inv, status: "pending" } : inv,
  );
  return sp;
}

function ensureSprintFields() {
  if (!Array.isArray(state.sprints)) state.sprints = [];
  state.sprints.forEach(sanitizeSprint);
  if (!Array.isArray(state.sprintInvites)) state.sprintInvites = [];
  // Invites only ever appear here when a real friend sends one — no demo data.
  // Purge demo invites left over from earlier versions.
  const hadDemo = state.sprintInvites.some((i) => i && i.demo);
  state.sprintInvites = state.sprintInvites.filter((i) => i && !i.demo);
  if (hadDemo) persist();
}

function isSprintOwner(sp) {
  if (!sp) return false;
  if (!sp.ownerId) return true; // legacy rooms: anyone may manage them
  return sp.ownerId === mySprintId();
}

function sprintCrewWithMe(sp) {
  const crew = [...(sp.roster || [])];
  const mine = crew.find((c) => c.you);
  if (!mine) {
    crew.unshift({
      id: "me",
      name: "You",
      you: true,
      total: sp.roster?.[0]?.total || 4,
      left: sp.result ? 0 : sp.roster?.[0]?.left ?? 4,
      pct: sp.result?.status === "done" ? 100 : sessionInProgress() && state.sprintSession === sp.id ? 62 : 12,
      live: Boolean(state.sprintSession === sp.id || (state.running && state.mode === "focus")),
    });
  } else {
    mine.live = Boolean(state.sprintSession === sp.id || (state.running && state.mode === "focus"));
    if (sp.result?.status === "done") {
      mine.left = 0;
      mine.pct = 100;
    }
  }
  return crew;
}

function crewPaceMarkup(sp) {
  const crew = sprintCrewWithMe(sp);
  return `<div class="crew-pace"><div class="crew-head"><span>${sicon("users")} Crew pace</span><span class="muted">${crew.filter((c) => (c.left ?? 0) === 0).length}/${crew.length} done</span></div>${crew.map((c, ci) => {
    const done = (c.left ?? 0) === 0;
    return `<div class="crew-row${c.you ? " me" : ""}"><span class="crew-avatar">${esc((c.name || "?")[0].toUpperCase())}</span><div class="crew-meta"><div class="crew-line"><strong>${esc(c.name)}${c.you ? " · you" : ""}</strong><span class="tag ${done ? "" : "live"}" data-crew-tag="${sp.id}:${ci}">${done ? sicon("check") + " done" : `${c.left} sprint${c.left === 1 ? "" : "s"} left`}</span></div><div class="crew-track"><span class="crew-fill${c.live && !done ? " live" : ""}" data-crew-fill="${sp.id}:${ci}" style="width:${Math.min(100, Math.max(2, c.pct || 0))}%"></span></div></div>${c.live && !done ? '<span class="crew-dot" title="Focusing now"></span>' : ""}</div>`;
  }).join("")}</div>`;
}

function inviteInboxMarkup() {
  ensureSprintFields();
  const pending = state.sprintInvites.filter((i) => i.status === "pending");
  const decided = state.sprintInvites.filter((i) => i.status !== "pending").slice(-3).reverse();
  if (!pending.length && !decided.length) return "";
  return `<div class="card invite-inbox"><div class="section-row"><h2>${sicon("gift")} Sprint invites</h2><span class="tag">${pending.length} pending</span></div>${pending.map((inv) => `<div class="invite-card"><div class="invite-glow"></div><div><strong>${esc(inv.title)}</strong><br><small class="muted">from <b>@${esc(inv.from || "a friend")}</b> · ${inv.durationMin || 25} min · starts ${new Date(inv.startsAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>${inv.purpose ? `<p class="purpose">“${esc(inv.purpose)}”</p>` : ""}</div><div class="invite-actions"><button type="button" class="primary" data-inv-accept="${inv.id}">Join sprint</button><button type="button" class="ghost" data-inv-decline="${inv.id}">Decline</button></div></div>`).join("")}${decided.map((inv) => `<div class="board-row"><span>${esc(inv.title)} · @${esc(inv.from || "?")}</span><span class="tag">${inv.status === "accepted" ? sicon("check") + " joined" : "declined"}</span></div>`).join("")}</div>`;
}

function sprintBoardMarkup() {
  ensureSprintFields();
  const now = Date.now();
  const rooms = state.sprints || [];
  const active = rooms.filter(
    (s) => !s.result && s.startsAt + s.durationSec * 1000 > now - 60000,
  );
  const past = rooms
    .filter((s) => s.result || s.startsAt + s.durationSec * 1000 <= now - 60000)
    .slice(-5)
    .reverse();
  const groups = allGroups().filter((g) =>
    get("sf-joined", []).includes(g.id),
  );
  const friends = state.friends || [];
  return `${inviteInboxMarkup()}<div class="card sprint-pro" style="margin-bottom:18px"><div class="section-row"><h2>${sicon("bolt")} Sprint rooms</h2><span class="tag">together</span></div>${active.length ? active.map((sp) => {
    const live = now >= sp.startsAt;
    const inSession = state.sprintSession === sp.id || (state.running && state.mode === "focus");
    const owner = isSprintOwner(sp);
    const pend = (sp.invites || []).filter((i) => i.status === "pending").length;
    const acc = (sp.invites || []).filter((i) => i.status === "accepted").length;
    const dec = (sp.invites || []).filter((i) => i.status === "declined").length;
    const inviteLine = sp.visibility === "friends"
      ? `<span class="tag lock">${sicon("lock")} friends-only${pend ? ` · ${pend} pending` : ""}${acc ? ` · ${acc} in` : ""}${dec ? ` · ${dec} out` : ""}</span>`
      : `<span class="tag">${sicon("globe")} open room${(sp.roster || []).length ? ` · ${(sp.roster || []).length + 1} racing` : ""}</span>`;
    return `<div class="sprint-room pro${live ? " live" : ""}"><div class="sprint-beam"></div><div class="section-row"><strong>${esc(sp.title)}</strong><span style="display:flex;gap:6px;flex-wrap:wrap"><span class="tag ${live ? "live" : ""}" data-sprint-cd="${sp.id}">${live ? "● LIVE" : "scheduled"}</span>${inviteLine}</span></div><p class="muted">${esc(sprintGroupName(sp))} · ${Math.round(sp.durationSec / 60)} min${sp.joined ? " · you're in" : ""}</p>${sp.purpose ? `<p class="purpose">“${esc(sp.purpose)}”</p>` : ""}${sp.joined || sp.visibility === "open" ? crewPaceMarkup(sp) : '<p class="muted">Join to see the crew pace board.</p>'}${(sp.invites || []).length ? `<div class="invite-chips">${sp.invites.map((i) => `<span class="invite-chip ${i.status}">@${esc(i.username)} · ${i.status === "accepted" ? "joined " + sicon("check") : i.status === "declined" ? "passed" : "invited…"}</span>`).join("")}</div>` : ""}<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${sp.joined ? `${live && !inSession ? `<button type="button" class="primary" data-sprint-late="${sp.id}">Join late</button><button type="button" class="ghost" data-sprint-leave="${sp.id}">Leave</button>` : ""}${live && inSession ? '<span class="tag live">you\'re focusing ' + sicon("fire") + '</span>' : ""}${!live ? `<button type="button" class="primary" data-sprint-now="${sp.id}">Start now</button><button type="button" class="ghost" data-sprint-leave="${sp.id}">Leave</button>` : ""}` : `<button type="button" class="primary" data-sprint-join="${sp.id}">Join sprint</button>`}${owner ? `<button type="button" class="ghost" data-sprint-edit="${sp.id}">Rename / purpose</button><button type="button" class="ghost" data-sprint-nudge="${sp.id}" title="Simulate a friend replying right now">Nudge replies</button><button type="button" class="delete" data-sprint-del="${sp.id}" title="Delete room">Delete</button>` : ""}</div></div>`;
  }).join("") : '<p class="muted">No live rooms. Start one below — shared suffering bonds people.</p>'}${past.length ? `<div class="section-row" style="margin-top:14px"><h3>Finish board</h3></div>${past.map((sp) => `<div class="board-row"><span>${esc(sp.title)}</span><span class="tag">${sp.result?.status === "done" ? `${sicon("check")} ${sp.result.focusedMin}m focused` : sp.result?.status === "dnf" ? "DNF" : "missed"}</span></div>`).join("")}` : ""}<div class="section-row" style="margin-top:16px"><h3>New sprint</h3><span class="tag">pro</span></div><div class="grid two"><input class="input" id="sprint-title" placeholder="Sprint title, e.g. Morning grind"><select class="select" id="sprint-group"><option value="">No group</option>${groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select><select class="select" id="sprint-dur"><option value="15">15 minutes</option><option value="25" selected>25 minutes</option><option value="30">30 minutes</option><option value="50">50 minutes</option></select><select class="select" id="sprint-in"><option value="2">Starts in 2 min</option><option value="5" selected>Starts in 5 min</option><option value="10">Starts in 10 min</option><option value="15">Starts in 15 min</option><option value="30">Starts in 30 min</option></select></div><textarea class="textarea autogrow" id="sprint-purpose" rows="2" placeholder="Purpose — why does this room exist? (shown to everyone)" style="margin-top:10px"></textarea><div style="margin-top:10px;position:relative"><select class="select" id="sprint-vis" style="width:100%" aria-label="Room visibility"><option value="open">Open — anyone can join</option><option value="friends">Friends — only people I pick</option></select><span class="fp-chip" id="sprint-picked" hidden></span><button type="button" class="ghost" id="sprint-friends-go" type="button" style="margin-top:8px;width:100%">👥 Choose friends — pick your crew</button></div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" class="primary" id="sprint-create">Create sprint room</button></div></div>`;
}

function challengeRow(c) {
  sanitizeChallenge(c);
  const pct = Math.min(100, Math.round((c.progress / Math.max(1, c.target)) * 100));
  const g = allGroups().find((x) => x.id === c.groupId);
  const board = [...(c.members || [])].sort(
    (a, b) => challengeScore(c, b) - challengeScore(c, a) || (b.minutes || 0) - (a.minutes || 0),
  );
  const top = Math.max(1, challengeScore(c, board[0] || { sessions: 0, minutes: 0 }));
  const locked = state.activeChallengeId === c.id && !c.done;
  const otherLock = !locked && !c.done && !c.joined && otherActiveChallenge(c.id);
  const medals = ["👑", "🥈", "🥉"];
  return `<div class="challenge pro"><div class="section-row"><strong>${esc(c.title)}</strong><span style="display:flex;gap:6px;flex-wrap:wrap"><span class="tag pace-tag">⚡ ${fmtPace(c)}/session</span>${c.done ? `<span class="tag">done ${sicon("party")}</span>` : locked ? `<span class="tag live">🔒 locked in</span>` : `<span class="tag">${c.progress}/${c.target} ${c.unit}</span>`}</span></div><div class="complete-track"><span class="complete-fill" style="width:${pct}%"></span></div><small class="muted">${esc(g?.name || "Open challenge")}${c.ownerId && c.ownerId === chatKey() ? " · you host" : ""}</small>${c.done && c.winner ? `<p class="crown-line">👑 <b>@${esc(c.winner)}</b> takes the crown</p>` : ""}<div class="board-lead"><div class="crew-head"><span>${sicon("trophy")} Leaderboard</span><span class="muted">${board.length} racing</span></div>${board.slice(0, 5).map((m, i) => {
    const sc = challengeScore(c, m);
    return `<div class="lead-row${i === 0 ? " top" : ""}${m.you ? " me" : ""}"><span class="lead-rank">${medals[i] || `#${i + 1}`}</span><span class="crew-avatar sm">${esc((m.name || "?")[0].toUpperCase())}</span><div class="crew-meta"><div class="crew-line"><strong>${esc(m.name)}${m.you ? " · you" : ""}</strong><span class="muted">${m.sessions || 0} sess · ${m.minutes || 0}m</span></div><div class="crew-track"><span class="crew-fill${i === 0 && !c.done ? " live" : ""}" style="width:${Math.min(100, Math.max(3, Math.round((sc / top) * 100)))}%"></span></div></div></div>`;
  }).join("")}</div>${!c.done ? `<div class="ch-actions">${c.joined ? `<button type="button" class="ghost" data-ch-leave="${c.id}">Leave challenge</button>` : `<button type="button" class="primary" data-ch-join="${c.id}"${otherLock ? " disabled title=\"Finish or leave your current challenge first\"" : ""} style="padding:8px 14px;font-size:12px">Join · locks timer to ${fmtPace(c)}</button>`}${!c.ownerId || c.ownerId === chatKey() ? `<button type="button" class="delete" data-ch-del="${c.id}" title="Delete challenge">Delete</button>` : ""}</div>` : `${!c.ownerId || c.ownerId === chatKey() ? `<div class="ch-actions"><button type="button" class="ghost" data-ch-del="${c.id}">Clear from board</button></div>` : ""}`}</div>`;
}

function challengeMarkup() {
  ensureChallengeFields();
  const wk = weekKey(new Date());
  const list = (state.challenges || []).filter((c) => c.weekKey === wk);
  const groups = allGroups().filter((g) =>
    get("sf-joined", []).includes(g.id),
  );
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Group challenges</h2><span class="tag">this week</span></div>${list.map(challengeRow).join("") || '<p class="muted">No active challenges — launch the first one.</p>'}<div class="section-row" style="margin-top:14px"><h3>New challenge</h3><span class="tag">you host</span></div><div class="grid two"><input class="input" id="ch-title" placeholder="e.g. 10 focus sessions"><select class="select" id="ch-group">${groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("") || '<option value="">No joined groups yet</option>'}</select><div class="input-row" style="margin:0"><input class="input" id="ch-target" type="number" min="1" max="500" value="10" aria-label="Target"><select class="select" id="ch-unit" aria-label="Unit"><option value="sessions">sessions</option><option value="minutes">minutes</option></select></div><div class="input-row" style="margin:0" title="Session length for this challenge"><input class="input" id="ch-min" type="number" min="0" max="180" value="25" aria-label="Minutes per session"><span class="muted">min</span><input class="input" id="ch-sec" type="number" min="0" max="59" value="0" aria-label="Seconds per session"><span class="muted">sec</span></div></div><div><button type="button" class="primary" id="ch-create">Launch</button></div></div>`;
}

function eventWhen(e) {
  return new Date(e.at).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventMarkup() {
  ensureEventFields();
  const now = Date.now();
  const upcoming = (state.events || [])
    .filter((e) => e.at + e.durationMin * 60000 > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, 6);
  const groups = allGroups().filter((g) =>
    get("sf-joined", []).includes(g.id),
  );
  return `${eventInboxMarkup()}<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Scheduled sessions</h2><span class="tag">commit</span></div>${upcoming.length ? upcoming.map((e) => {
    const live = now >= e.at && now < e.at + e.durationMin * 60000;
    const g = allGroups().find((x) => x.id === e.groupId);
    const owner = isEventOwner(e);
    const pend = (e.invites || []).filter((i) => i.status === "pending").length;
    const going = (e.invites || []).filter((i) => i.status === "accepted").length + (e.mine ? 1 : 0);
    return `<div class="event-row pro"><div><strong>${sicon("calendar")} ${esc(e.title)}</strong><br><small class="muted">${eventWhen(e)} · ${e.durationMin} min${g ? ` · ${esc(g.name)}` : ""}${e.visibility === "friends" ? ` · ${sicon("lock")} friends` : ""} · ${going} going</small>${(e.invites || []).length ? `<div class="invite-chips">${e.invites.map((i) => `<span class="invite-chip ${i.status}">@${esc(i.username)} · ${i.status === "accepted" ? "in " + sicon("check") : i.status === "declined" ? "out" : "invited…"}</span>`).join("")}</div>` : ""}</div><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${live ? `<span class="tag">● LIVE</span><button type="button" class="primary" data-event-start="${e.id}" style="padding:8px 12px;font-size:12px">Start</button>` : ""}<button type="button" class="${e.mine ? "ghost" : "primary"}" data-event-rsvp="${e.id}" style="padding:8px 12px;font-size:12px">${e.mine ? "Going " + sicon("check") : "RSVP"}</button>${owner ? `${pend ? `<button type="button" class="ghost" data-event-nudge="${e.id}" style="padding:8px 12px;font-size:12px" title="Simulate a friend replying now">Nudge</button>` : ""}<button type="button" class="delete" data-event-del="${e.id}" title="Remove">×</button>` : ""}</div></div>`;
  }).join("") : '<p class="muted">Nothing scheduled. Put study on the calendar and show up.</p>'}<div class="section-row" style="margin-top:14px"><h3>New session</h3><span class="tag">you host</span></div><div class="grid two"><input class="input" id="ev-title" placeholder="e.g. Calc sprint"><select class="select" id="ev-aud" aria-label="Who is this for"><option value="self">Just me</option><option value="group">A group</option><option value="friends">Specific friends</option></select><select class="select" id="ev-group" aria-label="Which group"><option value="">No group</option>${groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select><label class="field-label ev-datetime-label">${sicon("calendar")} Date & time<input class="input" id="ev-at" type="datetime-local" aria-label="Date and time"></label><select class="select" id="ev-dur"><option value="15">15 min</option><option value="25" selected>25 min</option><option value="30">30 min</option><option value="50">50 min</option><option value="60">60 min</option><option value="90">90 min</option></select></div><p class="muted" style="margin:8px 0 0">Friends get an invite they can accept or decline — replies land here and on your Focus desk.</p><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center"><button type="button" class="primary" id="ev-create">Schedule</button><button type="button" class="ghost" id="ev-crew-toggle" type="button">👥 Choose friends — pick your crew</button><span class="fp-chip" id="ev-picked" hidden></span></div></div></div>`;
}

/* ---------- scheduled sessions pro: friends invites, host controls ---------- */
function isEventOwner(e) {
  if (!e) return false;
  if (!e.ownerId) return true; // legacy sessions: anyone may manage them
  return e.ownerId === mySprintId();
}

function ensureEventFields() {
  if (!Array.isArray(state.events)) state.events = [];
  if (!Array.isArray(state.eventInvites)) state.eventInvites = [];
  const now = Date.now();
  // Sessions over a week cold leave the plan — the list stays a plan, not an archive.
  const fresh = state.events.filter((e) => e && e.at + (e.durationMin || 25) * 60000 > now - 7 * 86400000);
  if (fresh.length !== state.events.length) {
    state.events = fresh;
    persist();
  }
  state.events.forEach((e) => {
    if (!e.ownerId) e.ownerId = "";
    if (!e.visibility) e.visibility = e.groupId ? "open" : "self";
    if (!Array.isArray(e.invites)) e.invites = [];
  });
  // Session invites appear only when someone actually invites you —
  // demo invites made the inbox look busy with fake friends.
  // Purge any demo invites left over from earlier versions.
  const hadDemo = state.eventInvites.some((i) => i && i.demo);
  state.eventInvites = state.eventInvites.filter((i) => i && !i.demo);
  if (hadDemo) persist();
}

function eventInboxMarkup() {
  const pending = (state.eventInvites || []).filter((i) => i.status === "pending");
  const decided = (state.eventInvites || []).filter((i) => i.status !== "pending").slice(-3).reverse();
  if (!pending.length && !decided.length) return "";
  return `<div class="card invite-inbox"><div class="section-row"><h2>${sicon("calendar")} Session invites</h2><span class="tag">${pending.length} pending</span></div>${pending.map((inv) => `<div class="invite-card"><div class="invite-glow"></div><div><strong>${esc(inv.title)}</strong><br><small class="muted">from <b>@${esc(inv.from || "a friend")}</b> · ${new Date(inv.at || Date.now()).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} · ${inv.durationMin || 25} min</small>${inv.purpose ? `<p class="purpose">“${esc(inv.purpose)}”</p>` : ""}</div><div class="invite-actions"><button type="button" class="primary" data-ev-inv-accept="${inv.id}">RSVP yes</button><button type="button" class="ghost" data-ev-inv-decline="${inv.id}">Decline</button></div></div>`).join("")}${decided.map((inv) => `<div class="board-row"><span>${esc(inv.title)} · @${esc(inv.from || "?")}</span><span class="tag">${inv.status === "accepted" ? sicon("check") + " going" : "declined"}</span></div>`).join("")}</div>`;
}

function resolveOneEventInvite(e, force) {
  const pend = (e.invites || []).find((i) => i.status === "pending");
  if (!pend) return false;
  pend.status = force || Math.random() < 0.68 ? "accepted" : "declined";
  if (pend.status === "accepted")
    addNotification("Session invite accepted", `@${pend.username} is going to “${e.title}”.`, "calendar");
  return true;
}

function postGroupMessage(groupId, text, icon, from) {
  if (!groupId) return;
  state.messages[groupId] = [
    ...(state.messages[groupId] || []),
    { id: uid(), me: !from, sysName: from || "", icon: icon || "", text: cleanText(text), ts: Date.now() },
  ];
}

// System posts used to embed sicon() SVG straight into the message text, and
// chat renders text with esc() — so rooms showed raw "<svg ...>" markup.
// Icons now travel in their own field; this also heals messages already saved
// with the old flaw.
function cleanText(value) {
  return stripIcon(value);
}

function resolveOneInvite(sp, force) {
  const pend = (sp.invites || []).find((i) => i.status === "pending");
  if (!pend) return false;
  const accept = force || Math.random() < 0.68;
  pend.status = accept ? "accepted" : "declined";
  if (accept) {
    const crew = sp.roster || (sp.roster = []);
    if (!crew.some((c) => c.id === pend.friendId))
      crew.push({ id: pend.friendId || "peer-" + uid(), name: pend.username || "Friend", total: 4, left: 4, pct: 6, live: false });
    addNotification("Sprint invite accepted", `@${pend.username} joined “${sp.title}”.`, "bolt");
  }
  return true;
}

/* ---------- real invite delivery between users (cloud DMs) ---------- */
// Sprint and session invites used to live only in the sender's localStorage —
// the recipient never received anything. Invites now ride the existing DM
// pipeline as text messages carrying a structured `invite` in the row's
// metadata: they arrive through the same realtime subscription and history
// load as every other message, so no new backend surface is needed.

// Serialized uuids a real user can be reached at (cloud connections and
// locally-added friends resolved to cloud accounts).
function inviteRecipients(ids) {
  return (ids || []).filter((id) => signedIn() && isUuid(id) && id !== state.user?.id);
}

function inviteMessageRow(inv, prefix) {
  const isSprint = prefix === "sprint";
  const when = inv.startsAt || inv.at;
  const text = isSprint
    ? `Sprint invite — “${inv.title}” · ${Math.round((inv.durationSec || 1500) / 60)} min · ${new Date(when || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Open Community → Sprints to join.`
    : `Study session invite — “${inv.title}” · ${new Date(when || Date.now()).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} · ${inv.durationMin || 25} min. Open Community → Sprints to RSVP.`;
  return {
    sender_id: state.user.id,
    group_id: null,
    recipient_id: inv.toId,
    text,
    kind: "text",
    metadata: {
      invite: {
        t: prefix, // "sprint" | "session"
        id: inv.refId,
        title: inv.title,
        purpose: inv.purpose || "",
        at: when,
        durationSec: inv.durationSec || (inv.durationMin || 25) * 60,
      },
    },
  };
}

async function sendInviteDms(prefix, inv, toIds) {
  if (!signedIn()) return;
  const targets = inviteRecipients(toIds);
  for (const toId of targets) {
    await pushInviteDm(inviteMessageRow({ ...inv, toId }, prefix));
  }
  if (targets.length) persist();
}

// Stash the DM locally, send through the cloud, paint the status chip.
async function pushInviteDm(payload) {
  const local = {
    id: uid(),
    me: true,
    text: payload.text,
    ts: Date.now(),
    deliveryStatus: "sent",
  };
  state.messages[payload.recipient_id] = [...(state.messages[payload.recipient_id] || []), local];
  try {
    const { error } = await sendCloudMessage(payload);
    if (!error) state.messageStatus[local.id] = "delivered";
  } catch { /* local copy stands */ }
  persist();
}

// Tell the host their invite was answered (real reply, not the simulated
// ticker). Travels as a reply DM with structured metadata.
async function sendInviteReplyDm(inv, status) {
  if (!signedIn() || !inv?.fromId || !isUuid(inv.fromId) || !inv.refId) return;
  const text = status === "accepted"
    ? `I joined “${inv.title}” — see you at the start.`
    : `I passed on “${inv.title}” this time.`;
  await pushInviteDm({
    sender_id: state.user.id,
    group_id: null,
    recipient_id: inv.fromId,
    text,
    kind: "text",
    metadata: { inviteReply: { t: inv.t || "sprint", id: inv.refId, status } },
  });
}

// Fold an incoming invite DM into the recipient's inbox. Returns true when a
// new invite row was created (dedupe by refId — realtime + history both call
// this, so the same invite must not double up).
function adoptIncomingInvite(inv, fromHandle, fromId) {
  if (!inv || !inv.t || !inv.id || !inv.title) return false;
  const store = inv.t === "sprint" ? "sprintInvites" : "eventInvites";
  if (!Array.isArray(state[store])) state[store] = [];
  if (state[store].some((i) => i.refId === inv.id || (i.sprintId === inv.id && inv.t === "sprint"))) return false;
  state[store].push({
    id: uid(),
    refId: inv.id,
    demo: false,
    status: "pending",
    from: fromHandle || "a friend",
    fromId: fromId || null,
    t: inv.t,
    title: inv.title,
    purpose: inv.purpose || "",
    startsAt: inv.at,
    at: inv.at,
    durationMin: Math.max(1, Math.round((inv.durationSec || 1500) / 60)),
    sprintId: inv.t === "sprint" ? inv.id : undefined,
  });
  state[store] = state[store].slice(-20);
  persist();
  return true;
}

// Host side: a real reply to a sprint/session invite. Updates the room's
// invite chips and crew roster exactly like the simulated replies used to.
function adoptInviteReply(reply, from) {
  if (!reply || !reply.id || !reply.status) return false;
  const who = from?.handle || "a friend";
  if (reply.t === "session") {
    const ev = (state.events || []).find((x) => x.id === reply.id);
    if (!ev) return false;
    const pend = (ev.invites || []).find((i) => i.status === "pending" && i.username === who);
    if (!pend) return false;
    pend.status = reply.status === "accepted" ? "accepted" : "declined";
    if (pend.status === "accepted")
      addNotification("Session invite accepted", `@${who} is going to “${ev.title}”.`, "calendar");
    persist();
    return true;
  }
  const sp = (state.sprints || []).find((x) => x.id === reply.id);
  if (!sp) return false;
  const pend = (sp.invites || []).find((i) => i.status === "pending" && (i.friendId === from?.id || i.username === who));
  if (!pend) return false;
  pend.status = reply.status === "accepted" ? "accepted" : "declined";
  if (pend.status === "accepted") {
    const crew = sp.roster || (sp.roster = []);
    if (!crew.some((c) => c.id === pend.friendId))
      crew.push({ id: pend.friendId || "peer-" + uid(), name: pend.username || who, total: 4, left: 4, pct: 6, live: false });
    addNotification("Sprint invite accepted", `@${who} joined “${sp.title}”.`, "bolt");
  }
  persist();
  return true;
}

// Scan DM rows for structured invite metadata the caches don't know yet.
// Runs on history merge and on every realtime-arriving message.
function harvestInvitesFromRows(rows, resolveFrom) {
  let changed = false;
  for (const r of rows || []) {
    if (!r || r.sender_id === state.user?.id) continue; // never adopt my own sends
    const meta = r.metadata || {};
    const from = resolveFrom ? resolveFrom(r) : null;
    if (meta.invite && adoptIncomingInvite(meta.invite, from?.handle, from?.id)) changed = true;
    if (meta.inviteReply && adoptInviteReply(meta.inviteReply, from)) changed = true;
  }
  return changed;
}

function openSprintEditor(id) {
  const sp = state.sprints.find((x) => x.id === id);
  if (!sp) return notify("That room no longer exists");
  if (!isSprintOwner(sp)) return notify("Only the room creator can rename it");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Sprint room · edit</div><h2>Shape the room</h2><label class="field-label">Room name<input class="input" data-sp-title maxlength="60" value="${esc(sp.title)}"></label><label class="field-label">Purpose — why was this room created?<textarea class="textarea autogrow" data-sp-purpose rows="3" maxlength="280" placeholder="e.g. Finish chapter 4 together before Friday">${esc(sp.purpose || "")}</textarea></label><p class="muted">The purpose shows under the title so everyone knows what they are signing up for.</p><div class="modal-actions"><button type="button" class="ghost" data-sp-cancel>Cancel</button><button type="button" class="primary" data-sp-save>Save room</button></div></div>`;
  $("#modal-root").append(modal);
  const titleInput = modal.querySelector("[data-sp-title]");
  setTimeout(() => { try { titleInput.focus(); titleInput.select(); } catch { /* ignore */ } }, 0);
  const close = () => modal.remove();
  modal.querySelector("[data-sp-cancel]").onclick = close;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  modal.querySelector("[data-sp-save]").onclick = () => {
    const t = titleInput.value.trim();
    if (!t) return notify("Give the room a name");
    sp.title = t.slice(0, 60);
    sp.purpose = modal.querySelector("[data-sp-purpose]").value.trim().slice(0, 280);
    persist();
    close();
    renderCommunity();
    notify("Room updated");
  };
}

/* ---------- Focus Desk live mission (sprints + challenges + scheduled) ---------- */
function missionDeskMarkup() {
  ensureSprintFields();
  const now = Date.now();
  const live = (state.sprints || []).find((s) => s.joined && !s.result && now >= s.startsAt && now < s.startsAt + s.durationSec * 1000);
  const next = (state.sprints || [])
    .filter((s) => s.joined && !s.result && s.startsAt + s.durationSec * 1000 > now && (!live || s.id !== live.id))
    .sort((a, b) => a.startsAt - b.startsAt)[0];
  const focus = live || next;
  const wk = weekKey(new Date());
  const challenges = (state.challenges || []).filter((c) => c.weekKey === wk && !c.done).slice(0, 2);
  const upcomingEv = (state.events || [])
    .filter((e) => e.mine && e.at + e.durationMin * 60000 > now)
    .sort((a, b) => a.at - b.at)[0];
  if (!focus && !challenges.length && !upcomingEv) {
    return `<div class="card mission-desk idle"><div class="mission-top"><span class="mission-eyebrow">${sicon("bolt")} Live mission</span><button type="button" class="ghost" data-mission-goto>Open Sprints</button></div><p class="muted">Nothing racing right now. Launch a sprint room and it will dock here so you never have to hunt for it.</p></div>`;
  }
  const inSession = focus && (state.sprintSession === focus.id || (state.running && state.mode === "focus"));
  return `<div class="card mission-desk${live ? " live" : ""}"><div class="mission-glow"></div><div class="mission-top"><span class="mission-eyebrow"><span class="mission-dot"></span> Live mission · Focus desk</span><button type="button" class="ghost" data-mission-goto>Open Sprints</button></div>${focus ? `<div class="mission-sprint"><div><strong>${esc(focus.title)}</strong><br><small class="muted">${live ? "happening now" : "starts " + new Date(focus.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${Math.round(focus.durationSec / 60)} min${focus.purpose ? ` · ${esc(focus.purpose.slice(0, 80))}${focus.purpose.length > 80 ? "…" : ""}` : ""}</small></div><span class="tag ${live ? "live" : ""}" data-mission-cd="${focus.id}">${live ? "● LIVE" : "scheduled"}</span></div>${focus && live && !inSession ? `<button type="button" class="primary" data-mission-join="${focus.id}">Jump in — start focus</button>` : ""}${focus && live && inSession ? `<span class="tag live">${sicon("fire")} you're racing this one</span>` : ""}` : ""}${challenges.map((c) => {
    const pct = Math.min(100, Math.round((c.progress / Math.max(1, c.target)) * 100));
    const locked = state.activeChallengeId === c.id && !c.done;
    return `<div class="mission-row"><span>${sicon("trophy")} ${locked ? "🔒 " : ""}${esc(c.title)}</span><span class="tag">${c.progress}/${c.target}</span></div><div class="crew-track slim"><span class="crew-fill" style="width:${pct}%"></span></div>`;
  }).join("")}${upcomingEv ? `<div class="mission-row"><span>${sicon("calendar")} ${esc(upcomingEv.title)} · ${new Date(upcomingEv.at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>${Date.now() >= upcomingEv.at ? `<button type="button" class="primary" data-mission-event="${upcomingEv.id}" style="padding:7px 12px;font-size:12px">Start</button>` : '<span class="tag">committed</span>'}</div>` : ""}</div>`;
}

function bindMissionDesk(root) {
  $$("[data-mission-goto]", root).forEach(
    (b) => (b.onclick = () => {
      state.tab = "community";
      state.subtab = "sprints";
      persist();
      shell();
    }),
  );
  $$("[data-mission-join]", root).forEach(
    (b) => (b.onclick = () => {
      const sp = (state.sprints || []).find((x) => x.id === b.dataset.missionJoin);
      if (!sp || sessionInProgress()) return;
      const mjLock = challengeLock();
      if (mjLock) return notify(`Challenge lock holds your timer — leave “${mjLock.title}” first`);
      const remain = Math.max(60, Math.round((sp.startsAt + sp.durationSec * 1000 - Date.now()) / 1000));
      state.mode = "focus";
      state.time = remain;
      state.sessionDuration = remain;
      state.sprintSession = sp.id;
      startTimer();
      persist();
      updateTimerDom();
      shell();
      notify("Locked in — make the crew proud " + sicon("fire"));
    }),
  );
  $$("[data-mission-event]", root).forEach(
    (b) => (b.onclick = () => {
      const e = (state.events || []).find((x) => x.id === b.dataset.missionEvent);
      if (!e || sessionInProgress()) return;
      const meLock = challengeLock();
      if (meLock) return notify(`Challenge lock holds your timer — leave “${meLock.title}” first`);
      state.mode = "focus";
      state.time = e.durationMin * 60;
      state.sessionDuration = e.durationMin * 60;
      startTimer();
      persist();
      updateTimerDom();
      shell();
    }),
  );
}

// Friend picking runs through the styled friends-picker modal — no inline
// dropdowns to manage; the chip simply shows how many friends were chosen.
let sprintPickedIds = [];
let eventPickedIds = [];
function paintPickedChip(chipEl, n) {
  if (!chipEl) return;
  chipEl.hidden = !n;
  chipEl.textContent = n ? `${n} friend${n === 1 ? "" : "s"} selected` : "";
}
function paintCrewBtn(body) {
  paintPickedChip($("#sprint-picked", body), sprintPickedIds.length);
}

function paintEvCrewBtn(body) {
  paintPickedChip($("#ev-picked", body), eventPickedIds.length);
}

function bindSprints(body) {
  $("[data-invite-race]", body)?.addEventListener("click", async () => {
    const text = `🏁 Race me on StudyFlow this week! Add me with @${state.profile.handle} — most focus minutes wins.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "StudyFlow race", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      notify("Race invite copied");
    } catch {
      notify("Invite ready — tell them your username");
    }
  });
  $("#sprint-create", body).onclick = () => {
    if (!requireAuth("host sprint rooms")) return;
    const dur = Math.min(120, Math.max(5, parseInt($("#sprint-dur", body).value, 10) || 25));
    const mins = parseInt($("#sprint-in", body).value, 10) || 5;
    const groupId = $("#sprint-group", body).value || "";
    const title = $("#sprint-title", body).value.trim() || `${dur}-min sprint`;
    const purpose = $("#sprint-purpose", body)?.value.trim().slice(0, 280) || "";
    const visibility = $("#sprint-vis", body)?.value === "friends" ? "friends" : "open";
    const picked = [...new Set([...sprintPickedIds, ...cloudFriends.map((f) => f.id)])].filter((id) => sprintPickedIds.includes(id));
    if (visibility === "friends" && !picked.length)
      return notify("Friends-only? Choose at least one friend first");
    const byId = new Map(friendsPickerSource().map((f) => [f.id, f]));
    const invites = picked.map((id) => ({
      id: "inv-" + uid(),
      friendId: id,
      username: byId.get(id)?.username || "friend",
      status: "pending",
    }));
    const crewSeeds = visibility === "open"
      ? [...SPRINT_PEER_NAMES].sort(() => Math.random() - 0.5).slice(0, 3).map(makeCrewPeer)
      : invites.map((i) => ({ id: i.friendId, name: i.username, total: 4, left: 4, pct: 4, live: false }));
    const sp = sanitizeSprint({
      id: uid(),
      title,
      purpose,
      groupId,
      durationSec: dur * 60,
      startsAt: Date.now() + mins * 60000,
      joined: true,
      liveNotified: false,
      result: null,
      ownerId: mySprintId(),
      visibility,
      invites,
      roster: crewSeeds,
    });
    state.sprints.push(sp);
    if (groupId)
      postGroupMessage(groupId, `Sprint room open: “${title}”${purpose ? ` — ${purpose}` : ""} — ${dur} min, starts in ${mins} min. Join from Community → Sprints.`, "bolt");
    // Real delivery: invited friends receive the sprint as a DM with
    // structured metadata (works for cloud connections with real ids).
    sendInviteDms("sprint", {
      refId: sp.id,
      title,
      purpose,
      startsAt: sp.startsAt,
      durationSec: sp.durationSec,
    }, invites.map((i) => i.friendId)).catch(() => {});
    if (visibility === "friends")
      addNotification("Sprint invites sent", `“${title}” — ${invites.map((i) => "@" + i.username).join(", ")}. They can join or pass.`, "gift");
    persist();
    renderCommunity();
    notify(visibility === "friends" ? `Room created — invites sent to ${invites.length} friend${invites.length === 1 ? "" : "s"}` : "Sprint room created — see you at the start");
  };
  $("#sprint-vis", body).onchange = () => paintCrewBtn(body);
  $("#sprint-friends-go", body).onclick = () => {
    openFriendsPicker({
      title: "Pick your sprint crew",
      eyebrow: "Sprint invites",
      note: "Only the friends you tick get the invite DM.",
      cta: "Save crew",
      selected: sprintPickedIds,
      onDone: (ids) => {
        sprintPickedIds = ids;
        if (ids.length && $("#sprint-vis", body)?.value !== "friends") {
          const vis = $("#sprint-vis", body);
          if (vis) vis.value = "friends";
        }
        paintCrewBtn(body);
      },
    });
  };
  paintCrewBtn(body);
  $$("[data-inv-accept]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const inv = state.sprintInvites.find((x) => x.id === b.dataset.invAccept);
        if (!inv || inv.status !== "pending") return;
        inv.status = "accepted";
        sendInviteReplyDm(inv, "accepted").catch(() => {});
        const dur = inv.durationMin || 25;
        state.sprints.push(sanitizeSprint({
          id: inv.sprintId || uid(),
          title: inv.title || `${dur}-min sprint`,
          purpose: inv.purpose || "",
          groupId: "",
          durationSec: dur * 60,
          startsAt: inv.startsAt || Date.now() + 2 * 60000,
          joined: true,
          liveNotified: false,
          result: null,
          ownerId: "",
          visibility: "friends",
          invites: [],
          roster: [makeCrewPeer(inv.from || "Host")],
        }));
        persist();
        renderCommunity();
        celebrate(false);
        notify(`You're in “${inv.title}” — see it on your Focus desk`);
      }),
  );
  $$("[data-inv-decline]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const inv = state.sprintInvites.find((x) => x.id === b.dataset.invDecline);
        if (!inv) return;
        inv.status = "declined";
        sendInviteReplyDm(inv, "declined").catch(() => {});
        persist();
        renderCommunity();
        notify("Invite passed — no hard feelings");
      }),
  );
  $$("[data-sprint-edit]", body).forEach(
    (b) => (b.onclick = () => openSprintEditor(b.dataset.sprintEdit)),
  );
  $$("[data-sprint-del]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const sp = state.sprints.find((x) => x.id === b.dataset.sprintDel);
        if (!sp) return;
        if (!isSprintOwner(sp)) return notify("Only the room creator can delete it");
        confirmBox(
          `Delete “${sp.title}”?`,
          "The room, its invites and the crew pace board go with it. This cannot be undone.",
          () => {
            if (state.sprintSession === sp.id) state.sprintSession = null;
            state.sprints = state.sprints.filter((x) => x.id !== sp.id);
            persist();
            renderCommunity();
            notify("Sprint room deleted");
          },
          { eyebrow: "Sprint rooms", yesLabel: "Delete room", noLabel: "Keep it" },
        );
      }),
  );
  $$("[data-sprint-nudge]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const sp = state.sprints.find((x) => x.id === b.dataset.sprintNudge);
        if (!sp) return;
        if (resolveOneInvite(sp)) {
          persist();
          renderCommunity();
        } else {
          notify("Everyone has replied already");
        }
      }),
  );
  $$("[data-sprint-join]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const sp = state.sprints.find((x) => x.id === b.dataset.sprintJoin);
        if (!sp) return;
        sp.joined = true;
        persist();
        renderCommunity();
      }),
  );
  $$("[data-sprint-leave]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const sp = state.sprints.find((x) => x.id === b.dataset.sprintLeave);
        if (!sp) return;
        sp.joined = false;
        if (state.sprintSession === sp.id) state.sprintSession = null;
        persist();
        renderCommunity();
      }),
  );
  $$("[data-sprint-now]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const sp = state.sprints.find((x) => x.id === b.dataset.sprintNow);
        if (!sp) return;
        sp.startsAt = Date.now();
        sp.joined = true;
        persist();
        renderCommunity();
      }),
  );
  $$("[data-sprint-late]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const sp = state.sprints.find((x) => x.id === b.dataset.sprintLate);
        if (!sp || sessionInProgress()) return;
        const lateLock = challengeLock();
        if (lateLock) return notify(`Challenge lock holds your timer — leave “${lateLock.title}” first`);
        const remain = Math.max(
          60,
          Math.round((sp.startsAt + sp.durationSec * 1000 - Date.now()) / 1000),
        );
        state.mode = "focus";
        state.time = remain;
        state.sessionDuration = remain;
        state.sprintSession = sp.id;
        startTimer();
        persist();
        updateTimerDom();
        shell();
        notify("Jumped in late — make it count " + sicon("fire"));
      }),
  );
  $("#ch-create", body).onclick = () => {
    if (!requireAuth("host group challenges")) return;
    const target = Math.min(500, Math.max(1, parseInt($("#ch-target", body).value, 10) || 10));
    const groupId = $("#ch-group", body).value || "";
    if (!groupId) return notify("Join a group first to challenge it");
    const unit = $("#ch-unit", body).value === "minutes" ? "minutes" : "sessions";
    const title = $("#ch-title", body).value.trim() || `${target} ${unit} this week`;
    let paceMin = Math.min(180, Math.max(0, parseInt($("#ch-min", body)?.value, 10)));
    let paceSec = Math.min(59, Math.max(0, parseInt($("#ch-sec", body)?.value, 10)));
    if (!Number.isFinite(paceMin)) paceMin = 25;
    if (!Number.isFinite(paceSec)) paceSec = 0;
    if (paceMin === 0 && paceSec === 0) return notify("Pace can't be 0:00 — set at least a few seconds");
    const ch = sanitizeChallenge({
      id: uid(),
      groupId,
      title,
      target,
      unit,
      weekKey: weekKey(new Date()),
      progress: 0,
      done: false,
      sessionMin: paceMin,
      sessionSec: paceSec,
      ownerId: chatKey(),
      joined: false,
      members: [],
    });
    state.challenges.push(ch);
    postGroupMessage(groupId, `New challenge: “${title}” — ${target} ${unit} this week at ${fmtPace(ch)} a session. Who's in?`, "trophy");
    const seated = joinChallenge(ch.id);
    persist();
    renderCommunity();
    notify(seated ? `Challenge launched — your timer is locked to ${fmtPace(ch)}` : "Challenge launched — leave your current race to join it");
  };
  $$("[data-ch-join]", body).forEach(
    (b) =>
      (b.onclick = () => {
        if (joinChallenge(b.dataset.chJoin)) {
          persist();
          renderCommunity();
          const c = state.challenges.find((x) => x.id === b.dataset.chJoin);
          notify(`Locked in — every session runs ${c ? fmtPace(c) : "the set pace"} ${sicon("bolt")}`);
        }
      }),
  );
  $$("[data-ch-del]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const c = state.challenges.find((x) => x.id === b.dataset.chDel);
        if (!c) return;
        if (c.ownerId && c.ownerId !== chatKey()) return notify("Only the host can delete this challenge");
        confirmBox(
          `Delete “${c.title}”?`,
          "The leaderboard and everyone's progress in this race go with it. This cannot be undone.",
          () => {
            if (state.activeChallengeId === c.id) state.activeChallengeId = null;
            state.challenges = state.challenges.filter((x) => x.id !== c.id);
            try {
              applyDurations();
            } catch {
              /* ignore */
            }
            persist();
            renderCommunity();
            notify("Challenge deleted");
          },
          { eyebrow: "Group challenges", yesLabel: "Delete", noLabel: "Keep it" },
        );
      }),
  );
  $$("[data-ch-leave]", body).forEach(
    (b) =>
      (b.onclick = () =>
        confirmBox(
          "Leave this challenge?",
          "Your timer unlocks and your leaderboard row resets. The group keeps racing.",
          () => {
            leaveChallenge(b.dataset.chLeave);
            renderCommunity();
            notify("Challenge left — timer is yours again");
          },
          { eyebrow: "Group challenges", yesLabel: "Leave", noLabel: "Stay in" },
        )),
  );
  $("#ev-aud", body).onchange = (e) => {
    paintEvCrewBtn(body);
    // The group picker only makes sense when "A group" is the audience —
    // hiding it keeps the new-session form compact instead of a tall empty box.
    const groupSel = $("#ev-group", body);
    if (groupSel) groupSel.hidden = e.target.value !== "group";
  };
  // Initial paint: default audience is "Just me", so start hidden.
  {
    const groupSel = $("#ev-group", body);
    if (groupSel) groupSel.hidden = ($("#ev-aud", body)?.value || "self") !== "group";
  }
  $("#ev-crew-toggle", body).onclick = () => {
    openFriendsPicker({
      title: "Invite friends to your session",
      eyebrow: "Session invites",
      note: "Every friend you tick gets an invite they can accept or decline.",
      cta: "Save invite list",
      selected: eventPickedIds,
      onDone: (ids) => {
        eventPickedIds = ids;
        if (ids.length && $("#ev-aud", body)?.value !== "friends") {
          const aud = $("#ev-aud", body);
          if (aud) aud.value = "friends";
          const groupSel = $("#ev-group", body);
          if (groupSel) groupSel.hidden = true;
        }
        paintEvCrewBtn(body);
      },
    });
  };
  paintEvCrewBtn(body);
  $("#ev-create", body).onclick = () => {
    if (!requireAuth("schedule sessions")) return;
    const title = $("#ev-title", body).value.trim() || "Study session";
    const at = new Date($("#ev-at", body).value).getTime();
    if (!at || at < Date.now()) return notify("Pick a future date and time");
    const aud = $("#ev-aud", body)?.value || "self";
    const groupId = $("#ev-group", body).value || "";
    if (aud === "group" && !groupId) return notify("Pick a group — or switch to Just me / Friends");
    const picked = [...eventPickedIds];
    if (aud === "friends" && !picked.length) return notify("Friends session? Choose at least one friend first");
    const byId = new Map(friendsPickerSource().map((f) => [f.id, f]));
    const invites = picked.map((id) => ({
      id: "evinv-" + uid(),
      friendId: id,
      username: byId.get(id)?.username || "friend",
      status: "pending",
    }));
    const durationMin = parseInt($("#ev-dur", body).value, 10) || 25;
    const e = {
      id: uid(),
      title,
      groupId: aud === "self" ? "" : groupId,
      at,
      durationMin,
      mine: true,
      reminded: false,
      ownerId: mySprintId(),
      visibility: aud === "friends" ? "friends" : groupId && aud !== "self" ? "open" : "self",
      invites: aud === "friends" ? invites : [],
    };
    state.events.push(e);
    if (e.groupId)
      postGroupMessage(e.groupId, `Scheduled: “${title}” — ${new Date(at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}. RSVP in Community → Sprints.`, "calendar");
    // Real delivery: invited friends receive the session as a DM with
    // structured metadata (works for cloud connections with real ids).
    sendInviteDms("session", {
      refId: e.id,
      title,
      purpose: "",
      at,
      durationSec: durationMin * 60,
    }, invites.map((i) => i.friendId)).catch(() => {});
    if (e.visibility === "friends")
      addNotification("Session invites sent", `“${title}” — ${invites.map((i) => "@" + i.username).join(", ")}. They can RSVP or pass.`, "gift");
    persist();
    renderCommunity();
    notify(e.visibility === "friends" ? `Scheduled — invites sent to ${invites.length} friend${invites.length === 1 ? "" : "s"}` : "Session scheduled — I'll remind you");
  };
  $$("[data-ev-inv-accept]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const inv = (state.eventInvites || []).find((x) => x.id === b.dataset.evInvAccept);
        if (!inv || inv.status !== "pending") return;
        inv.status = "accepted";
        sendInviteReplyDm({ ...inv, t: "session" }, "accepted").catch(() => {});
        state.events.push({
          id: uid(),
          title: inv.title || "Study session",
          groupId: "",
          at: inv.at || Date.now() + 3600000,
          durationMin: inv.durationMin || 25,
          mine: true,
          reminded: false,
          ownerId: "",
          visibility: "friends",
          invites: [],
        });
        persist();
        renderCommunity();
        celebrate(false);
        notify(`You're going to “${inv.title}” — it's on your Focus desk`);
      }),
  );
  $$("[data-ev-inv-decline]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const inv = (state.eventInvites || []).find((x) => x.id === b.dataset.evInvDecline);
        if (!inv) return;
        inv.status = "declined";
        sendInviteReplyDm({ ...inv, t: "session" }, "declined").catch(() => {});
        persist();
        renderCommunity();
        notify("Invite passed — no hard feelings");
      }),
  );
  $$("[data-event-nudge]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const e = state.events.find((x) => x.id === b.dataset.eventNudge);
        if (!e) return;
        if (resolveOneEventInvite(e)) {
          persist();
          renderCommunity();
        } else {
          notify("Everyone has replied already");
        }
      }),
  );
  $$("[data-event-rsvp]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const e = state.events.find((x) => x.id === b.dataset.eventRsvp);
        if (!e) return;
        e.mine = !e.mine;
        if (e.mine) e.reminded = false;
        persist();
        renderCommunity();
      }),
  );
  $$("[data-event-del]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const e = state.events.find((x) => x.id === b.dataset.eventDel);
        if (!e) return;
        if (!isEventOwner(e)) return notify("Only the host can remove this session");
        confirmBox(
          `Remove “${e.title}”?`,
          "RSVPs go with it. Friends who accepted will keep their own copy.",
          () => {
            state.events = state.events.filter((x) => x.id !== e.id);
            persist();
            renderCommunity();
            notify("Session removed");
          },
          { eyebrow: "Scheduled sessions", yesLabel: "Remove", noLabel: "Keep it" },
        );
      }),
  );
  $$("[data-event-start]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const e = state.events.find((x) => x.id === b.dataset.eventStart);
        if (!e || sessionInProgress()) return;
        const evLock = challengeLock();
        if (evLock) return notify(`Challenge lock holds your timer — leave “${evLock.title}” first`);
        state.mode = "focus";
        state.time = e.durationMin * 60;
        state.sessionDuration = e.durationMin * 60;
        startTimer();
        persist();
        updateTimerDom();
        shell();
        notify(`${sicon("check")} “${esc(e.title)}” started — show up for yourself`);
      }),
  );
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return d + "d ago";
  return new Date(ts).toLocaleDateString();
}

function isSeen(key) {
  return Boolean((state.statusSeen || {})[key]);
}

function markSeen(key) {
  state.statusSeen = state.statusSeen || {};
  if (!state.statusSeen[key]) {
    state.statusSeen[key] = Date.now();
    const keys = Object.keys(state.statusSeen);
    if (keys.length > 300)
      keys
        .slice(0, keys.length - 300)
        .forEach((k) => delete state.statusSeen[k]);
    persist();
  }
}

function statusDuration(item) {
  if (!item) return 5000;
  if (item.type === "video") return item.durationMs || 7000;
  return 5000;
}

function buildStatusSequence() {
  const me = {
    id: "me",
    name: (state.profile && state.profile.name) || "You",
    photo: (state.profile && state.profile.photo) || "",
    fallback: (state.profile && state.profile.avatar) || "?",
  };
  const seq = [];
  liveStories()
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .forEach((s) =>
      seq.push({
        key: "story:" + s.id,
        type: "story",
        kind: s.kind === "video" ? "video" : s.photo ? "photo" : "flex",
        author: me,
        ts: s.ts,
        text: s.text || "",
        photo: s.photo || "",
        video: s.video || "",
        id: s.id,
      }),
    );
  // The loop shows only posted device stories — no auto-generated streak,
  // best-day, or minutes-this-week cards.
  return seq;
}

function pruneExpiredStories() {
  const now = Date.now();
  const before = (state.stories || []).length;
  state.stories = (state.stories || [])
    .filter((s) => s && now - s.ts < 86400000)
    .slice(0, 30);
  if (state.statusSeen) {
    const liveIds = new Set(state.stories.map((s) => "story:" + s.id));
    Object.keys(state.statusSeen).forEach((k) => {
      if (k.startsWith("story:") && !liveIds.has(k))
        delete state.statusSeen[k];
    });
  }
  if ((state.stories || []).length !== before) persist();
}

function ownStory(id) {
  return (state.stories || []).find((s) => s && s.id === id) || null;
}

function deleteStatus(id) {
  const target = ownStory(id);
  if (!target)
    return { ok: false, error: "That status no longer exists." };
  state.stories = (state.stories || []).filter((s) => s && s.id !== id);
  if (ownStory(id))
    return { ok: false, error: "Couldn't remove that status. Try again." };
  if (state.statusSeen) delete state.statusSeen["story:" + id];
  persist();
  return { ok: true };
}

// Cloud story photo staging: file + one object URL, revoked on clear, post,
// replace, or leaving Discover. Never persisted, never in the database.
let cloudStoryPhoto = null;
function clearCloudStoryPhoto() {
  try {
    if (cloudStoryPhoto?.url) URL.revokeObjectURL(cloudStoryPhoto.url);
  } catch { /* ignore */ }
  cloudStoryPhoto = null;
}
// Signed-URL paint for photo-story thumbnails (backend caches the URLs, so
// re-renders don't re-download).
function paintStoryThumbs(root) {
  const scope = root || document;
  if (!signedIn()) return;
  $$("[data-story-thumb]", scope).forEach((img) => {
    const path = img.getAttribute("data-story-thumb");
    if (!path || img.dataset.thOk === path) return;
    img.dataset.thOk = path;
    getStoryMediaUrl(path).then(({ data, error } = {}) => {
      if (error || !data?.signedUrl || !img.isConnected) {
        delete img.dataset.thOk;
        return;
      }
      img.src = data.signedUrl;
    }).catch(() => { delete img.dataset.thOk; });
  });
}
// Device-local story rings (shared by the Discover strip and Status home;
// they open the local status loop, not the cloud viewer).
function localStoryRings(live) {
  return live.map((s) => `<button type="button" class="story-ring${isSeen("story:" + s.id) ? " seen" : ""}" data-story-view="${s.id}" title="${ownStory(s.id) ? "View in status loop — right-click to delete" : "View in status loop"}"><span>${s.photo ? `<img src="${s.photo}" alt="Story">` : s.kind === "video" ? sicon("film") : sicon("fire")}</span><small>${esc(s.author.length > 8 ? s.author.slice(0, 7) + "…" : s.author)}</small></button>`).join("");
}
function liveStories() {
  const now = Date.now();
  return (state.stories || []).filter((s) => now - s.ts < 86400000);
}

function storiesMarkup() {
  const live = liveStories();
  const unseen = live.filter((s) => !isSeen("story:" + s.id)).length;
  const unseenCloud = cloudStories.filter((s) => !isSeen("cstory:" + s.id)).length;
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Stories</h2><span class="tag">24h${unseen + unseenCloud ? ` · ${unseen + unseenCloud} new` : ""}</span></div><div class="story-strip"><button type="button" class="story-add" data-status-play title="Play the full status loop">${sicon("play")}<small>Status</small></button>${localStoryRings(live)}${cloudStoryGroups().filter((g) => cloudFriends.some((f) => f.id === g.author.id)).map((g) => friendStatusRing(g.author.id, g.author.handle, g.author.name, g.items)).join("")}</div><p class="muted" style="margin:8px 0 0">Statuses are view-only here — post from Community → Status.</p></div>`;
}

// Shared cloud-story post path (Status home composer only — Discover is
// view-only). Offline never fabricates a story: text is kept as a local
// draft, an attached photo stays staged, and the user is told plainly.
async function postCloudStory({ text, vis = "connections", file = null, btn = null } = {}) {
  const clean = String(text || "").trim().slice(0, 500);
  const visibility = ["public", "connections", "private"].includes(vis) ? vis : "connections";
  if (!clean && !file) {
    notify("Write your story first");
    return false;
  }
  if (!navigator.onLine) {
    // Offline: posting is blocked (statuses need the server), but nothing is
    // lost — text is kept as a draft that survives reloads, and the user is
    // told exactly why. Previously posted statuses stay visible above.
    if (clean) {
      state.storyDraft = { text: clean, vis: visibility, ts: Date.now() };
      persist();
    }
    notify(file
      ? "You're offline — photo stories need a connection. Your photo is still attached for when you're back."
      : "You're offline — posting needs a connection. Your text is saved as a draft and your earlier statuses are still visible.");
    return false;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Posting…";
  }
  // Pipeline trace (DevTools only): each stage records its outcome so a
  // failure can be attributed to validation vs storage vs database.
  const trace = { at: new Date().toISOString(), kind: file ? "image" : "text", visibility };
  const traceLog = (stage, extra = {}) => {
    try {
      Object.assign(trace, extra);
      if (typeof window !== "undefined") {
        window.__sfLastStoryUpload = { ...trace };
        console.debug(`[sf-story-upload] ${stage}`, { ...trace });
      }
    } catch { /* diagnostics must never break posting */ }
  };
  try {
    let mediaPath = null;
    let kind = "text";
    if (file) {
      traceLog("before-upload", {
        name: file.name, type: file.type, size: file.size,
        validation: window.__sfLastImageDiag?.verdict ?? null,
      });
      // One automatic retry on transient faults (e.g. a 503 from Storage);
      // persistent failures still surface honestly below.
      let up = null;
      let upErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        ({ data: up, error: upErr } = await uploadStoryPhoto(file));
        if (!upErr || !isTransientUploadError(upErr)) break;
        traceLog("storage-retry", { attempt: attempt + 1, error: String(upErr.message || upErr).slice(0, 160) });
        await sleepMs(1500);
      }
      if (upErr) throw upErr;
      mediaPath = up.path;
      kind = "image";
      traceLog("storage-ok", { mediaPath });
    }
    const { data: row, error } = await createStory({ text: clean, mediaPath, kind, visibility });
    if (error) {
      if (mediaPath) await deleteStoryMedia(mediaPath).catch(() => {});
      throw error;
    }
    traceLog("story-result", { ok: true, storyId: row?.id ?? null });
    clearCloudStoryPhoto();
    if (state.storyDraft) {
      state.storyDraft = null;
      persist();
    }
    notify(kind === "image" ? "Photo story shared for 24h" : "Story shared for 24h");
    await refreshCloudStories(true).catch(() => {});
    renderCommunity();
    return true;
  } catch (err) {
    const raw = String(err?.message || err || "");
    const userMsg = file ? friendlyUploadError(err) : "Couldn't share your story — try again.";
    traceLog("error-mapping", {
      ok: false,
      originalError: raw.slice(0, 300),
      errorName: err?.name || null,
      classifiedFormatError: userMsg === IMAGE_FORMAT_ERROR,
      userMessage: userMsg,
    });
    notify(userMsg);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Post";
    }
    return false;
  }
}
function bindStories(body) {
  if (signedIn()) {
    const before = JSON.stringify(cloudStories.map((s) => s.id));
    refreshCloudStories(false).then(() => {
      if (state.tab === "community" && state.subtab === "discover"
        && JSON.stringify(cloudStories.map((s) => s.id)) !== before) renderCommunity();
    }).catch(() => {});
  }
  $$("[data-cloud-story]", body).forEach(
    (b) => (b.onclick = () => {
      const hit = cloudStories.find((s) => s.id === b.dataset.cloudStory);
      if (!hit) return;
      const items = cloudStories
        .filter((s) => s.userId === hit.userId)
        .sort((a, b2) => new Date(a.createdAt) - new Date(b2.createdAt));
      openStoryViewer(items, Math.max(0, items.findIndex((s) => s.id === hit.id)));
    }),
  );
  $$('[data-cloud-story-group]', body).forEach(
    (b) => (b.onclick = () => {
      const g = cloudStoryGroups().find((x) => x.author.id === b.dataset.cloudStoryGroup);
      if (!g || !g.items.length) return;
      openStoryViewer(g.items, 0);
    }),
  );
  $("[data-status-play]", body)?.addEventListener("click", playAllStatuses);
  $$("[data-story-view]", body).forEach(
    (b) => (b.onclick = () => openStatus("story:" + b.dataset.storyView)),
  );
}

// Cloud stories: 24h text updates from connections/public, with idempotent
// server-side views. Local photo/video stories above are untouched.
async function refreshCloudStories(force) {
  if (!signedIn()) return;
  // Offline: the in-memory cache (cloudStories) is exactly what should stay
  // on screen — statuses posted before the connection dropped keep showing.
  // Skip the network entirely rather than risk an offline response being
  // mistaken for "no stories".
  if (!navigator.onLine) return;
  if (!force && Date.now() - cloudStoriesAt < 60000 && cloudStoriesAt) return;
  try {
    const { data, error } = await listStories(60);
    if (error) {
      // A real error keeps the stale cache too — an empty list is only
      // adopted from a successful read.
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    const { data: profiles } = await getPublicProfiles(rows.map((r) => r.user_id)).catch(() => ({ data: [] }));
    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    cloudStories = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      handle: byId.get(r.user_id)?.handle || "member",
      name: byId.get(r.user_id)?.name || "",
      mine: state.user && r.user_id === state.user.id,
      text: r.text || "",
      kind: r.kind || (r.media_path ? "image" : "text"),
      mediaPath: r.media_path || null,
      visibility: r.visibility,
      createdAt: r.created_at,
    }));
    cloudStoriesAt = Date.now();
  } catch {
    /* offline — keep stale cache */
  }
}
function relTime(ts) {
  const d = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(d) || d < 0) return "now";
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
// Deterministic per-key accent + text-card theme (token-driven, premium dark
// cards that read well in both light and dark mode).
const SV_ACCENTS = ["var(--lime)", "var(--coral)", "var(--gold)", "var(--sage)"];
function svAccent(key) {
  let h = 0;
  for (const c of String(key || "?")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SV_ACCENTS[h % SV_ACCENTS.length];
}
const SV_THEMES = [
  "linear-gradient(160deg, color-mix(in srgb, var(--sage) 58%, #0c120d), #0c120d 78%)",
  "linear-gradient(160deg, color-mix(in srgb, var(--coral) 52%, #160e08), #160e08 78%)",
  "linear-gradient(160deg, color-mix(in srgb, var(--gold) 48%, #161006), #161006 78%)",
  "linear-gradient(160deg, color-mix(in srgb, var(--lime) 30%, #0e140b), #0e140b 78%)",
];
function svTheme(id) {
  let h = 0;
  for (const c of String(id || "?")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SV_THEMES[h % SV_THEMES.length];
}
function statusAvatarInner(handle, name, photo) {
  if (photo) return `<img src="${esc(photo)}" alt="">`;
  return esc(((handle || name || "?")[0] || "?").toUpperCase());
}
// Status home: composer + My Status (your posts only) + device-local.
function renderStatus(body) {
  if (signedIn()) {
    const before = JSON.stringify(cloudStories.map((s) => s.id));
    refreshCloudStories(false).then(() => {
      if (state.tab === "community" && state.subtab === "status"
        && JSON.stringify(cloudStories.map((s) => s.id)) !== before) renderCommunity();
    }).catch(() => {});
  }
  const mine = signedIn()
    ? cloudStories.filter((s) => s.mine).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : [];
  const device = liveStories();
  const friendGroups = signedIn() ? friendsWithStories() : [];
  const unseenMine = mine.filter((s) => !isSeen("cstory:" + s.id)).length;
  const myRows = mine.map((s) => {
    const unseen = !isSeen("cstory:" + s.id);
    const preview = s.kind === "image" && s.mediaPath
      ? `<img class="sv-list-thumb" data-story-thumb="${esc(s.mediaPath)}" alt="">`
      : `<span class="sv-list-thumb sv-list-thumb-text">${sicon(s.kind === "image" ? "camera" : "fire")}</span>`;
    return `<button type="button" class="status-row" data-mine-status="${esc(s.id)}">`
      + `<span class="status-avatar sm" style="--sv-accent:${svAccent(state.profile.handle)}">${avatarMarkup(state.profile.photo, state.profile.avatar)}</span>`
      + preview
      + `<span class="status-meta"><strong>${esc(String(s.text || "Photo status").slice(0, 48))}</strong><small>${relTime(s.createdAt)}${s.visibility === "private" ? " · Only me" : ""}</small></span>`
      + (unseen ? '<span class="status-dot" aria-label="Unseen"></span>' : `<span class="tag">${sicon("check")}</span>`)
      + `</button>`;
  }).join("");
  const friendRings = friendGroups
    .map((g) => friendStatusRing(g.author.id, g.author.handle, g.author.name, g.items))
    .join("");
  body.innerHTML = `${signedIn() ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>New status</h2><span class="tag" data-st-mode>${cloudStoryPhoto ? "photo" : "text"}</span></div><textarea class="textarea" id="st-text" rows="3" maxlength="500" placeholder="What's on your mind?" aria-label="Write a status">${esc(state.storyDraft?.text || "")}</textarea><div class="st-composer-meta"><span><span data-st-count>0</span>/500 · 24h</span><span class="st-composer-actions"><select class="select" id="st-vis" aria-label="Status visibility"><option value="connections">Connections</option><option value="private">Only me</option></select><button type="button" class="ghost" id="st-photo" aria-label="Add photo">${sicon("camera")} Photo</button><button type="button" class="primary" id="st-post">Post</button></span></div><input type="file" id="st-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden aria-label="Choose a status photo"><div data-st-preview>${cloudStoryPhoto?.url ? `<img src="${cloudStoryPhoto.url}" class="story-photo-preview" alt="Status photo preview"><div style="margin-top:6px"><button type="button" class="ghost" id="st-photo-remove">Remove</button></div>` : ""}</div>${state.storyDraft?.text ? `<p class="muted" style="margin:6px 0 0">Draft restored — post when you're back online.</p>` : ""}</div>` : `<div class="card" style="margin-bottom:18px"><h2>Status</h2><p class="muted">Sign in to post 24h statuses for your circle.</p></div>`}`
    + `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Your statuses</h2><span class="tag">${mine.length ? `${mine.length} update${mine.length === 1 ? "" : "s"}${unseenMine ? ` · ${unseenMine} new` : ""}` : "none yet"}</span></div>${mine.length ? myRows : `<p class="muted">Share your first update above — text or photo, live for 24h.</p>`}</div>`
    + (signedIn() ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Friends' statuses</h2><span class="tag">${friendGroups.length ? `${friendGroups.length} active` : "quiet"}</span></div>${friendGroups.length ? `<div class="story-strip">${friendRings}</div>` : `<p class="muted">No friend statuses right now — you'll see rings here the moment someone posts.</p>`}</div>` : "")
    + (device.length ? `<div class="card"><div class="section-row"><h2>On this device</h2><span class="tag">local</span></div><div class="story-strip">${localStoryRings(device)}</div></div>` : "");
  bindStatusHome(body);
  paintStoryThumbs(body);
}
function bindStatusHome(body) {
  bindFriendStoryRings(body);
  $$("[data-mine-status]", body).forEach((b) => {
    b.onclick = () => {
      const hit = cloudStories.find((s) => s.id === b.dataset.mineStatus);
      if (!hit) return;
      openStoryViewer([hit], 0);
    };
  });
  $$("[data-status-play-all]", body).forEach((b) => {
    b.onclick = () => playAllStatuses();
  });
  $$("[data-story-view]", body).forEach(
    (b2) => (b2.onclick = () => openStatus("story:" + b2.dataset.storyView)),
  );
  const text = $("#st-text", body);
  if (text) {
    const count = $("[data-st-count]", body);
    const paint = () => { if (count) count.textContent = String(text.value.length); };
    text.addEventListener("input", paint);
    paint();
  }
  const file = $("#st-file", body);
  $("#st-photo", body)?.addEventListener("click", () => file?.click());
  file?.addEventListener("change", async () => {
    const picked = file.files?.[0];
    file.value = "";
    if (!picked) return;
    const bad = await validateImageFile(picked, 50 * 1024 * 1024, "status-composer");
    if (bad) return notify(bad);
    clearCloudStoryPhoto();
    cloudStoryPhoto = { file: picked, url: URL.createObjectURL(picked) };
    renderCommunity();
  });
  $("#st-photo-remove", body)?.addEventListener("click", () => {
    clearCloudStoryPhoto();
    renderCommunity();
  });
  $("#st-post", body)?.addEventListener("click", (e) => postCloudStory({
    text: $("#st-text", body)?.value,
    vis: $("#st-vis", body)?.value || "connections",
    file: cloudStoryPhoto?.file || null,
    btn: e.currentTarget,
  }));
}
// Dedicated story viewer: progress bars, per-user text cards / photo stage,
// tap + keyboard navigation off a single index, auto-advance with pause,
// targeted DOM updates only (Community never re-renders underneath).
// Status button (Discover strip): one tap plays EVERYTHING in order — your
// updates first (oldest to newest), then each person's updates oldest to
// newest, most recently active first. No per-ring tapping. Falls back to the
// device-local loop for guests/offline with no cloud stories.
function playAllStatuses() {
  const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
  const mine = cloudStories.filter((s) => s.mine).sort(byTime);
  const others = new Map();
  for (const s of cloudStories) {
    if (s.mine) continue;
    // The one-tap loop plays friends' statuses only — never a stranger's.
    if (!cloudFriends.some((f) => f.id === s.userId)) continue;
    if (!others.has(s.userId)) others.set(s.userId, []);
    others.get(s.userId).push(s);
  }
  const groups = [...others.values()]
    .map((items) => items.sort(byTime))
    .sort((a, b) => new Date(b[b.length - 1].createdAt) - new Date(a[a.length - 1].createdAt));
  const all = [...mine, ...groups.flat()];
  if (!all.length) {
    if (liveStories().length) {
      openStatus();
      return;
    }
    // Nothing to play: take the user to the Status composer instead of
    // popping a notification.
    if (state.subtab !== "status") {
      state.subtab = "status";
      renderCommunity();
    }
    return;
  }
  const firstNew = all.findIndex((s) => !isSeen("cstory:" + s.id));
  openStoryViewer(all, firstNew < 0 ? 0 : firstNew);
}
function closeStoryViewer() {
  const ov = $("#story-viewer");
  if (!ov) return;
  closeStoryMenu();
  if (ov.__svKey) document.removeEventListener("keydown", ov.__svKey);
  if (ov.__svClear) ov.__svClear();
  ov.remove();
}
// Viewer ⋮ options menu (the ONLY status-deletion entry point). Anchored to
// the top-bar button, themed by tokens, clamped to the viewport. Ownership
// is a UX gate only — deleteStory/storage RLS stays authoritative.
let svMoreMenu = null;
function closeStoryMenu() {
  if (svMoreMenu) svMoreMenu.remove();
  svMoreMenu = null;
  document.removeEventListener("pointerdown", svMoreOutside, true);
}
function svMoreOutside(e) {
  if (svMoreMenu && !svMoreMenu.contains(e.target)) closeStoryMenu();
}
function openStoryMenu(anchorBtn, onDelete) {
  closeStoryMenu();
  const menu = document.createElement("div");
  menu.className = "sv-ctxmenu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Status options");
  menu.innerHTML = `<button type="button" role="menuitem" data-m-del>${sicon("trash")}<span>Delete</span></button>`;
  document.body.append(menu);
  // Anchor under the ⋮ button, clamped inside the viewport.
  const b = anchorBtn.getBoundingClientRect();
  const r = menu.getBoundingClientRect();
  const m = 8;
  menu.style.left = Math.max(m, Math.min(b.right - r.width, window.innerWidth - r.width - m)) + "px";
  menu.style.top = Math.max(m, Math.min(b.bottom + 6, window.innerHeight - r.height - m)) + "px";
  svMoreMenu = menu;
  document.addEventListener("pointerdown", svMoreOutside, true);
  menu.querySelector("[data-m-del]").onclick = () => {
    closeStoryMenu();
    onDelete();
  };
  menu.querySelector("[data-m-del]").focus();
  return menu;
}
// Deletes a cloud status row + its media file (best-effort), then drops it
// from the local cache. RLS owns the permission check, not this helper.
async function deleteCloudStatus(item) {
  if (!item) return;
  await deleteStory(item.id).catch(() => {});
  if (item.mediaPath) await deleteStoryMedia(item.mediaPath).catch(() => {});
  cloudStories = cloudStories.filter((x) => x.id !== item.id);
}
function openStoryViewer(items, startIdx) {
  if (!Array.isArray(items) || !items.length) return;
  closeStoryViewer();
  const st = {
    items: [...items],
    idx: Math.min(Math.max(startIdx || 0, 0), items.length - 1),
    timer: 0,
    remaining: 0,
    endsAt: 0,
    paused: false,
    dur: 0,
    gen: 0,
  };
  const ov = document.createElement("div");
  ov.id = "story-viewer";
  ov.innerHTML = `<div class="sv-frame" role="dialog" aria-label="Status viewer"><div class="sv-progress" data-sv-progress></div><div class="sv-top"><span class="status-avatar sm" data-sv-avatar></span><span class="sv-who"><strong data-sv-name></strong><small data-sv-time></small></span><button type="button" class="sv-more" data-sv-more aria-label="Status options" title="Status options" hidden>⋮</button><button type="button" class="sv-close" data-sv-close aria-label="Close status viewer">×</button></div><div class="sv-stage" data-sv-stage></div><button type="button" class="sv-tap left" data-sv-prev aria-label="Previous status">‹</button><button type="button" class="sv-tap right" data-sv-next aria-label="Next status">›</button><div class="sv-foot"><span class="muted" data-sv-views></span></div></div>`;
  document.body.append(ov);
  const bar = () => ov.querySelector("[data-sv-progress]");
  const stage = () => ov.querySelector("[data-sv-stage]");
  function paintBars() {
    bar().innerHTML = st.items.map((_, i) => `<span class="sv-bar${i < st.idx ? " done" : i === st.idx ? " now" : ""}"><i></i></span>`).join("");
  }
  function armBar(ms) {
    const fill = bar().children[st.idx]?.firstElementChild;
    if (!fill) return;
    fill.style.transition = "none";
    fill.style.width = "0%";
    void fill.offsetWidth;
    fill.style.transition = `width ${ms}ms linear`;
    fill.style.width = "100%";
  }
  function freezeBar() {
    const fill = bar().children[st.idx]?.firstElementChild;
    if (!fill) return;
    const w = window.getComputedStyle(fill).width;
    fill.style.transition = "none";
    fill.style.width = w;
  }
  function clearTimer() {
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = 0;
    }
  }
  function schedule(ms) {
    clearTimer();
    st.dur = ms;
    st.remaining = ms;
    st.endsAt = Date.now() + ms;
    st.paused = false;
    armBar(ms);
    st.timer = setTimeout(() => advance(1, true), ms);
  }
  function pause() {
    if (st.paused || !st.timer) return;
    st.paused = true;
    st.remaining = Math.max(0, st.endsAt - Date.now());
    clearTimer();
    freezeBar();
  }
  function resume() {
    if (!st.paused) return;
    st.paused = false;
    st.endsAt = Date.now() + st.remaining;
    const fill = bar().children[st.idx]?.firstElementChild;
    if (fill) {
      fill.style.transition = `width ${st.remaining}ms linear`;
      fill.style.width = "100%";
    }
    st.timer = setTimeout(() => advance(1, true), st.remaining);
  }
  function markSeen(item) {
    state.statusSeen = state.statusSeen || {};
    state.statusSeen["cstory:" + item.id] = Date.now();
    persist();
    if (signedIn()) viewStory(item.id).catch(() => {});
  }
  function show(i) {
    // Single source of truth for the index: clamped, never out of range.
    st.idx = Math.min(Math.max(i, 0), st.items.length - 1);
    st.gen += 1;
    closeStoryMenu();
    const item = st.items[st.idx];
    if (!item) {
      closeStoryViewer();
      return;
    }
    paintBars();
    ov.querySelector("[data-sv-avatar]").innerHTML = statusAvatarInner(item.handle, item.name, null);
    ov.querySelector("[data-sv-avatar]").style.setProperty("--sv-accent", svAccent(item.handle));
    ov.querySelector("[data-sv-name]").textContent = item.mine ? "My Status" : "@" + item.handle;
    ov.querySelector("[data-sv-time]").textContent = `${relTime(item.createdAt)} · ${item.visibility}`;
    const views = ov.querySelector("[data-sv-views]");
    views.textContent = "";
    if (item.mine && signedIn()) {
      listStoryViews(item.id).then(({ data } = {}) => {
        if (st.items[st.idx]?.id !== item.id) return;
        const n = Array.isArray(data) ? data.length : 0;
        views.textContent = `${n} view${n === 1 ? "" : "s"}`;
      }).catch(() => {});
    }
    const box = stage();
    if (item.kind === "image" && item.mediaPath) {
      box.innerHTML = `<div class="sv-photo-wrap"><img class="sv-photo" alt="Status photo"></div>`;
      const img = box.querySelector("img");
      // Generation guard: async photo callbacks from a previous item must
      // never arm timers for the current one (skipped/duplicated statuses).
      const gen = st.gen;
      const beginIfCurrent = (ms) => { if (st.gen === gen) begin(ms); };
      let started = false;
      const begin = (ms) => {
        if (started || !document.body.contains(ov)) return;
        started = true;
        schedule(ms);
      };
      img.addEventListener("load", () => beginIfCurrent(7000));
      img.addEventListener("error", () => {
        img.alt = "Photo unavailable";
        beginIfCurrent(5000);
      });
      getStoryMediaUrl(item.mediaPath).then(({ data, error } = {}) => {
        if (!img.isConnected || st.items[st.idx]?.id !== item.id) return;
        if (error || !data?.signedUrl) {
          img.alt = "Photo unavailable";
          beginIfCurrent(5000);
          return;
        }
        img.src = data.signedUrl;
      }).catch(() => beginIfCurrent(5000));
      setTimeout(() => beginIfCurrent(10000), 10000); // failsafe: never stall
    } else {
      box.innerHTML = `<div class="sv-text-card" style="background:${svTheme(item.id)}"><p>${esc(item.text || "")}</p><div class="sv-card-foot"><strong>${esc(item.mine ? "You" : "@" + item.handle)}</strong><small>${relTime(item.createdAt)}</small></div></div>`;
      schedule(5000);
    }
    const prevBtns = [ov.querySelector("[data-sv-prev]")];
    const nextBtns = [ov.querySelector("[data-sv-next]")];
    prevBtns.forEach((b) => { if (b) b.disabled = st.idx === 0; });
    nextBtns.forEach((b) => { if (b) b.disabled = st.idx === st.items.length - 1; });
    ov.querySelector("[data-sv-more]").hidden = !item.mine;
    markSeen(item);
  }
  function advance(d, auto) {
    const next = st.idx + d;
    if (next < 0) {
      show(0);
      return;
    }
    if (next >= st.items.length) {
      // At the end: auto-advance and Next both close the viewer.
      closeStoryViewer();
      renderCommunity();
      return;
    }
    show(next);
    void auto;
  }
  ov.querySelector("[data-sv-close]").onclick = () => {
    closeStoryViewer();
    renderCommunity();
  };
  ov.querySelector("[data-sv-prev]").onclick = () => advance(-1, false);
  ov.querySelector("[data-sv-next]").onclick = () => advance(1, false);
  // ⋮ options menu (the ONLY status-deletion entry point): visible only on
  // your own statuses, works identically on desktop and touch. Deletion is
  // immediate — no confirmation step.
  const moreBtn = ov.querySelector("[data-sv-more]");
  moreBtn.onclick = (e) => {
    e.stopPropagation();
    const item = st.items[st.idx];
    if (!item?.mine) return;
    openStoryMenu(moreBtn, async () => {
      const cur = st.items[st.idx];
      if (!cur?.mine || cur.id !== item.id) {
        // Index moved on (auto-advance) while the menu was open: delete the
        // item the menu was opened for, then resync to a valid index.
        await deleteCloudStatus(item);
        st.items = st.items.filter((x) => x.id !== item.id);
      } else {
        await deleteCloudStatus(cur);
        st.items = st.items.filter((x) => x.id !== cur.id);
      }
      if (!st.items.length) {
        closeStoryViewer();
        renderCommunity();
        return;
      }
      show(Math.min(st.idx, st.items.length - 1));
    });
  };
  stage().addEventListener("pointerdown", pause);
  stage().addEventListener("pointerup", resume);
  stage().addEventListener("pointercancel", resume);
  document.addEventListener("visibilitychange", function svVis() {
    if (!document.body.contains(ov)) {
      document.removeEventListener("visibilitychange", svVis);
      return;
    }
    if (document.hidden) pause();
    else resume();
  });
  const onKey = (e) => {
    if (!document.body.contains(ov)) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      advance(1, false);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      advance(-1, false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // An open ⋮ menu closes first (it is a separate layer above the viewer).
      if (svMoreMenu) {
        closeStoryMenu();
        return;
      }
      closeStoryViewer();
      renderCommunity();
    }
  };
  ov.__svKey = onKey;
  document.addEventListener("keydown", onKey);
  ov.__svClear = clearTimer;
  show(st.idx);
}

let statusSeq = [];

let statusIdx = 0;

let statusTimer = null;

let statusItemStart = 0;

let statusItemDur = 5000;

let statusElapsed = 0;

let statusPaused = false;

let statusHoldTimer = null;

let statusHolding = false;

let statusTouch = null;

let statusNavToken = 0;

function statusNextIdx(i) {
  return statusSeq.length ? (i + 1) % statusSeq.length : 0;
}

function statusPrevIdx(i) {
  return statusSeq.length ? (i - 1 + statusSeq.length) % statusSeq.length : 0;
}

function statusRemaining(elapsed, duration) {
  return Math.max(0, duration - elapsed);
}

function clearStatusTimer() {
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  if (statusHoldTimer) {
    clearTimeout(statusHoldTimer);
    statusHoldTimer = null;
  }
}

function openStatus(startKey) {
  closeStatus(true);
  pruneExpiredStories();
  statusSeq = buildStatusSequence();
  if (!statusSeq.length) {
    return;
  }
  let idx = statusSeq.findIndex((it) => it.key === startKey);
  if (idx < 0) idx = statusSeq.findIndex((it) => !isSeen(it.key));
  if (idx < 0) idx = 0;
  const overlay = document.createElement("div");
  overlay.id = "status-viewer";
  overlay.innerHTML = `<div class="st-progress" data-st-progress></div><div class="st-head"><span class="st-avatar" data-st-avatar></span><span class="st-who"><strong data-st-name></strong><small data-st-time></small></span><button type="button" data-st-mute title="Mute">${sicon("volume")}</button><button type="button" data-st-menu title="Status options">⋮</button><button type="button" data-st-close title="Close">${sicon("x")}</button></div><div class="st-body" data-st-body></div><div class="st-cap" data-st-cap></div><button type="button" class="st-arrow left" data-st-prev title="Previous">‹</button><button type="button" class="st-arrow right" data-st-next title="Next">›</button>`;
  document.body.append(overlay);
  overlay.querySelector("[data-st-close]").onclick = (e) => {
    e.stopPropagation();
    closeStatus();
  };
  overlay.querySelector("[data-st-prev]").onclick = (e) => {
    e.stopPropagation();
    goStatus(-1);
  };
  overlay.querySelector("[data-st-next]").onclick = (e) => {
    e.stopPropagation();
    goStatus(1);
  };
  overlay.querySelector("[data-st-mute]").onclick = (e) => {
    e.stopPropagation();
    const v = overlay.querySelector("video");
    if (!v) return;
    v.muted = !v.muted;
    overlay.querySelector("[data-st-mute]").textContent = v.muted
      ? sicon("mute")
      : sicon("volume");
  };
  overlay.querySelector("[data-st-menu]").onclick = (e) => {
    e.stopPropagation();
    toggleStatusMenu();
  };
  overlay.addEventListener("pointerdown", statusPointerDown);
  overlay.addEventListener("pointerup", statusPointerUp);
  overlay.addEventListener("pointercancel", statusPointerCancel);
  document.addEventListener("keydown", statusKeys);
  statusIdx = idx;
  showStatusItem();
}

function closeStatus(silent) {
  clearStatusTimer();
  document.removeEventListener("keydown", statusKeys);
  const overlay = document.querySelector("#status-viewer");
  if (overlay) overlay.remove();
  statusSeq = [];
  statusIdx = 0;
  statusPaused = false;
  statusHolding = false;
  statusTouch = null;
  if (!silent && state.tab === "community") renderCommunity();
}

function closeStatusMenu() {
  document.querySelector("[data-st-menu-pop]")?.remove();
}

function toggleStatusMenu() {
  const overlay = document.querySelector("#status-viewer");
  if (!overlay) return;
  const existing = overlay.querySelector("[data-st-menu-pop]");
  if (existing) {
    existing.remove();
    return;
  }
  const item = statusSeq[statusIdx];
  if (!item || item.type !== "story" || !ownStory(item.id)) {
    notify("Only your own statuses can be deleted");
    return;
  }
  const pop = document.createElement("div");
  pop.className = "st-menu";
  pop.setAttribute("data-st-menu-pop", "");
  pop.innerHTML = `<button type="button" data-st-menu-del>${sicon("trash")} Delete status</button>`;
  overlay.append(pop);
  pop.querySelector("[data-st-menu-del]").onclick = (e) => {
    e.stopPropagation();
    pop.remove();
    askDeleteStatus(item);
  };
}

function askDeleteStatus(item) {
  if (!item || item.type !== "story") return;
  if (!ownStory(item.id)) {
    notify("That status no longer exists");
    return;
  }
  pauseStatus();
  closeStatusMenu();
  document.querySelector("[data-st-confirm]")?.remove();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.setAttribute("data-st-confirm", "");
  modal.innerHTML = `<div class="modal st-confirm"><h2>Delete this status?</h2><p class="muted">This status will be permanently removed.</p><p class="st-confirm-err" data-st-confirm-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-st-confirm-cancel>Cancel</button><button type="button" class="danger-button" data-st-confirm-del>Delete</button></div></div>`;
  document.body.append(modal);
  const done = (resume) => {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (resume) resumeStatus();
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      done(true);
    }
  };
  document.addEventListener("keydown", onKey);
  modal.querySelector("[data-st-confirm-cancel]").onclick = () => done(true);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) done(true);
  });
  modal.querySelector("[data-st-confirm-del]").onclick = () => {
    const btn = modal.querySelector("[data-st-confirm-del]");
    const err = modal.querySelector("[data-st-confirm-err]");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    err.hidden = true;
    setTimeout(() => {
      const result = deleteStatus(item.id);
      if (!result.ok) {
        err.textContent =
          result.error || "Couldn't delete that status. Try again.";
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = "Delete";
        return;
      }
      done(false);
      afterStatusDeleted(item.key);
      renderCommunity(); // refresh the story strip when deleted from outside the viewer
    }, 60);
  };
}

function afterStatusDeleted(key) {
  const at = statusSeq.findIndex((it) => it.key === key);
  if (at >= 0) statusSeq.splice(at, 1);
  if (!statusSeq.length) {
    closeStatus();
    return;
  }
  if (at >= 0 && at < statusIdx) statusIdx -= 1;
  statusIdx = Math.min(statusIdx, statusSeq.length - 1);
  showStatusItem();
}

function statusKeys(e) {
  if (document.querySelector("[data-st-confirm]")) return;
  if (e.key === "Escape") {
    if (document.querySelector("[data-st-menu-pop]")) {
      closeStatusMenu();
      return;
    }
    closeStatus();
    return;
  }
  if (e.key === "ArrowRight") goStatus(1);
  else if (e.key === "ArrowLeft") goStatus(-1);
  else if (e.key === " ") {
    e.preventDefault();
    if (statusPaused) resumeStatus();
    else pauseStatus();
  }
}

function goStatus(dir) {
  if (document.querySelector("[data-st-confirm]")) return;
  if (!statusSeq.length) {
    closeStatus();
    return;
  }
  statusIdx = dir > 0 ? statusNextIdx(statusIdx) : statusPrevIdx(statusIdx);
  showStatusItem();
}

function showStatusItem() {
  const overlay = document.querySelector("#status-viewer");
  const item = statusSeq[statusIdx];
  if (!overlay || !item) {
    closeStatus();
    return;
  }
  markSeen(item.key);
  const token = ++statusNavToken;
  renderStatusProgress(overlay, 0);
  const av = overlay.querySelector("[data-st-avatar]");
  if (item.author.photo)
    av.innerHTML = `<img src="${item.author.photo}" alt="">`;
  else av.textContent = item.author.fallback;
  overlay.querySelector("[data-st-name]").textContent = item.author.name;
  const stTime = overlay.querySelector("[data-st-time]");
  if (item.type === "streak") {
    // SVG markup must go through innerHTML — textContent would print the raw tags.
    stTime.innerHTML = sicon("fire") + " live stat";
  } else {
    stTime.textContent = timeAgo(item.ts);
  }
  overlay.querySelector("[data-st-mute]").style.display =
    item.kind === "video" ? "" : "none";
  overlay.querySelector("[data-st-menu]").style.display =
    item.type === "story" ? "" : "none";
  overlay.querySelector("[data-st-menu-pop]")?.remove();
  const body = overlay.querySelector("[data-st-body]");
  const cap = overlay.querySelector("[data-st-cap]");
  body.innerHTML = "";
  cap.innerHTML = "";
  if (item.type === "story" && item.kind === "photo") {
    body.innerHTML = `<img class="st-media" src="${item.photo}" alt="Story">`;
    if (item.text) cap.textContent = item.text;
    startStatusPlayback(item, token, statusDuration(item));
  } else if (item.type === "story" && item.kind === "video") {
    body.innerHTML = `<video class="st-media" src="${item.video}" muted playsinline></video>`;
    if (item.text) cap.textContent = item.text;
    const v = body.querySelector("video");
    const begin = () => startStatusPlayback(item, token, statusDuration(item));
    v.addEventListener(
      "loadedmetadata",
      () => {
        if (Number.isFinite(v.duration) && v.duration > 0)
          item.durationMs = Math.min(45000, Math.round(v.duration * 1000));
        if (token === statusNavToken && statusSeq[statusIdx] === item)
          begin();
      },
      { once: true },
    );
    v.addEventListener("ended", () => goStatus(1));
    v.addEventListener("error", () => goStatus(1));
    v.play().catch(() => {});
    if (v.readyState >= 1) begin();
  } else if (item.type === "story") {
    body.innerHTML = `<div class="st-flex"><span>${sicon("sparkle")}</span><strong>${esc(item.text || "")}</strong><small>${esc(item.author.name)}</small></div>`;
    startStatusPlayback(item, token, statusDuration(item));
  } else {
    body.innerHTML = `<div class="st-streak"><span class="st-streak-emoji">${item.emoji}</span><strong>${esc(item.title)}</strong><small>${esc(item.sub)}</small></div>`;
    startStatusPlayback(item, token, statusDuration(item));
  }
}

function renderStatusProgress(overlay, frac) {
  const bar = overlay.querySelector("[data-st-progress]");
  if (!bar) return;
  bar.innerHTML = statusSeq
    .map(
      (_, i) =>
        `<span class="st-seg${i < statusIdx ? " done" : i === statusIdx ? " current" : ""}"><i data-st-fill="${i}" style="width:${i < statusIdx ? 100 : 0}%"></i></span>`,
    )
    .join("");
  void bar.offsetWidth;
}

function setStatusFill(frac, transitionMs) {
  const overlay = document.querySelector("#status-viewer");
  if (!overlay) return;
  const fill = overlay.querySelector(`[data-st-fill="${statusIdx}"]`);
  if (!fill) return;
  fill.style.transition = transitionMs
    ? `width ${transitionMs}ms linear`
    : "none";
  fill.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
}

function startStatusPlayback(item, token, durationMs) {
  clearStatusTimer();
  statusItemDur = durationMs;
  statusElapsed = 0;
  statusPaused = false;
  statusItemStart = Date.now();
  setStatusFill(0, 0);
  requestAnimationFrame(() => setStatusFill(1, durationMs));
  statusTimer = setTimeout(() => {
    if (token === statusNavToken) goStatus(1);
  }, durationMs);
}

function pauseStatus() {
  if (statusPaused || !statusSeq.length) return;
  statusElapsed += Date.now() - statusItemStart;
  statusPaused = true;
  clearStatusTimer();
  setStatusFill(statusElapsed / statusItemDur, 0);
  const overlay = document.querySelector("#status-viewer");
  const v = overlay && overlay.querySelector("video");
  if (v) v.pause();
  if (overlay) overlay.classList.add("paused");
}

function resumeStatus() {
  if (!statusPaused || !statusSeq.length) return;
  statusPaused = false;
  statusItemStart = Date.now();
  const remaining = statusRemaining(statusElapsed, statusItemDur);
  const overlay = document.querySelector("#status-viewer");
  if (overlay) overlay.classList.remove("paused");
  setStatusFill(1, remaining);
  const v = overlay && overlay.querySelector("video");
  if (v) v.play().catch(() => {});
  const token = statusNavToken;
  statusTimer = setTimeout(() => {
    if (token === statusNavToken) goStatus(1);
  }, remaining);
}

function statusPointerDown(e) {
  if (
    e.target.closest &&
    (e.target.closest("button") || e.target.closest("[data-st-menu-pop]"))
  )
    return;
  const pop = document.querySelector("[data-st-menu-pop]");
  if (pop) {
    pop.remove();
    statusTouch = null;
    return;
  }
  statusTouch = { x: e.clientX, y: e.clientY, t: Date.now() };
  statusHolding = false;
  clearTimeout(statusHoldTimer);
  statusHoldTimer = setTimeout(() => {
    statusHolding = true;
    pauseStatus();
  }, 250);
}

function statusPointerUp(e) {
  clearTimeout(statusHoldTimer);
  if (!statusTouch) return;
  const dx = e.clientX - statusTouch.x;
  const dy = e.clientY - statusTouch.y;
  const dt = Date.now() - statusTouch.t;
  const wasHold = statusHolding;
  statusHolding = false;
  statusTouch = null;
  if (wasHold) {
    resumeStatus();
    return;
  }
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
    if (dx < 0) goStatus(1);
    else goStatus(-1);
    return;
  }
  if (dt > 600) return;
  const w = window.innerWidth || 1;
  if (e.clientX < w * 0.3) goStatus(-1);
  else if (e.clientX > w * 0.7) goStatus(1);
}

function statusPointerCancel() {
  clearTimeout(statusHoldTimer);
  if (statusHolding) {
    statusHolding = false;
    resumeStatus();
  }
  statusTouch = null;
}

// Discover's backend status pill — paints the CURRENT probe outcome onto
// whatever pill exists in the DOM, so a background refresh finishing after
// render still updates the label without re-rendering the tab.
// Per-surface pill info. "local" = the surface has no backend dependency
// (sprints are device-only; friends are local when signed out) — honest
// gray pill, no retry.
function surfacePillInfo(surface) {
  const s = surface === "groups" ? (backendConfigured ? groupsBackendStatus || "probing" : "local")
    : surface === "friends" ? (signedIn() ? friendsBackendStatus || "probing" : "local")
    : "local"; // sprints: device-only by design
  const cls = s === "ok" ? "ok" : s === "degraded" ? "degraded" : s === "local" ? "local" : s ? s : "probing";
  const label =
    s === "ok" ? "Live"
    : s === "degraded" ? "Live · reduced"
    : s === "down" ? "Backend error"
    : s === "offline" ? "Offline"
    : s === "local" ? "Local data"
    : "Connecting…";
  const title =
    s === "ok" ? (surface === "groups" ? "Group list is live from the backend" : "Connections are live from the backend")
    : s === "degraded" ? (surface === "groups" ? "Groups load, but the server is partially degraded (member counts unavailable). Run migration 018 to fix." : "Connections load, but profile names couldn't be fetched — handles are shown instead.")
    : s === "down" ? "The server responded with an error. Retrying automatically."
    : s === "offline" ? (surface === "groups" ? "Can't reach the server — showing cached groups. Check your connection." : "Can't reach the server — showing cached connections. Check your connection.")
    : s === "local" ? (surface === "sprints" ? "Sprints and challenges live entirely on this device — nothing to fetch." : "Friends are stored on this device. Sign in to sync connections.")
    : "Checking the backend…";
  return { cls, label, title, retryable: s !== "local" };
}
for (const s of ["groups", "friends", "sprints"]) registerBackendPillResolver(s, surfacePillInfo);
// Discover's pill — paints the CURRENT probe outcome onto whatever pill
// exists in the DOM, so a background refresh finishing after render still
// updates the label without re-rendering the tab.
function paintBackendStatus(root) {
  paintBackendPill("groups", root);
}

function renderDiscover(body) {
  const subjects = [
    "All subjects",
    "Mathematics",
    "Computer science",
    "Languages",
    "Medicine",
    "Arts & design",
  ];
  const activeSubject = state.groupCategory || "All subjects";
  const subjectGroups = allGroups().filter(
    (group) =>
      activeSubject === "All subjects" ||
      subjectForGroup(group) === activeSubject,
  );
  const joinedIds = get("sf-joined", []);
  const recommended = allGroups()
    .map((g) => ({ group: g, hits: groupMatches(g) }))
    .filter((x) => x.hits && !joinedIds.includes(x.group.id))
    .slice(0, 3);
  const recommendMarkup = recommended.length
    ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Recommended for you</h2><span class="tag">matched</span></div><div class="grid three">${recommended.map((x) => groupCardWithReason(x.group, x.hits)).join("")}</div></div>`
    : "";
  body.innerHTML = `${storiesMarkup()}${recommendMarkup}<div class="community-layout"><div class="card"><div class="eyebrow" style="margin-bottom:10px">Subjects</div><div class="category-list">${subjects.map((subject) => `<button type="button" class="${activeSubject === subject ? "active" : ""}" data-group-category="${subject}">${subject}</button>`).join("")}</div></div><div><div class="input-row"><input class="input" id="group-search" placeholder="Search groups and topics" aria-label="Search groups and topics"><button type="button" class="backend-pill probing" data-backend-status="groups" data-backend-retry title="Checking the backend…" aria-label="Backend status — click to retry"><i></i><span>Connecting…</span></button></div><div class="grid three" id="groups-grid">${subjectGroups.map(groupCard).join("") || '<p class="muted">No groups match this subject yet.</p>'}</div></div></div>`;
  paintBackendStatus(body);
  $$("[data-group-category]", body).forEach(
    (button) =>
      (button.onclick = () => {
        state.groupCategory = button.dataset.groupCategory;
        renderDiscover(body);
      }),
  );
  $("#group-search", body).oninput = (e) => {
    $$("#groups-grid .group-card").forEach(
      (card) =>
        (card.style.display = card.textContent
          .toLowerCase()
          .includes(e.target.value.toLowerCase())
          ? ""
          : "none"),
    );
  };
  bindGroupButtons(body);
  bindStories(body);
  // Click-to-retry: re-probe now and repaint the pill (and the grid) with
  // the fresh outcome — no full re-render needed.
  body.querySelector("[data-backend-retry]")?.addEventListener("click", async () => {
    groupsBackendStatus = null;
    paintBackendStatus(body);
    await refreshCloudGroups(true);
    paintBackendStatus(body);
    if (groupsBackendStatus === "ok" || groupsBackendStatus === "degraded") {
      const grid = $("#groups-grid", body);
      if (grid) {
        const activeSubject = state.groupCategory || "All subjects";
        const subjectGroups = allGroups().filter(
          (group) => activeSubject === "All subjects" || subjectForGroup(group) === activeSubject,
        );
        grid.innerHTML = subjectGroups.map(groupCard).join("") || '<p class="muted">No groups match this subject yet.</p>';
        bindGroupButtons(grid);
      }
    }
  });
  body.insertAdjacentHTML("beforeend", `<section class="feed-section"><div class="section-row"><div><div class="eyebrow">Community feed</div><h2 style="margin:5px 0 0">Study notes from the community</h2></div><span class="tag">${visiblePosts().length} posts</span></div><div class="card composer"><textarea class="textarea autogrow" id="post-composer" rows="2" placeholder="Share a useful study insight, milestone, or question..."></textarea><div class="composer-actions"><span class="muted">Be generous with what you learn.</span><button type="button" class="primary" id="publish-post">Publish note</button></div></div><div class="feed-list">${visiblePosts().length ? visiblePosts().map((post) => `<article class="card post" data-post="${post.id}"><div class="post-author"><div class="avatar">${avatarMarkup(post.photo, post.avatar || state.profile.avatar)}</div><div><strong>${esc(post.author || state.profile.name)}</strong><small>@${esc(post.handle || state.profile.handle)}${post.university ? ` · ${esc(post.university)}` : ""} · ${new Date(post.time).toLocaleDateString()}</small></div>${postMenuMarkup(post)}</div><div class="post-text" data-post-text="${post.id}"><p>${esc(post.text)}</p>${post.editedAt ? '<small class="muted">(edited)</small>' : ""}</div><div class="post-actions"><button type="button" data-like-post="${post.id}" class="${(post.likedBy || []).includes(postOwnerId()) ? "liked" : ""}">${(post.likedBy || []).includes(postOwnerId()) ? sicon("heart-filled") : sicon("heartOutline")} ${post.likes || 0}</button><button type="button" data-comment-toggle="${post.id}">${sicon("chat")} ${(post.comments || []).length ? `${post.comments.length} ` : ""}Comments</button></div><div class="post-comments" data-comments="${post.id}" hidden></div></article>`).join("") : '<div class="card empty-state"><div class="emoji">' + sicon("sparkle") + '</div><h3>The feed is waiting for your first note</h3><p class="muted">Share a small insight and make someone else’s study session easier.</p></div>'}</div></section>`);
  bindFeed(body);
}

function postOwnerId() {
  return state.user?.id || state.deviceId || "local";
}
function visiblePosts() {
  const names = new Set(
    Object.values(state.blocks || {})
      .map((b) => b.username)
      .filter(Boolean),
  );
  return (state.posts || []).filter(
    (p) => !names.has(p.handle) && !names.has(p.author),
  );
}
function postMenuMarkup(post) {
  const own = isOwnPost(post);
  return `<div class="post-menu-wrap"><button type="button" class="icon-btn post-menu-btn" data-post-menu="${post.id}" title="Note options" aria-label="Note options">⋮</button><div class="post-menu" data-post-pop="${post.id}" hidden>${own ? `<button type="button" data-post-edit="${post.id}">Edit</button><button type="button" class="danger" data-post-del="${post.id}">Delete</button>` : `<button type="button" data-post-block="${esc(post.handle || post.author || "")}" data-post-name="${esc(post.author || post.handle || "this user")}">Block author</button>`}</div></div>`;
}
function isOwnPost(p) {
  if (!p) return false;
  if (p.ownerId) return p.ownerId === postOwnerId();
  return p.handle === state.profile.handle;
}
function closePostMenus() {
  document.querySelectorAll("[data-post-pop],[data-chat-pop]").forEach((el) => {
    el.hidden = true;
  });
}
function togglePostMenu(id) {
  const pop = document.querySelector(`[data-post-pop="${id}"]`);
  if (!pop) return;
  const open = pop.hidden;
  closePostMenus();
  pop.hidden = !open;
}
function startPostEdit(id) {
  const post = state.posts.find((p) => p.id === id);
  if (!post || !isOwnPost(post))
    return notify("You can only edit your own notes");
  closePostMenus();
  const article = document.querySelector(`[data-post="${id}"]`);
  const wrap = article && article.querySelector("[data-post-text]");
  if (!wrap) return;
  wrap.innerHTML = `<textarea class="textarea autogrow" data-post-editor rows="3">${esc(post.text)}</textarea><div class="post-edit-actions"><button type="button" class="ghost" data-post-cancel>Cancel</button><button type="button" class="primary" data-post-save>Save</button></div>`;
  const ed = wrap.querySelector("[data-post-editor]");
  fitTextarea(ed);
  try {
    ed.focus();
  } catch {
    /* ignore */
  }
  wrap.querySelector("[data-post-cancel]").onclick = () => renderCommunity();
  wrap.querySelector("[data-post-save]").onclick = () => {
    const v = ed.value.trim();
    if (!v) return notify("Note cannot be empty");
    const fresh = state.posts.find((p) => p.id === id);
    if (!fresh || !isOwnPost(fresh))
      return notify("You can only edit your own notes");
    fresh.text = v;
    fresh.editedAt = Date.now();
    persist();
    renderCommunity();
    notify("Note updated");
  };
}
function askDeletePost(id) {
  const post = state.posts.find((p) => p.id === id);
  if (!post || !isOwnPost(post))
    return notify("You can only delete your own notes");
  closePostMenus();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Delete note</div><h2>Delete this study note?</h2><p class="muted">This action cannot be undone.</p><p class="st-confirm-err" data-post-del-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-post-del-cancel>Cancel</button><button type="button" class="danger-button" data-post-del-go>Delete</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-post-del-err]");
  const go = modal.querySelector("[data-post-del-go]");
  modal.querySelector("[data-post-del-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal && !go.disabled) modal.remove();
  });
  go.onclick = () => {
    go.disabled = true;
    go.textContent = "Deleting…";
    err.hidden = true;
    setTimeout(() => {
      const fresh = state.posts.find((p) => p.id === id);
      if (!fresh || !isOwnPost(fresh)) {
        err.textContent = "That note is already gone or is not yours.";
        err.hidden = false;
        go.disabled = false;
        go.textContent = "Delete";
        return;
      }
      state.posts = state.posts.filter((p) => p.id !== id);
      persist();
      modal.remove();
      renderCommunity();
      notify("Note deleted");
    }, 60);
  };
}
function bindFeed(root) {
  const publish = $("#publish-post", root);
  if (publish)
    publish.onclick = () => {
      if (!requireAuth("share notes with the community")) return;
      const input = $("#post-composer", root);
      if (!input.value.trim())
        return notify("Write something before publishing");
      state.posts.unshift({
        id: uid(),
        text: input.value.trim(),
        author: state.profile.name,
        handle: state.profile.handle,
        ownerId: postOwnerId(),
        avatar: state.profile.avatar,
        photo: state.profile.photo || "",
        university: state.profile.university || "",
        time: Date.now(),
        likes: 0,
        likedBy: [],
        comments: [],
      });
      persist();
      addNotification(
        "Note published",
        "Your study note is now visible in the community feed.",
        "sparkle",
      );
      renderCommunity();
      notify("Note published");
    };
  $$("[data-like-post]", root).forEach(
    (button) =>
      (button.onclick = () => {
        const post = state.posts.find(
          (item) => item.id === button.dataset.likePost,
        );
        if (!post) return;
        // Toggling: a second tap takes the like back instead of inflating
        // the counter, and the count always mirrors who actually liked it.
        const me = postOwnerId();
        const likedBy = new Set(post.likedBy || []);
        if (likedBy.has(me)) likedBy.delete(me);
        else likedBy.add(me);
        post.likedBy = [...likedBy];
        post.likes = likedBy.size;
        persist();
        renderCommunity();
      }),
  );
  $$("[data-comment-toggle]", root).forEach(
    (b) =>
      (b.onclick = () => {
        const box = $(`[data-comments="${b.dataset.commentToggle}"]`, root);
        if (!box) return;
        if (box.hidden) {
          renderComments(box, b.dataset.commentToggle);
          box.hidden = false;
        } else {
          box.hidden = true;
        }
      }),
  );
  if (!window.__sfPostMenuBound) {
    window.__sfPostMenuBound = true;
    document.addEventListener("click", (e) => {
      if (
        e.target.closest &&
        e.target.closest(
          "[data-post-pop],[data-post-menu],[data-chat-pop],[data-chat-menu]",
        )
      )
        return;
      closePostMenus();
      document
        .querySelectorAll("[data-chat-pop]")
        .forEach((el) => (el.hidden = true));
    });
  }
  $$("[data-post-menu]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        togglePostMenu(b.dataset.postMenu);
      }),
  );
  $$("[data-post-edit]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        startPostEdit(b.dataset.postEdit);
      }),
  );
  $$("[data-post-del]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        askDeletePost(b.dataset.postDel);
      }),
  );
  $$("[data-post-block]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        closePostMenus();
        askBlockUser({
          username: b.dataset.postBlock,
          name: b.dataset.postName || b.dataset.postBlock,
        });
      }),
  );
}

function renderComments(box, postId) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return;
  const comments = post.comments || [];
  box.innerHTML = `${comments.map((c) => `<div class="comment"><div class="avatar avatar-sm">${avatarMarkup(c.photo, c.avatar || "?")}</div><div class="comment-body"><strong>${esc(c.author)}</strong><small> @${esc(c.handle)} · ${new Date(c.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</small><p>${esc(c.text)}</p></div></div>`).join("")}<div class="input-row"><textarea class="input autogrow" data-comment-input rows="1" placeholder="Write a comment... (Shift + Enter for a new line)" aria-label="Write a comment"></textarea><button type="button" class="primary" data-comment-send>Post</button></div>`;
  const input = $("[data-comment-input]", box);
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    post.comments = [
      ...(post.comments || []),
      {
        id: uid(),
        author: state.profile.name,
        handle: state.profile.handle,
        avatar: state.profile.avatar,
        photo: state.profile.photo || "",
        text,
        time: Date.now(),
      },
    ];
    persist();
    renderComments(box, postId);
    const toggle = $(`[data-comment-toggle="${postId}"]`);
    if (toggle)
      toggle.innerHTML = `${sicon("chat")} ${post.comments.length} Comments`;
  };
  $("[data-comment-send]", box).onclick = send;
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };
}

function subjectForGroup(group) {
  const text = `${group.name} ${(group.tags || []).join(" ")}`.toLowerCase();
  if (text.includes("calculus") || text.includes("math")) return "Mathematics";
  if (text.includes("web") || text.includes("ai") || text.includes("computer"))
    return "Computer science";
  if (text.includes("language") || text.includes("english")) return "Languages";
  if (text.includes("medicine") || text.includes("clinical")) return "Medicine";
  if (text.includes("art") || text.includes("design")) return "Arts & design";
  return "All subjects";
}

function groupCard(g) {
  const joined = get("sf-joined", []).includes(g.id);
  const vis = g.visibility === "private"
    ? `<span class="tag" title="Invite-only">${sicon("lock")} private</span>`
    : (g.source === "cloud" ? `<span class="tag" title="Listed in Discover">public</span>` : "");
  const role = g.myRole && g.myRole !== "member" ? `<span class="tag">${esc(g.myRole)}</span>` : "";
  return `<article class="card group-card"><div class="group-top">${groupAvatarMarkup(g)}<div><h3>${esc(g.name)}</h3><span class="muted">${g.members || 1} learners</span> ${vis}${role}</div></div><p class="muted" style="margin-top:13px">${esc(g.description)}</p><div>${(g.tags || []).map((tag) => `<span class="tag" style="margin-right:4px">#${esc(tag)}</span>`).join("")}</div><div class="actions">${joined ? `<button type="button" class="primary" data-open-group="${g.id}" style="flex:1;padding:9px">Open chat</button><button type="button" class="ghost" data-leave-group="${g.id}">Leave</button>` : `<button type="button" class="ghost" data-join-group="${g.id}" style="flex:1">Join group</button>`}</div></article>`;
}

function bindGroupButtons(root) {
  $$("[data-join-group]", root).forEach(
    (b) =>
      (b.onclick = () => {
        if (!requireAuth("join study groups")) return;
        const joined = get("sf-joined", []);
        save("sf-joined", [...new Set([...joined, b.dataset.joinGroup])]);
        notify("Group joined");
        renderCommunity();
        if (backendConfigured && state.user) {
          joinCloudGroup(b.dataset.joinGroup).catch(() => {});
        }
      }),
  );
  $$("[data-open-group]", root).forEach(
    (b) =>
      (b.onclick = () => {
        state.subtab = "messages";
        state.activeChat = b.dataset.openGroup;
        renderCommunity();
      }),
  );
  $$("[data-leave-group]", root).forEach(
    (b) =>
      (b.onclick = () => {
        save(
          "sf-joined",
          get("sf-joined", []).filter((id) => id !== b.dataset.leaveGroup),
        );
        renderCommunity();
        if (signedIn()) {
          // Server-side leave (handles owner transfer server-side); falls
          // back to the legacy membership delete on older projects.
          groupLeave(b.dataset.leaveGroup).then(({ error } = {}) => {
            if (error && !isPhase7Missing(error)) {
              leaveCloudGroup(b.dataset.leaveGroup).catch(() => {});
            }
            refreshCloudGroups(true).catch(() => {});
          }).catch(() => {});
        } else if (backendConfigured && state.user) {
          leaveCloudGroup(b.dataset.leaveGroup).catch(() => {});
        }
      }),
  );
}

function renderMyGroups(body) {
  body.innerHTML = `<div class="card" style="margin-bottom:18px"><h2>Create a study group</h2><div class="grid two"><input class="input" id="new-group-name" placeholder="Group name"><select class="select" id="new-group-logo" aria-label="Group icon" style="max-width:190px">${["book", "fire", "star", "target", "users", "globe", "rocket", "palette", "music", "brain", "chat", "trophy"].map((n) => `<option value="${n}">${n[0].toUpperCase() + n.slice(1)}</option>`).join("")}</select><input class="input" id="new-group-focus" placeholder="Focus topics, separated by commas"><select class="select" id="new-group-vis" aria-label="Group visibility" title="Private groups stay invite-only; public groups appear in Discover"><option value="private">Private — invite only</option><option value="public">Public — listed in Discover</option></select><textarea class="textarea autogrow" id="new-group-description" placeholder="Describe what your group studies"></textarea></div><p class="muted" style="margin:8px 0 0">Private groups stay invite-only. Public groups appear in Discover for everyone.</p><button type="button" class="primary" id="create-group" style="margin-top:12px">Create group</button></div><div class="grid three">${
    allGroups()
      .filter((g) => get("sf-joined", []).includes(g.id))
      .map(groupCard)
      .join("") ||
    '<p class="muted">No groups yet. Create one above — private stays invite-only, public appears in Discover.</p>'
  }</div>`;
  $("#create-group", body).onclick = async () => {
    if (!requireAuth("create study groups")) return;
    const name = $("#new-group-name").value.trim(),
      desc = $("#new-group-description").value.trim();
    if (!name || !desc) return notify("Add a name and description first");
    const logo = $("#new-group-logo")?.value || "book";
    const tags = $("#new-group-focus").value.split(",").map((x) => x.trim()).filter(Boolean);
    const visibility = $("#new-group-vis")?.value === "public" ? "public" : "private";
    // Signed-in users create the group on the server (roles + RLS enforced
    // there); the entry below is an optimistic mirror replaced on refresh.
    if (signedIn()) {
      const btn = $("#create-group", body);
      btn.disabled = true;
      btn.textContent = "Creating…";
      try {
        const { data, error } = await groupCreate({ name, description: desc, logo, topics: tags, visibility });
        if (error) throw error;
        const g = {
          id: data.id, name, emoji: sicon(logo), logoName: logo,
          ownerId: state.user.id, description: desc, tags, members: 1,
          visibility, color: "#47765a", source: "cloud", myRole: "owner",
        };
        cloudGroups = [g, ...cloudGroups.filter((x) => x.id !== g.id)];
        cloudGroupsAt = Date.now();
        save("sf-joined", [...new Set([...get("sf-joined", []), g.id])]);
        notify(visibility === "public" ? "Group created — listed in Discover" : "Private group created — invite members from the chat");
        renderCommunity();
        refreshCloudGroups(true).then(() => {
          if (state.tab === "community") renderCommunity();
        }).catch(() => {});
        return;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Create group";
        if (isPhase7Missing(err)) {
          notify("Cloud groups need the latest database update — saved on this device instead");
        } else if (!navigator.onLine) {
          notify("You're offline — group saved on this device");
        } else {
          notify("Couldn't create the group — " + String(err?.message || err).slice(0, 120));
          return;
        }
      }
    }
    const g = {
      id: "custom-" + uid(),
      name,
      emoji: sicon(logo),
      logoName: logo,
      ownerId: chatKey(),
      description: desc,
      tags,
      members: 1,
      visibility: "public",
      color: "#47765a",
    };
    state.customGroups.push(g);
    save("sf-groups", state.customGroups);
    const joined = get("sf-joined", []);
    save("sf-joined", [...joined, g.id]);
    notify("Group created — it is public and joinable");
    renderCommunity();
    // Cloud copy: signed-in users get their group shared with everyone, plus an
    // owner membership row so group chat inserts pass RLS on the server.
    if (backendConfigured && state.user) {
      try {
        await createCloudGroup({
          id: g.id, name: g.name, description: g.description,
          logo: g.logoName || "book", focus_topics: g.tags,
          visibility: "public",
        });
        await joinCloudGroup(g.id, "owner");
        await refreshCloudGroups(true);
      } catch {
        notify("Group saved on this device; cloud sync failed");
      }
    }
  };
  bindGroupButtons(body);
}

function inviteText() {
  // A link first: friends open it, land straight on the site, then add the
  // username. Plain-text-only invites made people guess where to go.
  const url = `${window.location.origin}${window.location.pathname}`;
  return `Join me on StudyFlow 📚 — ${url} — add me with the username @${state.profile.handle}!`;
}

function myReferralCode() {
  if (!state.referrals) state.referrals = { code: "", redeemed: [] };
  if (!state.referrals.code) {
    const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let c = "";
    for (let i = 0; i < 6; i++)
      c += abc[Math.floor(Math.random() * abc.length)];
    state.referrals.code = "SF-" + c;
    persist();
  }
  return state.referrals.code;
}

function referralMarkup() {
  const code = myReferralCode();
  const count = (state.referrals.redeemed || []).length;
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Referral rewards</h2><span class="tag">+30 ${sicon("coin")}</span></div><p class="muted">Your code <strong>${esc(code)}</strong> · ${count} redeemed. Friends who redeem it get +30 coins instantly — yours lands when cloud accounts connect.</p><div class="input-row"><input class="input" id="referral-code" placeholder="Enter a friend's code" aria-label="Referral code"><button type="button" class="primary" id="referral-redeem">Redeem</button><button type="button" class="ghost" id="referral-share">Share mine</button></div></div>`;
}

function redeemReferral(root) {
  const input = $("#referral-code", root);
  const code = (input?.value || "").trim().toUpperCase();
  if (!/^SF-[A-Z0-9]{6}$/.test(code))
    return notify("Codes look like SF-AB12CD");
  if (code === myReferralCode())
    return notify("That's your own code — share it instead");
  const redeemed = state.referrals.redeemed || [];
  if (redeemed.includes(code)) return notify("Code already redeemed");
  redeemed.push(code);
  state.referrals.redeemed = redeemed;
  try {
    secureEarn({ amount: 30, reason: "Referral redeemed", refKey: `referral:${code}` }).catch(() => {});
  } catch {
    addCoins(30);
  }
  persist();
  renderCommunity();
  celebrate(false);
  notify("Referral accepted · +30 coins");
}

let friendSearch = { q: "", results: [], searching: false };
function cloudFriendsMarkup() {
  const incoming = cloudFriendReqs.filter((r) => r.incoming);
  const outgoing = cloudFriendReqs.filter((r) => !r.incoming);
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Connections</h2><span class="tag">${cloudFriends.length} connected${incoming.length ? ` · ${incoming.length} request${incoming.length === 1 ? "" : "s"}` : ""}</span></div>`
    + (incoming.length ? `<div class="eyebrow" style="margin:8px 0 6px">Requests</div><div class="grid">${incoming.map((r) => `<div class="task conn-row" data-profile-user="${esc(r.otherId)}" data-profile-handle="${esc(r.handle)}" data-profile-name="${esc(r.name)}" data-profile-photo="${esc(r.photo || "")}" data-profile-bio="${esc(r.bio || "")}" data-profile-state="request-in">${friendAvatarMarkup(r.otherId, r.handle, r.name)}<span class="task-text"><strong>@${esc(r.handle)}</strong><br><small class="muted">${esc(r.name)}</small></span><span class="friend-actions"><button type="button" class="primary" data-fr-accept="${r.id}">Accept</button><button type="button" class="ghost" data-fr-decline="${r.id}">Decline</button></span></div>`).join("")}</div>` : "")
    + (cloudFriends.length ? `<div class="grid" style="margin-top:10px">${cloudFriends.map((f) => {
      const stories = cloudStories.filter((s) => s.userId === f.id);
      return `<div class="task conn-row" data-profile-user="${esc(f.id)}" data-profile-handle="${esc(f.handle)}" data-profile-name="${esc(f.name)}" data-profile-photo="${esc(f.photo || "")}" data-profile-bio="${esc(f.bio || "")}" data-profile-state="friends">${friendAvatarMarkup(f.id, f.handle, f.name)}<span class="task-text"><strong>@${esc(f.handle)}</strong><br><small class="muted">${esc(f.name)}</small></span><span class="friend-actions">${stories.length ? `<button type="button" class="story-dot ${stories.every((s) => isSeen("cstory:" + s.id)) ? "seen" : ""}" data-fr-story="${esc(f.id)}" title="View @${esc(f.handle)}'s status">●</button>` : ""}<button type="button" class="ghost" data-fr-msg="${f.id}">Message</button><button type="button" class="ghost" data-fr-unfriend="${f.id}">Remove</button></span></div>`;
    }).join("")}</div>`
      : '<p class="muted">No connections yet — add friends with the box above.</p>')
    + (outgoing.length ? `<div class="eyebrow" style="margin:10px 0 6px">Sent (${outgoing.length})</div><div class="grid">${outgoing.map((r) => `<div class="task conn-row" data-profile-user="${esc(r.otherId)}" data-profile-handle="${esc(r.handle)}" data-profile-name="${esc(r.name)}" data-profile-photo="${esc(r.photo || "")}" data-profile-bio="${esc(r.bio || "")}" data-profile-state="request-out">${friendAvatarMarkup(r.otherId, r.handle, r.name)}<span class="task-text"><strong>@${esc(r.handle)}</strong><br><small class="muted">pending</small></span><span class="friend-actions"><button type="button" class="ghost" data-fr-cancel="${r.id}">Cancel</button></span></div>`).join("")}</div>` : "")
    + `</div>`;
}
function bindCloudFriends(body) {
  if (!signedIn()) return;
  // Repaint only when the data actually changed — otherwise the
  // refresh-then-render cycle would loop forever.
  const before = cloudSocialSig();
  refreshCloudSocial(false).then(() => {
    paintBackendPill("friends", body);
    if (state.tab === "community" && state.subtab === "friends" && cloudSocialSig() !== before) renderCommunity();
  }).catch(() => {});
  bindHoverProfiles(body);
  const input = $("#friend-search", body);
  let t = 0;
  input?.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      friendSearch.q = input.value.trim();
      const box = $("#friend-search-results", body);
      if (friendSearch.q.length < 2) {
        friendSearch.results = [];
        if (box) renderFriends(body);
        return;
      }
      friendSearch.searching = true;
      if (box) box.innerHTML = '<p class="muted">Searching…</p>';
      try {
        const { data, error } = await searchUsers(friendSearch.q, 8);
        if (error) throw error;
        friendSearch.results = Array.isArray(data) ? data : [];
      } catch {
        friendSearch.results = [];
      }
      friendSearch.searching = false;
      if (state.subtab === "friends") renderFriends(body);
    }, 350);
  });
  $$("[data-fr-add]", body).forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const { error } = await sendFriendRequest(b.dataset.frAdd);
    notify(error ? "Couldn't send — " + String(error.message).slice(0, 90) : "Request sent");
    await refreshCloudSocial(true).catch(() => {});
    if (state.subtab === "friends") renderFriends(body);
  }));
  $$("[data-fr-story]", body).forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const hit = cloudStories.find((s) => s.userId === b.dataset.frStory);
    if (!hit) return;
    const items = cloudStories
      .filter((s) => s.userId === hit.userId)
      .sort((a, b2) => new Date(a.createdAt) - new Date(b2.createdAt));
    openStoryViewer(items, Math.max(0, items.findIndex((s) => !isSeen("cstory:" + s.id))));
  }));
  $$("[data-fr-accept]", body).forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const { error } = await respondFriendRequest(b.dataset.frAccept, true);
    notify(error ? "Couldn't accept — " + String(error.message).slice(0, 90) : "Connected — they were notified");
    await refreshCloudSocial(true).catch(() => {});
    if (state.subtab === "friends") renderFriends(body);
  }));
  $$("[data-fr-decline]", body).forEach((b) => (b.onclick = async () => {
    await respondFriendRequest(b.dataset.frDecline, false);
    await refreshCloudSocial(true).catch(() => {});
    if (state.subtab === "friends") renderFriends(body);
  }));
  $$("[data-fr-cancel]", body).forEach((b) => (b.onclick = async () => {
    const req = cloudFriendReqs.find((r) => r.id === b.dataset.frCancel);
    if (req) await removeFriend(req.otherId).catch(() => {});
    await refreshCloudSocial(true).catch(() => {});
    if (state.subtab === "friends") renderFriends(body);
  }));
  $$("[data-fr-unfriend]", body).forEach((b) => (b.onclick = () => {
    confirmBox("Remove this connection?", "You will stop seeing each other's updates and DMs will close.", async () => {
      await removeFriend(b.dataset.frUnfriend).catch(() => {});
      await refreshCloudSocial(true).catch(() => {});
      if (state.subtab === "friends") renderFriends(body);
      notify("Connection removed");
    });
  }));
  $$("[data-fr-msg]", body).forEach((b) => (b.onclick = () => {
    state.subtab = "messages";
    state.activeChat = b.dataset.frMsg;
    renderCommunity();
  }));
}
// Live search-as-you-type in the "Add friend" box: every keystroke queries
// the locked-down directory and floats matching users right under the input.
// Picking a result sends a real friend request (cloud) — typing never gets
// blocked, and results vanish on clear. Local-only visitors just see the
// sign-in nudge when they try to add.
let friendNameSearch = { q: "", results: [], searching: false, token: 0 };
function friendNameSearchMarkup(q) {
  const s = friendNameSearch;
  if (!q || q.length < 2) return "";
  if (s.searching) return '<p class="muted" style="margin:4px 0">Searching…</p>';
  if (!s.results.length) return '<p class="muted" style="margin:4px 0">No users found — check the spelling.</p>';
  return s.results.map((u) => {
    const known = cloudFriends.some((f) => f.id === u.id) || cloudFriendReqs.some((r) => r.otherId === u.id) || (state.friends || []).some((f) => f.username === u.handle);
    return `<button type="button" class="pick-row friend-search-hit" data-fs-add="${u.id}" data-fs-handle="${esc(u.handle || "?")}" role="option" aria-label="Add ${esc(u.handle || "user")}"><span class="crew-avatar sm">${esc(((u.handle || "?")[0] || "?").toUpperCase())}</span><span style="flex:1;min-width:0"><strong style="display:block">@${esc(u.handle || "?")}</strong><small class="muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.name || "")}</small></span>${known ? '<span class="tag">added</span>' : '<span class="tag live">add</span>'}</button>`;
  }).join("");
}
function paintFriendNameSearch(body) {
  const pop = $("#friend-search-pop", body);
  const input = $("#friend-name", body);
  if (!pop || !input) return;
  const q = input.value.trim().replace(/^@/, "");
  const html = friendNameSearchMarkup(q);
  pop.innerHTML = html;
  const open = Boolean(html) || friendNameSearch.searching && q.length >= 2;
  pop.hidden = !open;
  input.setAttribute("aria-expanded", open ? "true" : "false");
  $$("[data-fs-add]", pop).forEach((b) => (b.onclick = async () => {
    if (!signedIn()) {
      requireAuth("add study buddies");
      return;
    }
    const handle = b.dataset.fsHandle;
    b.disabled = true;
    b.querySelector(".tag")?.replaceChildren("…");
    const { error } = await sendFriendRequest(b.dataset.fsAdd);
    notify(error ? "Couldn't send request — " + String(error.message).slice(0, 90) : `Request sent to @${handle}`);
    await refreshCloudSocial(true).catch(() => {});
    paintFriendNameSearch(body);
  }));
}
function bindFriendNameSearch(body) {
  const input = $("#friend-name", body);
  if (!input) return;
  let t = 0;
  input.addEventListener("input", () => {
    clearTimeout(t);
    const q = input.value.trim().replace(/^@/, "");
    if (q.length < 2) {
      friendNameSearch = { q: "", results: [], searching: false, token: friendNameSearch.token + 1 };
      paintFriendNameSearch(body);
      return;
    }
    friendNameSearch.searching = true;
    paintFriendNameSearch(body);
    t = setTimeout(async () => {
      const token = ++friendNameSearch.token;
      friendNameSearch.q = q;
      try {
        const { data, error } = await searchUsers(q, 8);
        if (token !== friendNameSearch.token) return; // a newer keystroke won
        friendNameSearch.results = error || !Array.isArray(data) ? [] : data;
      } catch {
        if (token !== friendNameSearch.token) return;
        friendNameSearch.results = [];
      }
      friendNameSearch.searching = false;
      if (input.isConnected) paintFriendNameSearch(body);
    }, 250);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const pop = $("#friend-search-pop", body);
      if (pop && !pop.hidden) {
        e.stopPropagation();
        pop.hidden = true;
        input.setAttribute("aria-expanded", "false");
      }
    } else if (e.key === "Enter") {
      // Enter in the input should still fall through to the existing
      // add flow — just close the dropdown first so the render doesn't eat it.
      const pop = $("#friend-search-pop", body);
      if (pop) pop.hidden = true;
    }
  });
  input.addEventListener("blur", () => {
    // Defer: a pointerdown on a result must win over the blur close.
    setTimeout(() => {
      const pop = $("#friend-search-pop", body);
      if (pop && !pop.contains(document.activeElement)) {
        pop.hidden = true;
        input.setAttribute("aria-expanded", "false");
      }
    }, 150);
  });
}

function renderFriends(body) {
  body.innerHTML = `<div class="card" style="margin-bottom:18px"><h2>Invite study buddies</h2><p class="muted">Send this link — friends open it, sign up, and add you in seconds.</p><div class="input-row"><input class="input" id="invite-link" readonly value="${esc(inviteText())}"><button type="button" class="primary" id="copy-invite">Copy link</button><button type="button" class="ghost" id="share-invite">Share</button><button type="button" class="backend-pill probing" data-backend-status="friends" data-backend-retry title="Checking the backend…" aria-label="Backend status — click to retry"><i></i><span>Connecting…</span></button></div></div>${signedIn() ? cloudFriendsMarkup() : ""}${referralMarkup()}<div class="card"><h2>Friends &amp; gifting</h2><p class="muted">Add study partners here. They will also appear as gift recipients in the Rewards store.</p><div class="input-row" style="position:relative" id="friend-add-row"><input class="input" id="friend-name" placeholder="Username" aria-label="Friend username" autocomplete="off" role="combobox" aria-controls="friend-search-pop"><button type="button" class="primary" id="add-friend">Add friend</button><div class="friend-pick drop" id="friend-search-pop" role="listbox" hidden></div></div><div class="grid">${state.friends.map((f) => { const cf = cloudFriendReqsById(f.id); return `<div class="task" data-profile-user="${esc(f.id)}" data-profile-handle="${esc(f.username)}" data-profile-name="${esc(cf?.name || f.username)}" data-profile-photo="${esc(cf?.photo || "")}" data-profile-bio="${esc(cf?.bio || "")}" data-profile-state="friends"><div class="avatar">${friendAvatarMarkup(f.id, f.username, cf?.name)}</div><span class="task-text">@${esc(f.username)}</span><span class="friend-actions"><button type="button" class="ghost" data-chat-friend="${f.id}">Message</button><button type="button" class="ghost" data-block-friend="${f.id}">Block</button><button type="button" class="delete" data-remove-friend="${f.id}" title="Remove friend">×</button></span></div>`; }).join("") || '<p class="muted">Add a friend to send gifts and messages.</p>'}</div>${blockedSectionMarkup()}</div></div>`;
  paintBackendPill("friends", body);
  bindHoverProfiles(body);
  // Click-to-retry: re-probe friendships, repaint the pill, and refresh the
  // connections list — but never while the user is mid-action (a half-typed
  // invite or open menu outlives the click; the next render picks it up).
  body.querySelector('[data-backend-retry][data-backend-status="friends"]')?.addEventListener("click", async () => {
    if (!signedIn()) return; // "Local data" pill — no backend to retry
    friendsBackendStatus = null;
    paintBackendPill("friends", body);
    await refreshCloudSocial(true);
    paintBackendPill("friends", body);
    if (state.tab === "community" && !userIsBusy()) renderFriends(body);
  });
  bindCloudFriends(body);
  $("#add-friend", body).onclick = async () => {
    if (!requireAuth("add study buddies")) return;
    const input = $("#friend-name");
    const name = input.value.trim().replace(/^@/, "");
    if (!name) return;
    input.value = "";
    const pop = $("#friend-search-pop", body);
    if (pop) pop.hidden = true;
    if ((state.friends || []).some((f) => (f.username || "").toLowerCase() === name.toLowerCase()))
      return notify("Friend already added");
    // Signed in: resolve the handle through the directory and send a REAL
    // request. Keeping the real cloud id makes messages, sprints and
    // schedules map to the actual account instead of a local-only stand-in.
    if (signedIn()) {
      try {
        const { data, error } = await searchUsers(name, 8);
        if (error) throw error;
        const match = (data || []).find((u) => String(u.handle || "").toLowerCase() === name.toLowerCase()) || (data || []).find((u) => String(u.handle || "").toLowerCase().startsWith(name.toLowerCase()));
        if (match) {
          if (cloudFriends.some((f) => f.id === match.id)) {
            if (!(state.friends || []).some((f) => f.id === match.id)) {
              state.friends.push({ id: match.id, username: match.handle, name: match.name });
              persist();
            }
            renderFriends(body);
            return alreadyFriendsDialog(match);
          }
          const { error: reqErr } = await sendFriendRequest(match.id);
          if (reqErr) {
            notify("Couldn't send request — " + String(reqErr.message).slice(0, 90));
          } else {
            state.friends.push({ id: match.id, username: match.handle, name: match.name });
            persist();
            notify(`Request sent to @${match.handle}`);
            refreshCloudSocial(true).catch(() => {});
          }
          renderFriends(body);
          return;
        }
        notify(`No user named “${name}” — added locally for now`);
      } catch {
        notify("Couldn't reach the directory — added locally for now");
      }
    }
    state.friends.push({ id: uid(), username: name });
    persist();
    renderFriends(body);
  };
  bindFriendNameSearch(body);
  $("#referral-redeem", body).onclick = () => redeemReferral(body);
  $("#referral-share", body).onclick = async () => {
    const text = `Join me on StudyFlow 📚 — redeem my code ${myReferralCode()} for +30 coins!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "StudyFlow referral", text });
      } catch {
        /* dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify("Referral copied");
    } catch {
      notify("Copy this code: " + myReferralCode());
    }
  };
  const copyInvite = async () => {
    const text = $("#invite-link", body).value;
    try {
      await navigator.clipboard.writeText(text);
      notify("Invite copied — share it anywhere");
    } catch {
      $("#invite-link", body).select();
      document.execCommand?.("copy");
      notify("Invite copied — share it anywhere");
    }
  };
  $("#copy-invite", body).onclick = copyInvite;
  $("#share-invite", body).onclick = async () => {
    const text = $("#invite-link", body).value;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join me on StudyFlow", text });
      } catch {
        /* dismissed */
      }
      return;
    }
    copyInvite();
  };
  $$("[data-chat-friend]", body).forEach(
    (b) =>
      (b.onclick = () => {
        state.subtab = "messages";
        state.activeChat = b.dataset.chatFriend;
        renderCommunity();
      }),
  );
  $$("[data-remove-friend]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const f = (state.friends || []).find(
          (x) => x.id === b.dataset.removeFriend,
        );
        confirmBox(
          `Remove @${f ? f.username : "friend"}?`,
          "They will leave your friends list. You can add them back later.",
          () => {
            state.friends = (state.friends || []).filter(
              (x) => x.id !== b.dataset.removeFriend,
            );
            persist();
            renderFriends(body);
            notify("Friend removed");
          },
        );
      }),
  );
  $$("[data-block-friend]", body).forEach(
    (b) =>
      (b.onclick = () => {
        const f = (state.friends || []).find(
          (x) => x.id === b.dataset.blockFriend,
        );
        if (!f) return;
        askBlockUser({
          id: f.id,
          username: f.username,
          name: "@" + f.username,
          context: "friends",
        });
      }),
  );
  $$("[data-unblock]", body).forEach(
    (b) => (b.onclick = () => unblockUser(b.dataset.unblock)),
  );
}

// ---- Friends picker modal (sprints / sessions / private-group invites) -----
// One polished surface with a checkbox beside every friend, replacing the
// cramped inline dropdowns. selectedIds() lets callers pre-tick friends.
let friendPicker = null; // { title, eyebrow, note, cta, selected:Set, onDone }
function friendsPickerSource() {
  const seen = new Set();
  const out = [];
  for (const f of cloudFriends) {
    if (!f || !f.id || seen.has(f.id) || cloudBlocked.has(f.id)) continue;
    seen.add(f.id);
    out.push({ id: f.id, handle: f.handle, name: f.name, photo: f.photo || "" });
  }
  return out;
}
function openFriendsPicker({ title, eyebrow = "Choose friends", note = "", cta = "Send invites", selected = [], onDone }) {
  const friends = friendsPickerSource();
  if (!friends.length) {
    state.subtab = "friends";
    renderCommunity();
    notify("Add friends first — then pick them here");
    return;
  }
  friendPicker = { title, eyebrow, note, cta, selected: new Set(selected), onDone };
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "friends-picker-modal";
  modal.innerHTML = `<div class="modal friends-picker"><div class="fp-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2>${note ? `<p class="muted">${esc(note)}</p>` : ""}</div><span class="fp-count" data-fp-count></span></div><div class="fp-list" data-fp-list>${friends.map(fpRowHtml).join("")}</div><div class="modal-actions fp-actions"><button type="button" class="ghost" data-fp-cancel>Cancel</button><button type="button" class="primary" data-fp-done>${esc(cta)}</button></div></div>`;
  $("#modal-root").append(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeFriendsPicker();
  });
  modal.querySelector("[data-fp-cancel]").onclick = closeFriendsPicker;
  modal.querySelectorAll("[data-fp-id]").forEach((row) => {
    row.onclick = (e) => {
      e.stopPropagation();
      fpToggle(row.dataset.fpId, row);
    };
  });
  fpPaintCount();
  modal.querySelector("[data-fp-done]").onclick = () => {
    const ids = [...(friendPicker?.selected || [])];
    closeFriendsPicker();
    onDone?.(ids);
  };
}
function fpRowHtml(f) {
  const ticked = friendPicker?.selected?.has(f.id) ? " checked" : "";
  const stories = cloudStories.filter((s) => s.userId === f.id);
  const dot = stories.length && !stories.every((s) => isSeen("cstory:" + s.id)) ? '<span class="story-dot" title="New status"></span>' : "";
  return `<button type="button" class="fp-row" data-fp-id="${esc(f.id)}" role="checkbox" aria-checked="${Boolean(ticked)}"><span class="fp-check" aria-hidden="true">${sicon("check")}</span>${friendAvatarMarkup(f.id, f.handle, f.name)}<span class="fp-meta"><strong>@${esc(f.handle)}</strong><small class="muted">${esc(f.name || "")}</small></span>${dot}</button>`;
}
function fpToggle(id, row) {
  if (!friendPicker) return;
  if (friendPicker.selected.has(id)) friendPicker.selected.delete(id);
  else friendPicker.selected.add(id);
  row.classList.toggle("picked", friendPicker.selected.has(id));
  row.setAttribute("aria-checked", friendPicker.selected.has(id) ? "true" : "false");
  fpPaintCount();
}
function fpPaintCount() {
  const el = document.querySelector("#friends-picker-modal [data-fp-count]");
  if (el) el.textContent = `${friendPicker?.selected.size || 0} selected`;
}
function closeFriendsPicker() {
  friendPicker = null;
  $("#friends-picker-modal")?.remove();
}
// ---- Hover profile cards + full read-only profile view ---------------------
// Hovering any [data-profile-*] row floats a mini profile card; clicking it
// opens the full profile with an Add friend / Message / Block action bar.
// Read-only by design: visitors can never edit someone else's profile.
let profilePop = null;
// Shared close timer: the row's mouseleave STARTS it, the popup's mouseenter
// CLEARS it. (The old `pop._bye` was never assigned anywhere — mouseenter's
// clearTimeout(undefined) was a no-op — so the popup always closed while the
// pointer was still travelling toward "View profile", making the button
// unreachable by mouse.)
let popCloseT = 0;
// Touch devices fire a synthetic mouseenter ~350ms after a tap — gating hover
// on a fine pointer stops a ghost popup dropping over the opened modal.
const canHoverProfile = () =>
  Boolean(window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches);

function closeProfilePop() {
  clearTimeout(popCloseT);
  if (profilePop) profilePop.remove();
  profilePop = null;
}
document.addEventListener("pointerdown", (e) => {
  if (profilePop && !profilePop.contains(e.target)) closeProfilePop();
}, true);
document.addEventListener("click", (e) => {
  if (profilePop && !profilePop.contains(e.target) && !e.target.closest?.("[data-profile-user]")) closeProfilePop();
});
function bindHoverProfiles(root) {
  const scope = root || document;
  $$('[data-profile-user]', scope).forEach((el) => {
    if (el.dataset.profileBound) return;
    el.dataset.profileBound = "1";
    let hoverT = 0;
    // Hover only fires on the avatar/name zones — brushing the row's action
    // buttons (Message / Block / Remove) must not float the card up over them.
    const zones = $$(".avatar, .friend-ava, .task-text, .conv-ava", el);
    const targets = zones.length ? zones : [el];
    const enter = () => {
      if (!canHoverProfile()) return;
      clearTimeout(hoverT);
      clearTimeout(popCloseT);
      hoverT = setTimeout(() => openProfilePop(el), 350);
    };
    const leave = () => {
      clearTimeout(hoverT);
      if (!canHoverProfile()) return;
      popCloseT = setTimeout(() => closeProfilePop(), 220);
    };
    targets.forEach((z) => {
      z.addEventListener("mouseenter", enter);
      z.addEventListener("mouseleave", leave);
    });
    el.addEventListener("click", (e) => {
      // Buttons/links inside the row handle themselves — only a click on the
      // row itself opens the full profile.
      if (e.target.closest?.("button, a, input, select, textarea")) return;
      clearTimeout(hoverT);
      clearTimeout(popCloseT);
      closeProfilePop();
      openProfileView(profileDataFrom(el));
    });
  });
}
function profileDataFrom(el) {
  return {
    id: el.dataset.profileUser || "",
    handle: el.dataset.profileHandle || "member",
    name: el.dataset.profileName || el.dataset.profileHandle || "Member",
    photo: el.dataset.profilePhoto || "",
    bio: el.dataset.profileBio || "",
    state: el.dataset.profileState || "",
  };
}
function openProfilePop(el) {
  closeProfilePop();
  const d = profileDataFrom(el);
  const r = el.getBoundingClientRect();
  const pop = document.createElement("div");
  pop.className = "profile-pop";
  pop.innerHTML = `${profileCardInner(d)}`;
  document.body.append(pop);
  const w = pop.offsetWidth || 260;
  const h = pop.offsetHeight || 150;
  let x = Math.min(r.left, window.innerWidth - w - 12);
  let y = r.bottom + 8;
  if (y + h > window.innerHeight - 12) y = Math.max(12, r.top - h - 8);
  pop.style.left = Math.max(12, x) + "px";
  pop.style.top = y + "px";
  pop.addEventListener("mouseenter", () => clearTimeout(popCloseT));
  pop.addEventListener("mouseleave", () => {
    popCloseT = setTimeout(() => closeProfilePop(), 220);
  });
  pop.querySelector("[data-pp-view]")?.addEventListener("click", () => {
    closeProfilePop();
    openProfileView(d);
  });
  profilePop = pop;
}
function profileCardInner(d) {
  const photo = d.photo ? avatarPublicUrl(d.photo) : "";
  const stateLabel = d.state === "friends" ? "Connected"
    : d.state === "request-in" ? "Wants to connect"
    : d.state === "request-out" ? "Request sent"
    : "";
  return `<div class="pp-head">${photo
    ? `<span class="pp-ava"><img src="${esc(photo)}" alt=""></span>`
    : `<span class="pp-ava">${esc(((d.handle || "?")[0] || "?").toUpperCase())}</span>`}<div class="pp-id"><strong>@${esc(d.handle)}</strong><small>${esc(d.name)}</small></div></div>${d.bio ? `<p class="pp-bio">${esc(d.bio)}</p>` : ""}${stateLabel ? `<span class="pp-state">${esc(stateLabel)}</span>` : ""}<button type="button" class="primary pp-view" data-pp-view>View profile</button>`;
}
// Async friends strip inside openProfileView — mutual friends sort first and
// get the gold ring + "Mutual" pill; every tile navigates to that profile.
async function loadProfileFriends(modal, d) {
  const section = modal.querySelector("[data-pv-friends]");
  if (!section) return;
  try {
    const { data, error } = await listUserFriends(d.id);
    if (!modal.isConnected) return;
    if (error || !Array.isArray(data)) {
      section.remove();
      return;
    }
    const rows = data
      .filter((f) => f && f.id && f.id !== d.id)
      .map((f) => ({
        id: String(f.id),
        handle: f.handle || "member",
        name: f.name || f.handle || "Member",
        photo: f.photo_path || "",
        bio: f.bio || "",
        mutual: Boolean(f.mutual),
      }));
    if (!rows.length) {
      section.querySelector("[data-pv-friends-meta]").textContent = "";
      const strip = section.querySelector("[data-pv-friends-strip]");
      strip.className = "pv-friends-strip";
      strip.innerHTML = `<p class="muted pv-friends-empty">No friends to show yet.</p>`;
      return;
    }
    // Seed the photo cache so friendAvatarMarkup can resolve non-cached ids.
    rows.forEach((f) => {
      if (f.photo && !friendPhotoUrls.has(f.id)) friendPhotoUrls.set(f.id, resolvePhoto(f.photo));
    });
    rows.sort((a, b) => (b.mutual - a.mutual) || a.handle.localeCompare(b.handle));
    const mutualN = rows.filter((f) => f.mutual).length;
    section.querySelector("[data-pv-friends-meta]").innerHTML = mutualN
      ? `<span class="pv-mutual-pill">${sicon("users")} ${mutualN} friend${mutualN === 1 ? "" : "s"} in common</span>`
      : `<span>${rows.length}</span>`;
    const strip = section.querySelector("[data-pv-friends-strip]");
    strip.className = "pv-friends-strip";
    strip.innerHTML = rows.map((f) => {
      const state = f.mutual || cloudFriends.some((x) => x.id === f.id) ? "friends" : "";
      return `<button type="button" class="pv-friend${f.mutual ? " mutual" : ""}" data-pv-friend data-profile-user="${esc(f.id)}" data-profile-handle="${esc(f.handle)}" data-profile-name="${esc(f.name)}" data-profile-photo="${esc(f.photo)}" data-profile-bio="${esc(f.bio)}" data-profile-state="${state}" title="View @${esc(f.handle)}">`
        + `<span class="pv-friend-ring${f.mutual ? " mutual" : ""}">${friendAvatarMarkup(f.id, f.handle, f.name)}</span>`
        + `<strong>@${esc(String(f.handle).slice(0, 12))}</strong>`
        + `<small>${esc(String(f.name).slice(0, 16))}</small>`
        + (f.mutual ? `<span class="pv-mutual-tag">Mutual</span>` : "")
        + `</button>`;
    }).join("");
    $$("[data-pv-friend]", strip).forEach((tile) => {
      tile.addEventListener("click", () => {
        const fd = profileDataFrom(tile);
        if (!fd.id || fd.id === d.id) return;
        closeProfilePop();
        modal.remove();
        openProfileView(fd);
      });
    });
    bindHoverProfiles(strip);
  } catch {
    if (modal.isConnected) section.remove();
  }
}
// Full read-only profile modal (open to everyone; only friends' data is rich).
function openProfileView(d) {
  const photo = d.photo ? avatarPublicUrl(d.photo) : "";
  const isFriend = cloudFriends.some((f) => f.id === d.id);
  const isPending = cloudFriendReqs.some((r) => r.otherId === d.id);
  const stories = cloudStories.filter((s) => s.userId === d.id);
  const canLoadFriends = signedIn() && d.id;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "profile-view-modal";
  modal.innerHTML = `<div class="modal profile-view"><span class="pv-cover"></span><div class="pv-head">${photo
    ? `<span class="pv-ava"><img src="${esc(photo)}" alt=""></span>`
    : `<span class="pv-ava">${esc(((d.handle || "?")[0] || "?").toUpperCase())}</span>`}<div class="pv-id"><h2>@${esc(d.handle)}</h2><p class="muted">${esc(d.name)}</p>${d.bio ? `<p class="pv-bio">${esc(d.bio)}</p>` : ""}</div></div><div class="pv-facts"><span class="tag">${isFriend ? sicon("check") + " Connected" : isPending ? "Request pending" : "Not connected"}</span>${stories.length ? `<span class="tag">${stories.length} status update${stories.length === 1 ? "" : "s"}</span>` : ""}</div>${canLoadFriends ? `<div class="pv-friends" data-pv-friends><div class="pv-friends-head"><span class="eyebrow">Friends</span><span class="pv-friends-meta" data-pv-friends-meta>Loading…</span></div><div class="pv-friends-strip pv-friends-loading" data-pv-friends-strip><span class="pv-friend-skel"></span><span class="pv-friend-skel"></span><span class="pv-friend-skel"></span></div></div>` : ""}${stories.length ? `<div class="pv-stories">${stories.slice(0, 6).map((s) => `<button type="button" class="pv-story${isSeen("cstory:" + s.id) ? " seen" : ""}" data-pv-story="${esc(s.id)}" title="View status">${s.kind === "image" ? `<img data-story-thumb="${esc(s.mediaPath)}" alt="">` : `<span>${escSnippet(s.text || "", 60)}</span>`}<small>${relTime(s.createdAt)}</small></button>`).join("")}</div>` : ""}<div class="modal-actions pv-actions">${!isFriend && !isPending ? `<button type="button" class="primary" data-pv-add>Add friend</button>` : ""}${isFriend ? `<button type="button" class="ghost" data-pv-msg>Message</button><button type="button" class="ghost" data-pv-story-all>View status</button>` : ""}<button type="button" class="ghost" data-pv-close>Close</button>${isFriend ? `<button type="button" class="danger-button" data-pv-block>Block</button>` : ""}</div></div>`;
  $("#modal-root").append(modal);
  paintStoryThumbs(modal);
  if (canLoadFriends) loadProfileFriends(modal, d);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.querySelector("[data-pv-close]").onclick = () => modal.remove();
  modal.querySelector("[data-pv-add]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const { error } = await sendFriendRequest(d.id);
    notify(error ? "Couldn't send request — " + String(error.message).slice(0, 90) : `Request sent to @${d.handle}`);
    await refreshCloudSocial(true).catch(() => {});
    modal.remove();
    if (state.tab === "community") renderCommunity();
  });
  modal.querySelector("[data-pv-msg]")?.addEventListener("click", () => {
    modal.remove();
    state.subtab = "messages";
    state.activeChat = d.id;
    renderCommunity();
  });
  modal.querySelector("[data-pv-story-all]")?.addEventListener("click", () => {
    modal.remove();
    const items = [...stories].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    openStoryViewer(items, Math.max(0, items.findIndex((s) => !isSeen("cstory:" + s.id))));
  });
  modal.querySelector("[data-pv-block]")?.addEventListener("click", () => {
    modal.remove();
    askBlockUser({ id: d.id, username: d.handle, name: "@" + d.handle, context: "profile" });
  });
  $$('[data-pv-story]', modal).forEach((b) => (b.onclick = () => {
    const s = stories.find((x) => x.id === b.dataset.pvStory);
    if (!s) return;
    modal.remove();
    openStoryViewer([s], 0);
  }));
}
// Small row binding used by the Connections list (row click opens the view).
function bindFriendRows(root) {
  const scope = root || document;
  $$('[data-profile-user]', scope).forEach((el) => {
    if (el.dataset.rowBound) return;
    el.dataset.rowBound = "1";
    el.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      openProfileView(profileDataFrom(el));
    });
  });
}
const BLOCK_REASONS = ["Fraud or scam", "Harassment", "Bullying", "Hate or offensive behavior", "Bad language", "Spam", "Inappropriate content", "Impersonation", "Threatening behavior", "Repeated unwanted contact", "Other"];
// User searched for someone who is ALREADY a friend — instead of a dead-end
// toast, offer the safety path: keep the connection, or open the block flow.
function alreadyFriendsDialog(user) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal already-friend-modal"><div class="already-friend-head">${friendAvatarMarkup(user.id, user.handle, user.name || user.handle)}<div><h2>You're already friends</h2><p class="muted">@${esc(user.handle || user.name || "this user")} is in your connections — you can message them, view their profile, or block them here.</p></div></div><div class="modal-actions already-friend-actions"><button type="button" class="ghost" data-af-close>Close</button><button type="button" class="ghost" data-af-profile>View profile</button><button type="button" class="ghost" data-af-msg>Message</button><button type="button" class="danger-button" data-af-block>Block user</button></div></div>`;
  $("#modal-root").append(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.querySelector("[data-af-close]").onclick = () => modal.remove();
  modal.querySelector("[data-af-profile]").onclick = () => {
    modal.remove();
    openProfileView({
      id: user.id,
      handle: user.handle || user.name || "member",
      name: user.name || user.handle || "Member",
      photo: user.photo_path || "",
      bio: user.bio || "",
      state: "friends",
    });
  };
  modal.querySelector("[data-af-msg]").onclick = () => {
    modal.remove();
    state.subtab = "messages";
    state.activeChat = user.id;
    renderCommunity();
  };
  modal.querySelector("[data-af-block]").onclick = () => {
    modal.remove();
    askBlockUser({
      id: user.id,
      username: user.handle || user.name,
      name: "@" + (user.handle || user.name || "user"),
      context: "friends",
    });
  };
}
function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function blockKeyFor(ref) {
  if (!ref) return "";
  return ref.id || ref.username || ref.handle || "";
}
function isBlockedKey(key) {
  return Boolean(key && (state.blocks || {})[key]);
}
function askBlockUser(ref) {
  const key = blockKeyFor(ref);
  const name = ref.name || (ref.username ? "@" + ref.username : "this user");
  if (!key) return notify("Could not identify that user");
  if ((ref.username && ref.username === state.profile.handle) || key === postOwnerId())
    return notify("You cannot block yourself");
  closePostMenus();
  const existing = (state.blocks || {})[key];
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Safety & privacy</div><h2>Block ${esc(name)}?</h2><p class="muted">Blocking will limit interactions between you and this account — no more direct messages, and their notes leave your feed.${existing ? " You have reported them before — continuing updates your report." : ""}</p><div class="modal-actions"><button type="button" class="ghost" data-block-cancel>Cancel</button><button type="button" class="danger-button" data-block-continue>Block User</button></div></div>`;
  $("#modal-root").append(modal);
  modal.querySelector("[data-block-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.querySelector("[data-block-continue]").onclick = () => {
    modal.remove();
    blockReasonDialog(ref);
  };
}
function blockReasonDialog(ref) {
  const name = ref.name || (ref.username ? "@" + ref.username : "this user");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Report · ${esc(name)}</div><h2>Why are you blocking this user?</h2><p class="muted">Pick the closest reason. Reports go to moderation — never public.</p><div class="reason-list" data-block-reasons>${BLOCK_REASONS.map((r) => `<label><input type="radio" name="block-reason" value="${esc(r)}"> ${esc(r)}</label>`).join("")}</div><label class="field-label" data-block-other-wrap hidden>Tell us more about what happened<textarea class="textarea autogrow" data-block-other rows="3" placeholder="What did they do? Which content was inappropriate?"></textarea></label><p class="st-confirm-err" data-block-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-block-back>Back</button><button type="button" class="danger-button" data-block-submit>Submit</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-block-err]");
  const otherWrap = modal.querySelector("[data-block-other-wrap]");
  const otherBox = modal.querySelector("[data-block-other]");
  const submitBtn = modal.querySelector("[data-block-submit]");
  modal.querySelectorAll('input[name="block-reason"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      const show = modal.querySelector('input[name="block-reason"]:checked')?.value === "Other";
      otherWrap.hidden = !show;
      if (show) fitTextarea(otherBox);
    }),
  );
  modal.querySelector("[data-block-back]").onclick = () => {
    modal.remove();
    askBlockUser(ref);
  };
  modal.addEventListener("click", (e) => {
    if (e.target === modal && !submitBtn.disabled) modal.remove();
  });
  submitBtn.onclick = async () => {
    const reason = modal.querySelector('input[name="block-reason"]:checked')?.value || "";
    const complaint = otherBox.value.trim();
    if (!reason) {
      err.textContent = "Choose a reason first.";
      err.hidden = false;
      return;
    }
    if (reason === "Other" && !complaint) {
      err.textContent = "Describe what happened, or pick a specific reason instead.";
      err.hidden = false;
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
    err.hidden = true;
    const ok = await submitBlock(ref, [reason], complaint);
    if (ok) modal.remove();
    else {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  };
}
async function submitBlock(ref, reasons, complaint) {
  const key = blockKeyFor(ref);
  if (!key) {
    notify("Could not identify that user");
    return false;
  }
  if ((ref.username && ref.username === state.profile.handle) || key === postOwnerId()) {
    notify("You cannot block yourself");
    return false;
  }
  const entry = {
    key,
    id: ref.id || null,
    username: ref.username || ref.handle || "",
    name: ref.name || ref.username || ref.handle || "Unknown user",
    reasons: reasons.slice(0, 8),
    complaint: String(complaint || "").slice(0, 2000),
    ts: Date.now(),
    status: "active",
  };
  state.blocks = { ...(state.blocks || {}), [key]: entry };
  const report = {
    id: uid(),
    reporter: state.profile.handle,
    reportedKey: key,
    reportedName: entry.name,
    reasons: entry.reasons,
    complaint: entry.complaint,
    ts: Date.now(),
    status: "pending",
    context: ref.context || "community",
  };
  state.reports = [...(state.reports || []).filter((r) => r.reportedKey !== key), report];
  if (ref.id) state.friends = (state.friends || []).filter((f) => f.id !== ref.id);
  cloudFriends = cloudFriends.filter((f) => f.id !== ref.id);
  persist();
  let cloudOk = true;
  // Server-side block (uuid accounts): enforces DM/group/message exclusion
  // in RLS and severs the connection. Usernames-only refs stay local.
  if (signedIn() && isUuid(ref.id)) {
    try {
      const { error } = await blockUser(ref.id);
      if (error && !isPhase7Missing(error)) cloudOk = false;
      else cloudBlocked.add(ref.id);
    } catch {
      cloudOk = false;
    }
  }
  try {
    const { error } = await reportUser({
      reportedUserId: isUuid(ref.id) ? ref.id : null,
      reasons: entry.reasons,
      details: `Reported user: ${entry.username || entry.name}\nComplaint: ${entry.complaint || "—"}\nContext: ${report.context}`,
    });
    if (error) cloudOk = false;
  } catch {
    cloudOk = false;
  }
  renderCommunity();
  notify(cloudOk ? "User blocked and reported" : "User blocked — report saved on this device");
  return true;
}
function unblockUser(key) {
  const blocks = { ...(state.blocks || {}) };
  const entry = blocks[key];
  if (!entry) return;
  delete blocks[key];
  state.blocks = blocks;
  persist();
  if (signedIn() && isUuid(entry.id)) {
    cloudBlocked.delete(entry.id);
    serverUnblock(entry.id).catch(() => {});
  }
  renderCommunity();
  notify("User unblocked");
}
function blockedSectionMarkup() {
  const list = Object.values(state.blocks || {});
  if (!list.length) return "";
  return `<div class="section-row" style="margin-top:18px"><h3>Blocked users (${list.length})</h3><span class="tag">private</span></div><p class="muted">They cannot message you, and their notes stay out of your feed. Reports remain with moderation.</p><div class="grid">${list.map((b) => `<div class="task"><div class="avatar">⊘</div><span class="task-text"><strong>${esc(b.name)}</strong><br><small class="muted">${esc((b.reasons || []).join(" · "))}${b.ts ? ` · ${new Date(b.ts).toLocaleDateString()}` : ""}</small></span><span class="friend-actions"><button type="button" class="ghost" data-unblock="${esc(b.key)}">Unblock</button></span></div>`).join("")}</div>`;
}
let cloudNotifList = [];
let cloudNotifListAt = 0;
function notifTime(ts) {
  try {
    return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function renderNotifications(body) {
  if (!signedIn()) {
    body.innerHTML = `<div class="card"><h2>Notifications</h2><p class="muted">Sign in to see group invites, connection updates and group activity.</p></div>`;
    return;
  }
  body.innerHTML = `<div class="card"><div class="section-row"><h2>Notifications</h2><span class="tag" data-notif-tag>${cloudNotifCount ? `${cloudNotifCount} unread` : "up to date"}</span></div><div data-notif-list><p class="muted">Loading…</p></div><div class="modal-actions"><button type="button" class="ghost" data-notif-read-all>Mark all read</button></div></div>`;
  const paint = (list) => {
    const box = body.querySelector("[data-notif-list]");
    if (!box) return;
    box.innerHTML = list.length ? list.map((n) => `<div class="task"><div class="avatar">${sicon(n.type === "connection" ? "users" : n.type === "group_removed" ? "run" : "bell")}</div><span class="task-text"><strong>${esc(n.title)}</strong><br><small class="muted">${esc(n.text || "")} · ${notifTime(n.created_at)}</small></span><span class="friend-actions">${!n.read_at ? `<span class="tag">new</span>` : ""}${n.metadata?.group_id ? `<button type="button" class="primary" data-notif-open="${n.id}">Open</button>` : ""}</span></div>`).join("")
      : '<p class="muted">Nothing yet. Group invites, new connections and group activity land here.</p>';
    box.querySelectorAll("[data-notif-open]").forEach((b) => (b.onclick = async () => {
      const item = list.find((x) => x.id === b.dataset.notifOpen);
      if (item && !item.read_at) {
        markNotificationRead(item.id).catch(() => {});
        item.read_at = new Date().toISOString();
        cloudNotifCount = Math.max(0, cloudNotifCount - 1);
      }
      const gid = item?.metadata?.group_id;
      if (gid) {
        await refreshCloudGroups(true).catch(() => {});
        state.subtab = "messages";
        state.activeChat = gid;
      } else {
        state.subtab = "friends";
      }
      renderCommunity();
    }));
  };
  paint(cloudNotifList);
  listNotifications(30).then(({ data, error } = {}) => {
    if (error || !Array.isArray(data)) {
      const box = body.querySelector("[data-notif-list]");
      if (box && !cloudNotifList.length) box.innerHTML = '<p class="muted">Couldn\'t load notifications — check your connection.</p>';
      return;
    }
    cloudNotifList = data;
    cloudNotifListAt = Date.now();
    cloudNotifCount = data.filter((n) => !n.read_at).length;
    cloudNotifAt = Date.now();
    if (state.tab === "community" && state.subtab === "notifications") {
      paint(data);
      const tag = body.querySelector("[data-notif-tag]");
      if (tag) tag.textContent = cloudNotifCount ? `${cloudNotifCount} unread` : "up to date";
      const tab = document.querySelector('[data-subtab="notifications"]');
      if (tab) tab.textContent = `Notifications${cloudNotifCount ? ` (${cloudNotifCount})` : ""}`;
    }
  }).catch(() => {});
  body.querySelector("[data-notif-read-all]").onclick = async () => {
    await markAllNotificationsRead().catch(() => {});
    cloudNotifList = cloudNotifList.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
    cloudNotifCount = 0;
    renderCommunity();
    notify("All caught up");
  };
}
// ---- Inbox-style conversation list (unread badges + last-message previews)

// Per-chat read marker: the last message the user has seen, anchored by
// message ID (timestamp as fallback). ID anchoring keeps unread counts exact
// even when a message lands in the same millisecond as the read marker — a
// pure-timestamp marker silently swallowed those. Persisted via save().
function chatReadMap() {
  const saved = get("sf-chat-read", {});
  return saved && typeof saved === "object" ? saved : {};
}
function markChatRead(chatId) {
  const map = chatReadMap();
  const last = (state.messages[chatId] || []).at(-1);
  const entry = { ts: Math.max(last?.ts || 0, Date.now()), id: last?.id || null };
  const prev = map[chatId];
  const prevTs = typeof prev === "number" ? prev : prev?.ts || 0;
  if (prevTs >= entry.ts && (prev?.id || null) === entry.id) return false;
  map[chatId] = entry;
  save("sf-chat-read", map);
  return true;
}
function unreadCount(chatId) {
  const msgs = state.messages[chatId] || [];
  const marker = chatReadMap()[chatId];
  // Preferred: count everything after the last-seen message in arrival order.
  if (marker && typeof marker === "object" && marker.id) {
    const idx = msgs.findIndex((m) => m.id === marker.id);
    if (idx >= 0) return msgs.slice(idx + 1).filter((m) => !m.me).length;
  }
  // Fallback: legacy numeric markers or a marker whose message aged out.
  const since = typeof marker === "number" ? marker : marker?.ts || 0;
  return msgs.filter((m) => !m.me && (m.ts || 0) > since).length;
}

// "You:" prefix inside groups, "You" when it's the user's own line in a DM,
// otherwise the sender's name — mirrors how the chat itself labels authors.
function previewLabel(chatId, m, isGroup) {
  if (!m) return "";
  if (m.me) return "You: ";
  if (isGroup || m.sysName) return (m.sysName || "Group member") + ": ";
  return "";
}

// WhatsApp-style avatar for a conversation: profile photo when we have one,
// group logo/emoji for groups, else a tinted initial disc.
function convAvatarHtml(c, size) {
  if (typeof c.emoji === "string" && c.emoji.includes("<svg")) {
    return `<span class="conv-ava group-logo" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.5)}px" data-av-wrap="">${c.emoji}</span>`;
  }
  const name = c.name || c.username || "?";
  const letter = esc((name.replace(/^@/, "")[0] || "?").toUpperCase());
  const src = resolvePhoto(c.photo);
  if (src) {
    return `<span class="conv-ava" style="width:${size}px;height:${size}px"><img src="${esc(src)}" alt="" loading="lazy"></span>`;
  }
  return `<span class="conv-ava" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">${letter}</span>`;
}
function chatDisplayInfo(id) {
  if (isSelfChat(id))
    return {
      isGroup: false,
      target: { id: SELF_CHAT_ID, username: state.profile.handle || "me", name: "You (Message yourself)" },
      name: "You (Message yourself)",
      photo: resolvePhoto(state.profile.photo),
    };
  const isGroup = allGroups().some((g) => g.id === id);
  const target =
    (isGroup && allGroups().find((g) => g.id === id)) ||
    state.friends.find((f) => f.id === id) ||
    cloudFriends.find((f) => f.id === id);
  const name = isGroup
    ? (target?.name || "Group")
    : target?.name || (target ? "@" + (target.username || target.handle) : "") || "Chat";
  const photo = !isGroup
    ? resolvePhoto(target?.photo || (target?.cloud && cloudFriendPhoto?.(target.id)) || "")
    : "";
  return { isGroup, target, name, photo };
}
// cloudFriends entries may carry an avatar path; resolve to a public URL once.
let cloudPhotoCache = new Map();
function cloudFriendPhoto(id) {
  if (cloudPhotoCache.has(id)) return cloudPhotoCache.get(id);
  const f = cloudFriends.find((x) => x.id === id);
  if (!f?.avatar) return "";
  import("./services/backend.js").then(({ getGroupAvatarUrl }) =>
    getGroupAvatarUrl(f.avatar).then(({ data } = {}) => {
      if (data?.publicUrl || data?.signedUrl) cloudPhotoCache.set(id, data.publicUrl || data.signedUrl);
      rerenderChat();
    }).catch(() => {}),
  ).catch(() => {});
  cloudPhotoCache.set(id, "");
  return "";
}
function conversationRow(c) {
  const isGroup = allGroups().some((g) => g.id === c.id);
  const msgs = state.messages[c.id] || [];
  const last = msgs.at(-1);
  const unread = unreadCount(c.id);
  const muted = isChatMuted(c.id);
  const active = state.activeChat === c.id ? "active" : "";
  const preview = last
    ? esc(previewLabel(c.id, last, isGroup)) + escSnippet(messageText(last), 46)
    : '<em class="conv-empty">No messages yet</em>';
  const tick = last && last.me ? `<span class="conv-tick${state.messageStatus[last.id] === "read" ? " read" : ""}" aria-hidden="true">${sicon("checkDouble")}</span>` : "";
  return `<button type="button" class="conv-row ${active}${unread ? " has-unread" : ""}" data-select-chat="${c.id}">`
    + convAvatarHtml(c, 49)
    + `<span class="conv-main">`
    + `<span class="conv-top"><span class="conv-name">${esc(c.name || "@" + c.username)}${muted ? ` <span class="mute-ico" title="Muted">${sicon("mute")}</span>` : ""}</span>`
    + `<span class="conv-time${unread ? " unread-time" : ""}">${last ? relTime(last.ts) : ""}</span></span>`
    + `<span class="conv-preview">${tick}${preview}</span></span>`
    + (unread ? `<span class="conv-unread" title="${unread} unread message${unread === 1 ? "" : "s"}">${unread > 99 ? "99+" : unread}</span>` : "")
    + `</button>`;
}

// Messages tab — a fullscreen WhatsApp-style surface: chat list on its own
// at first ("Message yourself" pinned at top), then the open conversation
// takes over the whole panel with a back affordance. Works on every width.
function renderMessages(body) {
  const cloudConns = cloudFriends
    .filter((f) => !cloudBlocked.has(f.id))
    .map((f) => ({ id: f.id, username: f.handle, name: f.name || "@" + f.handle, photo: resolvePhoto(f.photo) || cloudFriendPhoto(f.id), cloud: true }));
  const chats = [
    ...allGroups().filter((g) => get("sf-joined", []).includes(g.id)),
    ...(state.friends || []).filter((f) => !isBlockedKey(f.id)),
    ...cloudConns.filter((c) => !(state.friends || []).some((f) => f.id === c.id)),
  ];
  if (state.activeChat && (isBlockedKey(state.activeChat) || cloudBlocked.has(state.activeChat))) state.activeChat = null;
  const totalUnread = chats.reduce((sum, c) => sum + (state.activeChat === c.id ? 0 : unreadCount(c.id)), 0);
  const sorted = [...chats].sort((a, b) => {
    if (isSelfChat(a.id) !== isSelfChat(b.id)) return isSelfChat(a.id) ? -1 : 1;
    const ta = (state.messages[a.id] || []).at(-1)?.ts || 0;
    const tb = (state.messages[b.id] || []).at(-1)?.ts || 0;
    return tb - ta;
  });
  body.innerHTML = `<div class="wa-root${state.activeChat ? " has-chat" : ""}"><div class="wa-list">`
    + `<div class="wa-list-head"><h2>Chats</h2>${signedIn() ? "" : `<span class="tag">local</span>`}</div>`
    + messagesStoryStrip()
    + `<div class="wa-search"><span class="wa-search-ico">${sicon("search")}</span><input id="wa-chat-filter" type="search" placeholder="Search or start a new chat" aria-label="Search chats" autocomplete="off"></div>`
    + `<div class="wa-rows" id="wa-rows">${conversationRow({ id: SELF_CHAT_ID, name: "You (Message yourself)", emoji: avatarMarkup(resolvePhoto(state.profile.photo), (state.profile.name || "Y")[0].toUpperCase()) })}${sorted.map(conversationRow).join("") || ""}</div></div>`
    + `<div class="chat wa-chat">${state.activeChat ? (groupSearch && groupSearch.id === state.activeChat ? groupSearchMarkup(state.activeChat) : chatMarkup(state.activeChat)) : waPlaceholderMarkup()}</div></div>`;
  paintMessagesBadge(totalUnread);
  // The story rings under the "Chats" heading only worked on the Status tab
  // (bindFriendStoryRings was never called here) — clicking them did nothing.
  bindFriendStoryRings(body);
  $$("[data-select-chat]", body).forEach(
    (b) =>
      (b.onclick = () => {
        if (state.activeChat !== b.dataset.selectChat) {
          groupSearch = null;
          groupNav = null;
        }
        state.activeChat = b.dataset.selectChat;
        markChatRead(state.activeChat);
        renderMessages(body);
      }),
  );
  const filter = $("#wa-chat-filter", body);
  if (filter) {
    filter.oninput = () => {
      const q = filter.value.trim().toLowerCase();
      $$("[data-select-chat]", body).forEach((row) => {
        row.style.display = !q || (row.textContent || "").toLowerCase().includes(q) ? "" : "none";
      });
    };
  }
  if (state.activeChat) {
    if (groupSearch && groupSearch.id === state.activeChat) bindGroupSearch(body, state.activeChat);
    else bindChat(body, state.activeChat);
    // New messages land at the bottom; without this the reader is left
    // wherever the previous render left the scroll position.
    const chatBody = $(".chat-body", body);
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    bindEdgeSwipeBack(body);
  }
  paintGroupAvatars(body);
}
function waPlaceholderMarkup() {
  return `<div class="wa-intro"><div class="wa-intro-art">${sicon("chat")}</div><h2>StudyFlow for Messaging</h2><p class="muted">Send and receive messages with your study partners — and with yourself. Pick a chat on the left, or start a new one from Friends.</p><div class="wa-intro-note">${sicon("lock")} Your chats stay on this device unless both of you are signed in.</div></div>`;
}

// Edge-swipe back (phones): swiping right from the left edge of an open chat
// returns to the conversation list, iOS/WhatsApp-style. Pointer events cover
// touch + mouse (mouse excluded — clicks aren't drags); the panel follows the
// finger while a veil + "‹ Back" chip reveal beneath. Commit past ~96px of
// travel, otherwise it settles back.
function bindEdgeSwipeBack(root) {
  const chat = $(".chat", root);
  if (!chat || !state.activeChat) return;
  if (chat.querySelector(":scope > .edge-swipe-veil")) return; // already bound to THIS DOM
  if (groupSearch && groupSearch.id === state.activeChat) return; // search view has its own ‹ back
  const veil = document.createElement("div");
  veil.className = "edge-swipe-veil";
  veil.innerHTML = `<span class="edge-swipe-chip"><b>‹</b> Back</span>`;
  chat.appendChild(veil);
  const EDGE = 32; // capture zone from the panel's left edge (px)
  const COMMIT = 96; // travel that completes the gesture (px)
  const VMAX = 140; // chip slide cap (px)
  let startX = 0, startY = 0, active = false, tracking = false, settleT = 0;
  const settle = (back) => {
    chat.style.transition = "transform 200ms ease";
    chat.style.transform = "translateX(0)";
    veil.style.transition = "opacity 200ms ease";
    veil.style.opacity = "0";
    clearTimeout(settleT);
    settleT = setTimeout(() => {
      chat.style.transition = "";
      chat.style.transform = "";
      veil.style.transition = "";
      chat.classList.remove("edge-swiping");
    }, 210);
    if (back) {
      state.activeChat = null;
      renderMessages(root);
    }
  };
  chat.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse") return; // desktop: clicks, not drags
      if (!state.activeChat) return;
      const r = chat.getBoundingClientRect();
      if (e.clientX - r.left > EDGE) return;
      startX = e.clientX;
      startY = e.clientY;
      active = true;
      tracking = false;
    },
    { passive: true },
  );
  chat.addEventListener("pointermove", (e) => {
    if (!active) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!tracking) {
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      if (dx <= 0 || Math.abs(dy) > Math.abs(dx) * 1.4) {
        active = false;
        return;
      }
      tracking = true;
      clearTimeout(settleT);
      chat.classList.add("edge-swiping");
      veil.style.opacity = "";
    }
    if (e.cancelable) e.preventDefault();
    const shift = Math.max(0, dx);
    chat.style.transform = `translateX(${shift}px)`;
    veil.style.opacity = String(Math.min(1, shift / COMMIT));
    const chip = veil.firstElementChild;
    if (chip) {
      const slide = Math.min(VMAX, shift * 0.6) - 24;
      const grow = Math.min(1, 0.82 + shift / (COMMIT * 2));
      chip.style.transform = `translateX(${slide}px) scale(${grow})`;
    }
  });
  const end = (e) => {
    if (!active) return;
    active = false;
    if (!tracking) return;
    tracking = false;
    const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    settle(x - startX >= COMMIT);
  };
  chat.addEventListener("pointerup", end);
  chat.addEventListener("pointercancel", () => {
    if (!active) return;
    active = false;
    if (tracking) {
      tracking = false;
      settle(false);
    }
  });
}

function chatKey() {
  return state.user?.id || state.profile.handle || "local-user";
}

// Reaction identities are stable keys (not SVG markup!) — the old code used the
// raw sicon() SVG string as the reaction key, which corrupted data-react
// attributes, broke chip rendering, and stored garbage in localStorage.
const REACT_EMOJI = ["heart", "thumbsUp", "laugh", "wow", "cry", "clap"];
const REACT_LABELS = {
  heart: "❤️",
  thumbsUp: "👍",
  laugh: "😂",
  wow: "😮",
  cry: "😢",
  clap: "👏",
};

function escSnippet(s, n) {
  const t = String(s || "");
  return esc(t.length > n ? t.slice(0, n - 1) + "…" : t);
}

function messageText(m) {
  if (m.kind === "voice") return `Voice message (${m.dur || 0}s)`;
  if (m.kind === "poll") return m.question || m.text || "Poll";
  if (m.kind === "file")
    return m.mime && m.mime.startsWith("image/")
      ? `Photo${m.file ? ": " + m.file : ""}`
      : `File${m.file ? ": " + m.file : ""}`;
  return cleanText(m.text || "");
}

function pollVotes(m) {
  const counts = (m.options || []).map(() => 0);
  Object.values(m.voters || {}).forEach((i) => {
    if (counts[i] != null) counts[i]++;
  });
  return counts;
}

function messageHtml(m) {
  const key = chatKey();
  let body = "";
  if (m.kind === "voice" && m.audio) {
    const dur = Math.max(1, Math.round(m.dur || 0));
    const label = m.me ? "You" : "Voice message";
    body = `<div class="vmsg" data-vmsg data-vid="${esc(m.id)}" data-dur="${dur}"><button type="button" class="vmsg-play" data-vmsg-play title="Play voice message" aria-label="Play voice message">${sicon("play")}${sicon("pause")}</button><div class="vmsg-main"><div class="vmsg-wave" data-vmsg-wave aria-hidden="true">${vmsgWave(m.id)}</div><div class="vmsg-meta"><span class="vmsg-label">${esc(label)}</span><span class="vmsg-time"><span data-vmsg-now>0:00</span> / ${fmtClock(dur)}</span></div></div><a class="vmsg-dl" href="${m.audio}" download="voice-note.webm" title="Save voice note" aria-label="Save voice note">${sicon("download")}</a></div>`;
  } else if (m.kind === "poll" && m.options) {
    const counts = pollVotes(m);
    const cast = counts.reduce((a, b) => a + b, 0);
    const mine = (m.voters || {})[key];
    body = `<div class="poll-q">${sicon("chart")} ${esc(m.question || "Poll")}</div>${m.options.map((opt, i) => {
      const pct = Math.round((counts[i] / (cast || 1)) * 100);
      return `<button type="button" class="poll-opt${mine === i ? " mine" : ""}" data-poll-vote="${m.id}:${i}"><span class="poll-bar" style="width:${pct}%"></span><span class="poll-label">${esc(opt.text)}${mine === i ? " " + sicon("check") : ""}</span><span class="poll-pct">${pct}%</span></button>`;
    }).join("")}<div class="muted" style="font-size:11px">${cast} vote${cast === 1 ? "" : "s"} · tap to ${mine != null ? "change" : "cast"} your vote</div>`;
  } else if (m.kind === "file" && m.url) {
    if (m.mime && m.mime.startsWith("image/")) {
      body = `<a href="${m.url}" download="${esc(m.file || "image")}"><img class="chat-img" src="${m.url}" alt="${esc(m.file || "image")}"></a><div class="muted" style="font-size:11px">${esc(m.file || "")}</div>`;
    } else if (m.mime && m.mime.startsWith("video/")) {
      body = `<video controls class="chat-img" src="${m.url}"></video><div class="muted" style="font-size:11px">${esc(m.file || "")}</div>`;
    } else if (m.mime && m.mime.startsWith("audio/")) {
      body = `<audio controls class="voice-player" src="${m.url}"></audio><div class="muted" style="font-size:11px">${esc(m.file || "")}</div>`;
    } else {
      body = `<a class="file-link" href="${m.url}" download="${esc(m.file || "file")}">${sicon("clip")} ${esc(m.file || "File")}</a>`;
    }
  } else if (m.kind === "file") {
    body = sicon("clip") + " " + esc(m.file);
  } else if (m.kind === "poll") {
    body = sicon("chart") + " " + esc(cleanText(m.text));
  } else {
    body = esc(cleanText(m.text)).replace(
      /@([\w]+)/g,
      "<b class='mention'>@$1</b>",
    );
  }
  const sysIcon = m.icon ? `<span class="sys-ico">${sicon(m.icon)}</span>` : "";
  const quote = m.reply
    ? `<div class="reply-quote"><strong>${esc(m.reply.author)}</strong><span>${escSnippet(cleanText(m.reply.text), 90)}</span></div>`
    : "";
  const chips = Object.entries(m.reactions || {})
    .filter(([, users]) => users && users.length)
    .map(
      ([emoji, users]) =>
        `<button type="button" class="react-chip${users.includes(key) ? " mine" : ""}" data-react="${m.id}:${esc(emoji)}" title="${esc(REACT_LABELS[emoji] || emoji)}">${REACT_LABELS[emoji] || sicon(emoji)} <span>${users.length}</span></button>`,
    )
    .join("");
  const status = m.me
    ? state.messageStatus[m.id] === "read"
      ? "· Read"
      : state.messageStatus[m.id] === "delivered"
        ? "· Delivered"
        : "· Sent"
    : "";
  const editedTag = m.edited ? ' · <span class="edited-tag">edited</span>' : "";
  const canEdit = m.me && (m.kind == null || m.kind === "text") && typeof m.text === "string";
  return `${quote}${sysIcon}${body}<div class="bubble-tools"><small class="message-meta">${new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${status}${editedTag}</small><span class="bubble-actions"><button type="button" data-react-open="${m.id}" title="React">${sicon("smile")}</button><button type="button" data-reply-to="${m.id}" title="Reply">${sicon("reply")}</button><button type="button" data-pin="${m.id}" title="Pin message">${sicon("pin")}</button>${canEdit ? `<button type="button" data-edit-msg="${m.id}" title="Edit message" aria-label="Edit message">${sicon("memo")}</button>` : ""}${m.me ? `<button type="button" data-del-msg="${m.id}" title="Delete message">${sicon("trash")}</button>` : ""}</span></div>${chips ? `<div class="react-row">${chips}</div>` : ""}<div class="react-picker" data-picker="${m.id}" hidden>${REACT_EMOJI.map((e) => `<button type="button" data-react="${m.id}:${e}" title="${REACT_LABELS[e]}" aria-label="React ${REACT_LABELS[e]}">${REACT_LABELS[e]}</button>`).join("")}</div>`;
}

// ---------- group chat options (three-dot menu + utilities) ----------
const MUTE_CHOICES = [
  { id: "1h", label: "1 hour", ms: 3600000 },
  { id: "8h", label: "8 hours", ms: 8 * 3600000 },
  { id: "1w", label: "1 week", ms: 7 * 86400000 },
  { id: "forever", label: "Always", ms: Infinity },
];
const GROUP_LOGOS = ["book", "fire", "star", "target", "users", "globe", "rocket", "palette", "music", "brain", "chat", "trophy"];
let groupSearch = null; // { id, q }
let groupNav = null; // { id, matches: [msgIdx], pos }
let groupMedia = null; // { id, tab, shown }
let mediaViewer = null; // { items: [{url,name,mime}], pos, title }

function isGroupChat(id) {
  return allGroups().some((g) => g.id === id);
}
function groupById(id) {
  return allGroups().find((g) => g.id === id);
}
function isGroupOwner(id) {
  const g = groupById(id);
  return Boolean(g && g.ownerId && g.ownerId === chatKey());
}
function muteRecord(id) {
  return (state.mutedChats || {})[id];
}
function isChatMuted(id) {
  const rec = muteRecord(id);
  if (rec == null) return false;
  if (rec === "forever") return true;
  const until = Number(rec);
  if (!Number.isFinite(until)) return false;
  if (until <= Date.now()) {
    const next = { ...(state.mutedChats || {}) };
    delete next[id];
    state.mutedChats = next;
    persist();
    return false;
  }
  return true;
}
function muteLabel(id) {
  const rec = muteRecord(id);
  if (rec === "forever") return "Muted · always";
  const ms = Number(rec) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `Muted · ${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Muted · ${hours}h left`;
  return `Muted · ${Math.round(hours / 24)}d left`;
}
function setChatMute(id, choiceId) {
  // DMs and self-chat mute locally (cloud push only applies to groups).
  const c = MUTE_CHOICES.find((x) => x.id === choiceId);
  if (!c) return false;
  state.mutedChats = {
    ...(state.mutedChats || {}),
    [id]: c.ms === Infinity ? "forever" : Date.now() + c.ms,
  };
  persist();
  pushMuteToCloud(id);
  rerenderChat();
  const g = groupById(id);
  notify(c.id === "forever" ? `Muted ${g?.name || "group"} · always` : `Muted ${g?.name || "group"} · ${c.label}`);
  return true;
}
function clearChatMute(id) {
  if (!isChatMuted(id)) return false;
  const next = { ...(state.mutedChats || {}) };
  delete next[id];
  state.mutedChats = next;
  persist();
  pushMuteToCloud(id);
  rerenderChat();
  notify(`Unmuted ${groupById(id)?.name || "group"}`);
  return true;
}
function rerenderChat() {
  renderMessages($("#tab-messages") || $("#community-body"));
}
function senderLabel(m) {
  if (!m) return "Group member";
  if (m.me) return "You";
  return m.sysName || "Group member";
}
function groupRoster(id) {
  const roster = new Map();
  for (const m of state.messages[id] || []) {
    const key = m.me ? `me:${chatKey()}` : `other:${m.sender_id || "member"}`;
    if (!roster.has(key)) {
      roster.set(key, { key, you: Boolean(m.me), count: 0, last: 0 });
    }
    const entry = roster.get(key);
    entry.count += 1;
    entry.last = Math.max(entry.last, m.ts || 0);
  }
  return [...roster.values()].sort((a, b) => (b.you ? 1 : 0) - (a.you ? 1 : 0) || b.last - a.last);
}
function groupMenuMarkup(id) {
  const role = myGroupRole(id);
  const owner = isGroupOwner(id) || role === "owner";
  const canManage = owner || role === "admin";
  const muted = isChatMuted(id);
  const item = (act, icon, label, sub) => `<button type="button" data-gact="${act}" data-gid="${esc(id)}"><span class="gact-ico">${sicon(icon)}</span><span class="gact-txt"><strong>${label}</strong>${sub ? `<small>${sub}</small>` : ""}</span></button>`;
  return `${item("search", "search", "Search messages", "Find text, files and links")}`
    + `${item(muted ? "unmute" : "mute", muted ? "volume" : "mute", muted ? "Unmute notifications" : "Mute notifications", muted ? esc(muteLabel(id)) : "Silence this group")}`
    + `${item("media", "film", "Media, files & links", "Photos, videos, files")}`
    + `${item("members", "users", "Members", `${groupRoster(id).length || "No"} active here`)}`
    + `${item("info", "book", "Group info", "About this group")}`
    + `<hr class="gsep">`
    + `${canManage ? item("settings", "gear", "Group settings", "Name, description, topics") : ""}`
    + `${item("clear", "trash", "Clear local history", "Removes messages on this device")}`
    + `${owner ? "" : item("report", "flag", "Report group", "Alert moderation")}`
    + `${owner ? item("disband", "trash", "Delete group", "Remove this group") : item("leave", "run", "Leave group", "Stop receiving messages")}`;
}

// Pin helpers — state.pins[chatId] is an ARRAY of pinned message ids so
// multiple messages can stay pinned (the old single-slot design silently
// discarded the previous pin whenever a new one was added).
function pinnedIdsFor(id) {
  const raw = (state.pins || {})[id];
  if (!raw) return [];
  // migrate the legacy single-string format
  if (typeof raw === "string") return [raw];
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

function togglePinMessage(id, msgId) {
  const pins = { ...(state.pins || {}) };
  const list = pinnedIdsFor(id);
  const idx = list.indexOf(msgId);
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(msgId); // newest pin first
  if (list.length) pins[id] = list.slice(0, 30);
  else delete pins[id];
  state.pins = pins;
  persist();
}

// Three-dot menu inside an open chat. Friends get the full WhatsApp set
// (contact info, media, search, mute, report, block, delete); groups keep
// their existing menu.
function dmMenuMarkup(id) {
  const isFriendChat = (state.friends || []).some((f) => f.id === id) || cloudFriends.some((f) => f.id === id) || isSelfChat(id);
  const self = isSelfChat(id);
  const muted = isChatMuted(id);
  const item = (act, icon, label, sub) => `<button type="button" data-gact="${act}" data-gid="${esc(id)}"><span class="gact-ico">${sicon(icon)}</span><span class="gact-txt"><strong>${label}</strong>${sub ? `<small>${sub}</small>` : ""}</span></button>`;
  // Media & docs stay available in every chat (self-chat included) — notes
  // with files/links are exactly what the doc vault is for.
  const media = item("media", "film", "Media, files & links", "Photos, videos, documents");
  const social = self
    ? ""
    : item("contact", "user", "View contact", "Profile, status and shared media");
  return `${item("search", "search", "Search messages", "Find text, files and links")}`
    + `${media}`
    + `${muted ? item("unmute", "volume", "Unmute notifications", esc(muteLabel(id))) : item("mute", "mute", "Mute notifications", "Silence this chat")}`
    + `${social}`
    + `<hr class="gsep">`
    + `${item("clear", "trash", "Clear local history", "Removes messages on this device")}`
    + `${self ? "" : item("report", "flag", "Report", "Alert moderation")}`
    + `${self || !isFriendChat ? "" : item("block", "lock", "Block", "Stop all contact")}`;
}
function chatMarkup(id) {
  const info = chatDisplayInfo(id);
  const target = info.target;
  const isSelf = isSelfChat(id);
  const msgs = state.messages[id] || [];
  const pinned = pinnedIdsFor(id)
    .map((pid) => msgs.find((m) => m.id === pid))
    .filter(Boolean);
  const pinbar = pinned.length
    ? `<div class="pin-bar" role="list" aria-label="Pinned messages"><span class="pin-count">${sicon("pin")} ${pinned.length}</span><div class="pin-scroll" role="listbox">${pinned
        .map(
          (pm) =>
            `<button type="button" class="pin-item" role="option" data-pin-jump="${pm.id}" title="Jump to pinned message"><b>${esc(senderLabel(pm))}</b><span>${escSnippet(messageText(pm), 60)}</span></button>`,
        )
        .join("")}</div><button type="button" class="icon-btn" data-pins-all title="All pinned messages" aria-label="Show all pinned messages">${sicon("list")}</button><button type="button" class="icon-btn" data-unpin-latest title="Unpin latest" aria-label="Unpin latest pinned message">×</button></div>`
    : "";
  const typing = state.typing[id]
    ? '<div class="typing-indicator">Someone is typing…</div>'
    : "";
  const others =
    presenceInfo.chatId === id ? presenceInfo.users.length : 0;
  const presence =
    backendConfigured && state.user
      ? `<span class="presence" title="People in this chat right now"><i class="${others ? "on" : ""}"></i>${others ? `${others} here now` : "only you here"}</span>`
      : "";
  const reply =
    chatReply && chatReply.chatId === id
      ? `<div class="reply-strip"><div><strong>Replying to ${esc(chatReply.author)}</strong><span>${escSnippet(chatReply.text, 80)}</span></div><button type="button" data-reply-cancel title="Cancel reply">×</button></div>`
      : "";
  const rec = voiceRec
    ? `<div class="rec-bar${voiceRec.paused ? " paused" : ""}" role="status" aria-label="Recording voice note"><button type="button" class="icon-btn rec-btn" data-rec-cancel title="Discard recording" aria-label="Discard recording">${sicon("trash")}</button><span class="rec-dot" aria-hidden="true"></span><button type="button" class="icon-btn rec-pause" data-rec-pause title="Pause recording" aria-label="Pause or resume recording">${sicon("pause")}${sicon("play")}</button><span class="rec-wave" data-rec-wave aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="rec-time" data-rec-time>00:00</span><span class="rec-hint">Recording… tap Send when done</span><button type="button" class="primary rec-send" data-rec-send>${sicon("check")} <span>Send</span></button></div>`
    : "";
  const isFriendChat = (state.friends || []).some((f) => f.id === id) || cloudFriends.some((f) => f.id === id) || isSelf;
  const isGroup = allGroups().some((g) => g.id === id);
  const mutedTag = (isGroup || isFriendChat) && isChatMuted(id) ? ' <span class="tag">muted</span>' : "";
  const nav = groupNav && groupNav.id === id && groupNav.matches.length
    ? `<div class="msg-nav"><button type="button" data-gnav="prev" aria-label="Previous match">‹</button><span>${groupNav.pos + 1} / ${groupNav.matches.length}</span><button type="button" data-gnav="next" aria-label="Next match">›</button><button type="button" data-gnav="close" aria-label="Close search navigation">×</button></div>`
    : "";
  const menu = isGroup && !isFriendChat
    ? `<span class="post-menu-wrap"><button type="button" class="icon-btn wa-menu-btn" data-chat-menu="${id}" title="Group options" aria-label="Group options" aria-haspopup="true">${sicon("gear")}</button><span class="post-menu chat-menu" data-chat-pop="${id}" hidden>${groupMenuMarkup(id)}</span></span>`
    : `<span class="post-menu-wrap"><button type="button" class="icon-btn wa-menu-btn" data-chat-menu="${id}" title="Conversation options" aria-label="Conversation options" aria-haspopup="true">${sicon("gear")}</button><span class="post-menu chat-menu" data-chat-pop="${id}" hidden>${dmMenuMarkup(id)}</span></span>`;
  const headPhoto = isGroup ? "" : isSelf
    ? `<span class="chat-avatar">${avatarMarkup(resolvePhoto(state.profile.photo), (state.profile.name || "Y")[0].toUpperCase())}</span>`
    : `<span class="chat-avatar">${avatarMarkup(info.photo || "", (info.name.replace(/^@/, "")[0] || "?").toUpperCase())}</span>`;
  return `<div class="chat-head wa-head"><button type="button" class="wa-back" data-wa-back title="Back to chats" aria-label="Back to chats">${sicon("reply")}<span>Chats</span></button><button type="button" class="chat-head-who" data-chat-profile="${id}" title="Open profile"><span class="chat-ava">${isGroup ? groupAvatarMarkup(allGroups().find((g) => g.id === id)) : headPhoto}</span><span class="chat-head-txt"><strong>${esc(info.name || "@" + (target?.username || target?.handle || "?"))}</strong>${mutedTag}${typing}${presence}</span></button><span class="friend-actions"><button type="button" class="primary wa-call" data-start-call="${id}">${sicon("phone")} <span>Call</span></button>${menu}</span></div>${pinbar}${nav}<div class="chat-body">${msgs.map((m, i) => `<div class="bubble ${m.me ? "me" : ""}" data-midx="${i}">${messageHtml(m)}</div>`).join("") || '<span class="muted">No messages yet. Start the conversation.</span>'}</div>${reply}${rec}<div class="chat-input"><textarea class="input autogrow chat-textarea" id="chat-text" rows="1" data-grow-max="150" placeholder="type a message" aria-label="Type a message"></textarea><div class="chat-extras-wrap"><button type="button" class="icon-btn chat-extras-toggle" data-chat-extras title="Add to your message" aria-label="Add to your message" aria-haspopup="true" aria-expanded="false"><span class="chat-extras-plus">${sicon("plus")}</span></button><div class="chat-extras-menu" data-chat-extras-pop hidden role="dialog" aria-label="Add to your message"><div class="chat-extras-head"><strong>Add to chat</strong><button type="button" class="icon-btn chat-extras-close" data-chat-extras-close title="Close" aria-label="Close menu">${sicon("x")}</button></div><div class="chat-extras-grid"><label class="chat-extras-item" title="Attach a file up to 3 MB"><input type="file" id="chat-file" hidden><span class="chat-extras-ic file">${sicon("clip")}</span><span>File</span></label><button type="button" class="chat-extras-item" id="poll-button" title="Create a poll"><span class="chat-extras-ic poll">${sicon("chart")}</span><span>Poll</span></button><button type="button" class="chat-extras-item" id="voice-button" title="Record a voice note"><span class="chat-extras-ic voice">${sicon("mic")}</span><span>Voice</span></button></div><div class="chat-extras-foot">Files up to 3 MB. Attach documents, start a poll, or record a voice note.</div></div></div><button type="button" class="primary wa-send" id="send-message" aria-label="Send message">Send</button></div>`;
}

function closeChatExtras(root) {
  const pop = root?.querySelector("[data-chat-extras-pop]");
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  root
    .querySelector("[data-chat-extras]")
    ?.setAttribute("aria-expanded", "false");
}

function bindChat(root, id) {
  subscribeToChat(id);
  subscribePresenceFor(id);
  loadCloudHistory(id, root).catch(() => {});
  // Realtime gaps (laptop sleep, a dropped channel, a missed INSERT) close
  // silently: when the tab becomes visible again, refetch history for the
  // conversation that is open — no navigating away and back required.
  window.__sfChatVisRefresh = () => {
    if (state.activeChat === id) loadCloudHistory(id, chatRoot()).catch(() => {});
  };
  if (!window.__sfChatVisHook) {
    window.__sfChatVisHook = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && typeof window.__sfChatVisRefresh === "function") {
        window.__sfChatVisRefresh();
      }
    });
  }
  $("#send-message", root).onclick = () => {
    const input = $("#chat-text", root);
    const value = input.value;
    input.value = "";
    input.style.height = "";
    sendChat(id, value);
    input.focus();
  };
  $("[data-chat-menu]", root)?.addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = root.querySelector(`[data-chat-pop="${id}"]`);
    if (!pop) return;
    const open = pop.hidden;
    closePostMenus();
    document
      .querySelectorAll("[data-chat-pop]")
      .forEach((el) => (el.hidden = true));
    const xp = root.querySelector("[data-chat-extras-pop]");
    if (xp && !xp.hidden) {
      closeChatExtras(root);
    }
    pop.hidden = !open;
    if (!pop.hidden) {
      const first = pop.querySelector("button");
      if (first) first.focus();
    }
  });
  // WhatsApp-style back chip in the chat header → returns to the chat list
  // (all viewports; the list simply stays visible on wide screens).
  $("[data-wa-back]", root)?.addEventListener("click", () => {
    state.activeChat = null;
    window.__sfChatVisRefresh = null;
    // Immersive mode: returning from a chat must restore the community
    // heading + subtabs, not just swap the panes.
    if (state.tab === "community" && state.subtab === "messages") renderCommunity();
    else renderMessages(root);
  });
  // Clicking anywhere outside the open chat menu closes it (Escape is
  // already handled globally). Guarded: the chat root outlives re-renders.
  if (!window.__sfChatMenuCloser) {
    window.__sfChatMenuCloser = true;
    document.addEventListener("pointerdown", (e) => {
      const open = document.querySelector('[data-chat-pop]:not([hidden])');
      if (open && !open.contains(e.target) && !e.target.closest?.("[data-chat-menu]")) {
        open.hidden = true;
      }
    }, true);
  }
  bindGroupMenuActions(root);
  $$("[data-chat-block]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const target = (state.friends || []).find((f) => f.id === b.dataset.chatBlock)
          || cloudFriends.find((f) => f.id === b.dataset.chatBlock);
        if (!target) return;
        askBlockUser({
          id: target.id,
          username: target.username || target.handle,
          name: "@" + (target.username || target.handle),
          context: "chat",
        });
      }),
  );
  // Distinguish header-photo click (contact profile) from the back chip.
  $("[data-chat-profile]", root)?.addEventListener("click", (e) => {
    e.stopPropagation();
    const info = chatDisplayInfo(id);
    if (isSelfChat(id)) return notify("This is your own space — notes to yourself live here.");
    if (!info.target) return;
    openContactCard(id, info);
  });
  $("#chat-text", root).oninput = (event) => {
    // Typing pings are broadcast throttled so every keystroke doesn't spam
    // the realtime channel.
    const now = Date.now();
    const isTyping = Boolean(event.target.value.trim());
    if (isTyping && now - (chatTypingSentAt || 0) > 2500) {
      chatTypingSentAt = now;
      conversationSubscription?.sendTyping(
        state.user?.id || "local-user",
        true,
      );
    } else if (!isTyping && chatTypingSentAt) {
      chatTypingSentAt = 0;
      conversationSubscription?.sendTyping(
        state.user?.id || "local-user",
        false,
      );
    }
    const input = event.target;
    let pop = $("#mention-pop", root);
    const match = input.value.match(/@([\w]*)$/);
    const cands = match
      ? state.friends
          .filter((f) =>
            f.username.toLowerCase().startsWith(match[1].toLowerCase()),
          )
          .slice(0, 5)
      : [];
    if (!cands.length) {
      pop?.remove();
      return;
    }
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "mention-pop";
      pop.className = "mention-pop";
      input.parentElement?.append(pop);
    }
    pop.innerHTML = cands
      .map(
        (f) =>
          `<button type="button" data-mention="${esc(f.username)}">@${esc(f.username)}</button>`,
      )
      .join("");
    $$("[data-mention]", pop).forEach(
      (b) =>
        (b.onclick = () => {
          input.value = input.value.replace(
            /@[\w]*$/,
            "@" + b.dataset.mention + " ",
          );
          pop.remove();
          input.focus();
        }),
    );
  };
  $("#chat-text", root).onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const input = e.target;
      const value = input.value;
      input.value = "";
      input.style.height = "";
      sendChat(id, value);
      input.focus();
    }
  };
  $("#chat-file", root).onchange = (e) => {
    if (isBlockedKey(id)) {
      renderCommunity();
      return notify("You have blocked this conversation");
    }
    const file = e.target.files[0];
    if (!file) return;
    closeChatExtras(root);
    if (file.size > 3 * 1024 * 1024)
      return notify("Files must be under 3 MB");
    const reader = new FileReader();
    reader.onload = () => {
      state.messages[id] = [
        ...(state.messages[id] || []),
        {
          id: uid(),
          me: true,
          kind: "file",
          file: file.name,
          url: reader.result,
          mime: file.type || "",
          size: file.size,
          ts: Date.now(),
        },
      ];
      persist();
      renderMessages(root);
    };
    reader.readAsDataURL(file);
  };
  const extrasToggle = $("[data-chat-extras]", root);
  const extrasPop = $("[data-chat-extras-pop]", root);
  if (extrasToggle && extrasPop) {
    extrasToggle.onclick = (e) => {
      e.stopPropagation();
      const open = !extrasPop.hidden;
      closePostMenus();
      extrasPop.hidden = open;
      extrasToggle.setAttribute("aria-expanded", !open);
    };
    $("button[data-chat-extras-close]", root)?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeChatExtras(root);
    });
    extrasPop.onclick = (e) => e.stopPropagation();
    // The chat root element survives re-renders (only innerHTML is swapped),
    // so this closer must be attached once — otherwise every chat open adds
    // another duplicate listener.
    if (!root.dataset.extrasCloser) {
      root.dataset.extrasCloser = "1";
      root.addEventListener("click", (e) => {
        const pop = $("[data-chat-extras-pop]", root);
        const toggle = $("[data-chat-extras]", root);
        if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== toggle && !toggle?.contains(e.target)) {
          closeChatExtras(root);
        }
      });
    }
  }
  $("#poll-button", root).onclick = () => {
    closeChatExtras(root);
    openPollBuilder(id, root);
  };
  $("#voice-button", root).onclick = () => {
    closeChatExtras(root);
    if (voiceRec) stopRecording("send");
    else startRecording(id, root);
  };
  // --- Voice message player (delegated: bubbles survive re-renders) ---
  // Guarded: the chat root outlives re-renders, so without this every chat
  // open would stack another play/scrub handler (tap = play+instant-pause).
  if (!root.dataset.voiceDelegated) {
    root.dataset.voiceDelegated = "1";
    root.addEventListener("click", (e) => {
    const playBtn = e.target.closest?.("[data-vmsg-play]");
    if (playBtn) {
      const widget = playBtn.closest("[data-vmsg]");
      const vid = widget?.dataset.vid;
      const src = widget?.querySelector(".vmsg-dl")?.getAttribute("href");
      if (!vid || !src) return;
      if (activeVoice && activeVoice.id === vid) {
        if (activeVoice.audio.paused) activeVoice.audio.play();
        else activeVoice.audio.pause();
        widget.classList.toggle("playing", !activeVoice.audio.paused);
        return;
      }
      stopActiveVoice();
      const av = ensureActiveVoice();
      av.id = vid;
      av.audio.src = src;
      av.audio.play().catch(() => notify("Couldn't play this voice note"));
      widget.classList.add("playing");
    }
  });
  // Scrub: press on the waveform and drag to move through the message.
  // (Inside the same once-only guard above.)
  root.addEventListener("pointerdown", (e) => {
    const wave = e.target.closest?.("[data-vmsg-wave]");
    if (!wave) return;
    const widget = wave.closest("[data-vmsg]");
    const vid = widget?.dataset.vid;
    const seek = (ev) => {
      const r = wave.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      if (activeVoice?.id === vid) {
        const dur = Number(widget.dataset.dur) || activeVoice.audio.duration || 1;
        try {
          activeVoice.audio.currentTime = frac * dur;
        } catch {
          /* ignore */
        }
        paintVoice(vid, frac);
      } else {
        stopActiveVoice();
        paintVoice(vid, frac);
      }
    };
    seek(e);
    const move = (ev) => seek(ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  }
  // Recorder pause / resume.
  $("[data-rec-pause]", root)?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!voiceRec) return;
    if (voiceRec.paused) {
      voiceRec.rec.resume();
      voiceRec.paused = false;
      // Shift the clock origin so speech time continues from where it froze.
      voiceRec.startedAt = Date.now() - (voiceRec.tickerAt - voiceRec.startedAt);
    } else {
      voiceRec.rec.pause();
      voiceRec.paused = true;
    }
    $(".rec-bar", root)?.classList.toggle("paused", voiceRec.paused);
  });
  $("[data-rec-send]", root)?.addEventListener("click", () =>
    stopRecording("send"),
  );
  $("[data-rec-cancel]", root)?.addEventListener("click", () =>
    stopRecording("cancel"),
  );
  $("[data-reply-cancel]", root)?.addEventListener("click", () => {
    chatReply = null;
    renderMessages(root);
  });
  // Bubble buttons use one delegated listener so messages appended by
  // realtime updates (no full re-render) stay interactive. The active chat
  // id rides on the root dataset so switching chats never leaves a stale
  // closure behind.
  root.dataset.chatDelegatedId = id;
  if (!root.dataset.bubbleDelegated) {
    root.dataset.bubbleDelegated = "1";
    root.addEventListener("click", (e) => {
      const cid = root.dataset.chatDelegatedId;
      const pin = e.target.closest("[data-pin]");
      if (pin && root.contains(pin)) {
        const wasPinned = pinnedIdsFor(cid).includes(pin.dataset.pin);
        togglePinMessage(cid, pin.dataset.pin);
        renderMessages(root);
        notify(wasPinned ? "Message unpinned" : sicon("pin") + " Message pinned");
        return;
      }
      const reactOpen = e.target.closest("[data-react-open]");
      if (reactOpen && root.contains(reactOpen)) {
        e.stopPropagation();
        const picker = $(`[data-picker="${reactOpen.dataset.reactOpen}"]`, root);
        if (!picker) return;
        const willOpen = picker.hidden;
        if (willOpen) $$("[data-picker]", root).forEach((p) => (p.hidden = true));
        picker.hidden = !willOpen;
        return;
      }
      const react = e.target.closest("[data-react]");
      if (react && root.contains(react)) {
        const v = react.dataset.react;
        const sep = v.indexOf(":");
        const mid = v.slice(0, sep);
        const emoji = v.slice(sep + 1);
        const msg = (state.messages[cid] || []).find((m) => m.id === mid);
        if (!msg) return;
        msg.reactions = msg.reactions || {};
        const users = msg.reactions[emoji] || [];
        const key = chatKey();
        const adding = !users.includes(key);
        msg.reactions[emoji] = adding
          ? [...users, key]
          : users.filter((u) => u !== key);
        if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
        persist();
        // Server sync is best-effort: the RPC re-verifies visibility, and a
        // reopen converges via history merge. Local paint never waits on it.
        if (msg.cloudId && signedIn()) {
          reactToMessage(msg.cloudId, emoji).catch(() => {});
        }
        renderMessages(root);
        return;
      }
      const reply = e.target.closest("[data-reply-to]");
      if (reply && root.contains(reply)) {
        const msg = (state.messages[cid] || []).find(
          (m) => m.id === reply.dataset.replyTo,
        );
        if (!msg) return;
        const target =
          allGroups().find((g) => g.id === cid) ||
          state.friends.find((f) => f.id === cid);
        chatReply = {
          chatId: cid,
          author: msg.me
            ? "You"
            : target?.name || (target ? "@" + target.username : "Them"),
          text: messageText(msg),
        };
        renderMessages(root);
        $("#chat-text", root)?.focus();
        return;
      }
      const vote = e.target.closest("[data-poll-vote]");
      if (vote && root.contains(vote)) {
        const v = vote.dataset.pollVote;
        const sep = v.indexOf(":");
        const mid = v.slice(0, sep);
        const idx = Number(v.slice(sep + 1));
        const msg = (state.messages[cid] || []).find((m) => m.id === mid);
        if (!msg || !msg.options) return;
        msg.voters = msg.voters || {};
        if (msg.voters[chatKey()] === idx) delete msg.voters[chatKey()];
        else msg.voters[chatKey()] = idx;
        persist();
        renderMessages(root);
        return;
      }
      const del = e.target.closest("[data-del-msg]");
      if (del && root.contains(del)) {
        e.stopPropagation();
        askDeleteMessage(cid, del.dataset.delMsg, root);
        return;
      }
      const edit = e.target.closest("[data-edit-msg]");
      if (edit && root.contains(edit)) {
        e.stopPropagation();
        startMessageEdit(cid, edit.dataset.editMsg, root);
      }
    });
  }
  $("[data-unpin-latest]", root)?.addEventListener("click", () => {
    const list = pinnedIdsFor(id);
    if (!list.length) return;
    togglePinMessage(id, list[0]);
    renderMessages(root);
    notify("Latest pin removed");
  });
  $$("[data-pin-jump]", root).forEach(
    (b) =>
      (b.onclick = () => jumpToPinnedMessage(id, b.dataset.pinJump)),
  );
  $("[data-pins-all]", root)?.addEventListener("click", () => {
    openPinnedList(id);
  });
  $("[data-pins-all]", root)?.addEventListener("click", () => {
    openPinnedList(id);
  });
  const call = $("[data-start-call]", root);
  if (call)
    call.onclick = () => {
      // Real ring path: history + participants + Accept/Decline — never a
      // bare local state.call flip that never leaves this device.
      startOutgoingCall(id);
    };
}

function extractLinks(text) {
  const out = [];
  const seen = new Set();
  const re = /https?:\/\/[^\s)>\]]+/gi;
  let m;
  while ((m = re.exec(String(text || ""))) && out.length < 200) {
    const clean = m[0].replace(/[.,;!?]+$/, "");
    try {
      const u = new URL(clean);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (!seen.has(u.href)) {
        seen.add(u.href);
        out.push(u.href);
      }
    } catch { /* malformed URL — skip */ }
  }
  return out;
}
function fileIcon(mime, name) {
  const t = String(mime || "");
  const n = String(name || "");
  if (t.startsWith("image/")) return "camera";
  if (t.startsWith("video/")) return "film";
  if (t.startsWith("audio/")) return "music";
  if (t.includes("pdf") || /\.pdf$/i.test(n)) return "doc";
  if (/word|document|sheet|excel|csv|presentation|powerpoint|zip|officedocument/i.test(t) || /\.(docx?|xlsx?|csv|pptx?|txt|md|zip|rar)$/i.test(n)) return "doc";
  return "clip";
}
function groupShared(id) {
  const images = [];
  const videos = [];
  const files = [];
  const links = [];
  for (const [idx, m] of (state.messages[id] || []).entries()) {
    if (m.kind === "file" && m.url) {
      const item = {
        idx,
        name: m.file || "file",
        url: m.url,
        mime: m.mime || "",
        size: m.size || 0,
        ts: m.ts || Date.now(),
        sender: senderLabel(m),
      };
      if (item.mime.startsWith("image/")) images.push(item);
      else if (item.mime.startsWith("video/")) videos.push(item);
      else files.push(item);
    }
    for (const url of extractLinks(messageText(m))) {
      let domain = "";
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
      links.push({ idx, url, domain, ts: m.ts || Date.now(), sender: senderLabel(m) });
    }
  }
  const byTs = (a, b) => b.ts - a.ts;
  images.sort(byTs);
  videos.sort(byTs);
  files.sort(byTs);
  links.sort(byTs);
  return { images, videos, files, links };
}
function fmtSharedDate(ts) {
  try {
    return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function openGroupMedia(id) {
  if (!isGroupChat(id) && targetKind(id) === null) return;
  groupMedia = { id, tab: "media", shown: 30 };
  paintGroupMedia();
}
function groupMediaCounts(id) {
  const s = groupShared(id);
  return { media: s.images.length + s.videos.length, files: s.files.length, links: s.links.length };
}
function paintGroupMedia() {
  if (!groupMedia) return;
  const { id, tab } = groupMedia;
  // DMs have no group record — a display name stands in for the modal title.
  const g = groupById(id) || { name: chatDisplayInfo(id).name || "chat" };
  if (!g) {
    groupMedia = null;
    return;
  }
  const s = groupShared(id);
  const counts = groupMediaCounts(id);
  let list = [];
  if (tab === "media") list = [...s.images.map((x) => ({ ...x, kind: "image" })), ...s.videos.map((x) => ({ ...x, kind: "video" }))].sort((a, b) => b.ts - a.ts);
  else if (tab === "files") list = s.files;
  else list = s.links;
  const shown = list.slice(0, groupMedia.shown);
  const rest = list.length - shown.length;
  const empty = { media: "No media shared yet.", files: "No files shared yet.", links: "No links shared yet." };
  const head = (t, label, n) => `<button type="button" class="filter ${tab === t ? "active" : ""}" data-gm-tab="${t}">${label} (${n})</button>`;
  let body = "";
  if (!list.length) {
    body = `<p class="muted" style="padding:16px 4px">${empty[tab]}</p>`;
  } else if (tab === "media") {
    body = `<div class="media-grid">${shown.map((it, i) => it.kind === "image"
      ? `<button type="button" class="media-thumb" data-gm-view="${i}" title="${esc(it.name)}"><img src="${it.url}" alt="${esc(it.name)}" loading="lazy"></button>`
      : `<button type="button" class="media-thumb" data-gm-view="${i}" title="${esc(it.name)}"><video src="${it.url}" preload="metadata" muted playsinline></video><span class="media-play">${sicon("play")}</span></button>`).join("")}</div>`;
  } else if (tab === "files") {
    body = `<div class="file-list">${shown.map((it) => `<div class="file-row"><span class="file-ico">${sicon(fileIcon(it.mime, it.name))}</span><span class="file-meta"><strong title="${esc(it.name)}">${esc(it.name)}</strong><small class="muted">${esc(it.sender)} · ${fmtSharedDate(it.ts)}${it.size ? ` · ${fmtSize(it.size)}` : ""}</small></span><a class="ghost" href="${it.url}" download="${esc(it.name)}" title="Open or download">Open</a></div>`).join("")}</div>`;
  } else {
    body = `<div class="file-list">${shown.map((it) => `<div class="file-row"><span class="file-ico">${sicon("globe")}</span><span class="file-meta"><strong title="${esc(it.url)}">${esc(it.domain || it.url)}</strong><small class="muted">${esc(it.sender)} · ${fmtSharedDate(it.ts)}</small></span><a class="ghost" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" title="Open link">Visit</a></div>`).join("")}</div>`;
  }
  if (rest > 0) body += `<div style="text-align:center;margin-top:12px"><button type="button" class="ghost" data-gm-more>Show more (${rest} remaining)</button></div>`;
  let modal = $("#group-media-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "group-media-modal";
    $("#modal-root").append(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeGroupMedia();
    });
  }
  modal.innerHTML = `<div class="modal wide"><div class="eyebrow">Shared in ${esc(g.name)}</div><h2>Media, files & links</h2><div class="filter-bar">${head("media", "Media", counts.media)}${head("files", "Files", counts.files)}${head("links", "Links", counts.links)}</div><div style="margin-top:12px;max-height:min(52vh,440px);overflow-y:auto">${body}</div><div class="modal-actions"><button type="button" class="ghost" data-gm-close>Close</button></div></div>`;
  $$("[data-gm-tab]", modal).forEach((b) => (b.onclick = () => {
    groupMedia.tab = b.dataset.gmTab;
    groupMedia.shown = 30;
    paintGroupMedia();
  }));
  const more = $("[data-gm-more]", modal);
  if (more) more.onclick = () => {
    groupMedia.shown += 30;
    paintGroupMedia();
  };
  $$("[data-gm-view]", modal).forEach((b) => (b.onclick = () => openMediaViewer(id, Number(b.dataset.gmView))));
  $("[data-gm-close]", modal).onclick = () => closeGroupMedia();
}
function closeGroupMedia() {
  groupMedia = null;
  $("#group-media-modal")?.remove();
}
function openMediaViewer(id, pos) {
  const s = groupShared(id);
  const items = [...s.images.map((x) => ({ ...x, kind: "image" })), ...s.videos.map((x) => ({ ...x, kind: "video" }))].sort((a, b) => b.ts - a.ts);
  if (!items.length) return;
  mediaViewer = { items, pos: Math.min(Math.max(0, pos), items.length - 1), title: groupById(id)?.name || "Group" };
  paintMediaViewer();
}
function paintMediaViewer() {
  if (!mediaViewer) return;
  const { items, pos, title } = mediaViewer;
  const it = items[pos];
  if (!it) {
    mediaViewer = null;
    return;
  }
  let modal = $("#media-viewer-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal-backdrop viewer-backdrop";
    modal.id = "media-viewer-modal";
    $("#modal-root").append(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeMediaViewer();
    });
  }
  modal.innerHTML = `<div class="viewer"><div class="viewer-head"><span class="muted">${esc(title)} · ${pos + 1} / ${items.length}</span><button type="button" class="icon-btn" data-mv-close aria-label="Close viewer">×</button></div><div class="viewer-body">${it.kind === "image" ? `<img src="${it.url}" alt="${esc(it.name)}">` : `<video src="${it.url}" controls autoplay playsinline></video>`}<button type="button" class="viewer-arrow left" data-mv-prev aria-label="Previous">‹</button><button type="button" class="viewer-arrow right" data-mv-next aria-label="Next">›</button></div><div class="viewer-foot muted">${esc(it.name)} · ${esc(it.sender)} · ${fmtSharedDate(it.ts)}</div></div>`;
  $("[data-mv-close]", modal).onclick = () => closeMediaViewer();
  $("[data-mv-prev]", modal).onclick = (e) => {
    e.stopPropagation();
    mediaViewer.pos = (mediaViewer.pos - 1 + items.length) % items.length;
    paintMediaViewer();
  };
  $("[data-mv-next]", modal).onclick = (e) => {
    e.stopPropagation();
    mediaViewer.pos = (mediaViewer.pos + 1) % items.length;
    paintMediaViewer();
  };
}
function closeMediaViewer() {
  mediaViewer = null;
  $("#media-viewer-modal")?.remove();
}
// Actions behind the three-dot menu of a DM chat (friends + self-chat).
function dmAction(act, id, root) {
  const info = chatDisplayInfo(id);
  const name = info.name || "this chat";
  if (act === "search") return openGroupSearch(id);
  if (act === "media") return openGroupMedia(id);
  if (act === "mute") return openDmMuteModal(id, name);
  if (act === "unmute") return clearChatMute(id);
  if (act === "contact") return isSelfChat(id) ? notify("This is your own space — notes to yourself live here.") : openContactCard(id, info);
  if (act === "clear") {
    return confirmBox(`Clear ${isSelfChat(id) ? "your notes" : name} history?`, "Messages on this device will be removed. New messages still arrive.", () => {
      const msgs = { ...(state.messages || {}) };
      delete msgs[id];
      state.messages = msgs;
      const pins = { ...(state.pins || {}) };
      delete pins[id];
      state.pins = pins;
      if (groupNav?.id === id) groupNav = null;
      if (groupSearch?.id === id) groupSearch = null;
      persist();
      renderMessages($("#tab-messages") || $("#community-body"));
      notify("Chat history cleared");
    });
  }
  if (act === "report") {
    if (isSelfChat(id)) return;
    const target = info.target;
    if (!target) return notify("Could not identify that user");
    return openDmReport(id, info.name);
  }
  if (act === "block") {
    if (isSelfChat(id)) return;
    const target = info.target;
    if (!target) return notify("Could not identify that user");
    return askBlockUser({
      id: target.id,
      username: target.username || target.handle,
      name: info.name.startsWith("@") ? info.name : "@" + (target.username || target.handle || info.name),
      context: "chat",
    });
  }
}
function openDmMuteModal(id, name) {
  const cur = muteRecord(id);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Notifications</div><h2>Mute ${esc(name)}?</h2><p class="muted">You can still open the chat and read everything. Only notifications pause.${isChatMuted(id) ? ` Currently: <strong>${esc(muteLabel(id))}</strong>.` : ""}</p><div class="reason-list">${MUTE_CHOICES.map((c) => `<label><input type="radio" name="mute-choice" value="${c.id}"${cur === "forever" && c.id === "forever" ? " checked" : ""}> ${c.id === "forever" ? "Always (until turned back on)" : c.label}</label>`).join("")}</div><p class="st-confirm-err" data-mute-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-mute-cancel>Cancel</button>${isChatMuted(id) ? `<button type="button" class="ghost" data-mute-off>Unmute</button>` : ""}<button type="button" class="primary" data-mute-save>Save</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-mute-err]");
  modal.querySelector("[data-mute-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  const off = modal.querySelector("[data-mute-off]");
  if (off) off.onclick = () => {
    modal.remove();
    clearChatMute(id);
  };
  modal.querySelector("[data-mute-save]").onclick = () => {
    const choice = modal.querySelector('input[name="mute-choice"]:checked')?.value || "";
    if (!choice) {
      err.textContent = "Pick a duration first.";
      err.hidden = false;
      return;
    }
    if (!setChatMute(id, choice)) {
      err.textContent = "Couldn't save that setting — try again.";
      err.hidden = false;
      return;
    }
    modal.remove();
  };
}
function openDmReport(id, name) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Report · ${esc(name)}</div><h2>What's wrong with this chat?</h2><p class="muted">Pick the closest reason. Reports go to moderation — never public.</p><div class="reason-list">${BLOCK_REASONS.map((r) => `<label><input type="radio" name="dm-report-reason" value="${esc(r)}"> ${esc(r)}</label>`).join("")}</div><label class="field-label">Details (optional)<textarea class="textarea autogrow" data-dm-report-details rows="2" maxlength="2000" placeholder="What happened in this conversation?"></textarea></label><p class="st-confirm-err" data-dm-report-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-dm-report-cancel>Cancel</button><button type="button" class="primary" data-dm-report-send>Send report</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-dm-report-err]");
  modal.querySelector("[data-dm-report-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.querySelector("[data-dm-report-send]").onclick = async () => {
    const reason = modal.querySelector('input[name="dm-report-reason"]:checked')?.value || "";
    if (!reason) {
      err.textContent = "Choose a reason first.";
      err.hidden = false;
      return;
    }
    const details = modal.querySelector("[data-dm-report-details]").value.trim().slice(0, 2000);
    const btn = modal.querySelector("[data-dm-report-send]");
    btn.disabled = true;
    btn.textContent = "Sending…";
    const report = {
      id: uid(),
      reporter: state.profile.handle,
      reportedKey: `user:${id}`,
      reportedName: name,
      reasons: [reason],
      complaint: details,
      ts: Date.now(),
      status: "pending",
      context: "dm-chat",
    };
    state.reports = [...(state.reports || []).filter((r) => r.reportedKey !== report.reportedKey), report];
    persist();
    let cloudOk = true;
    try {
      const { error } = await reportUser({
        reportedUserId: isUuid(id) ? id : null,
        reasons: [reason],
        details: `Chat report: ${name} (${id})\nComplaint: ${details || "—"}`,
      });
      if (error) cloudOk = false;
    } catch {
      cloudOk = false;
    }
    modal.remove();
    notify(cloudOk ? "Report sent — moderation will review" : "Report saved on this device");
  };
}
// WhatsApp-style contact card: avatar, handle, shared-media counters and
// per-contact actions (mute / block / report). Groups use their own info view.
function openContactCard(id, info) {
  const target = info.target || {};
  const counts = groupMediaCounts(id);
  const msgs = state.messages[id] || [];
  const sharedDays = msgs.length ? Math.max(1, Math.ceil((Date.now() - Math.min(...msgs.map((m) => m.ts || Date.now()))) / 86400000)) : 0;
  const photo = target.photo || cloudFriendPhoto(id) || "";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal contact-card"><div class="contact-hero"><span class="contact-avatar">${avatarMarkup(photo, (info.name.replace(/^@/, "")[0] || "?").toUpperCase())}</span><h2>${esc(info.name)}</h2>${target.username && !info.name.startsWith("@") ? `<small class="muted">@${esc(target.username)}</small>` : ""}${msgs.length ? `<p class="muted contact-sub">${msgs.length} message${msgs.length === 1 ? "" : "s"} shared${sharedDays ? ` over ~${sharedDays} day${sharedDays === 1 ? "" : "s"}` : ""}</p>` : "<p class=\"muted contact-sub\">No messages yet</p>"}</div><div class="book-facts"><span class="tag">${counts.media} media</span><span class="tag">${counts.files} files</span><span class="tag">${counts.links} links</span>${isChatMuted(id) ? `<span class="tag">${esc(muteLabel(id))}</span>` : ""}</div><div class="modal-actions contact-actions"><button type="button" class="ghost" data-cc-mute>${isChatMuted(id) ? "Unmute" : "Mute"}</button><button type="button" class="ghost" data-cc-media>View shared</button><button type="button" class="danger-button" data-cc-block>Block</button><button type="button" class="primary" data-cc-close>Close</button></div></div>`;
  $("#modal-root").append(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.querySelector("[data-cc-close]").onclick = () => modal.remove();
  modal.querySelector("[data-cc-media]").onclick = () => {
    modal.remove();
    openGroupMedia(id);
  };
  modal.querySelector("[data-cc-mute]").onclick = () => {
    modal.remove();
    if (isChatMuted(id)) clearChatMute(id);
    else openDmMuteModal(id, info.name);
  };
  modal.querySelector("[data-cc-block]").onclick = () => {
    modal.remove();
    askBlockUser({
      id: target.id,
      username: target.username || target.handle,
      name: info.name.startsWith("@") ? info.name : "@" + (target.username || target.handle || info.name),
      context: "chat",
    });
  };
}
function openMuteModal(id) {
  const g = groupById(id);
  if (!g) return;
  const cur = muteRecord(id);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Notifications</div><h2>Mute ${esc(g.name)}?</h2><p class="muted">You can still open the group and read everything. Only notifications pause.${isChatMuted(id) ? ` Currently: <strong>${esc(muteLabel(id))}</strong>.` : ""}</p><div class="reason-list">${MUTE_CHOICES.map((c) => `<label><input type="radio" name="mute-choice" value="${c.id}"${cur === "forever" && c.id === "forever" ? " checked" : ""}> ${c.id === "forever" ? "Always (until turned back on)" : c.label}</label>`).join("")}</div><p class="st-confirm-err" data-mute-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-mute-cancel>Cancel</button>${isChatMuted(id) ? `<button type="button" class="ghost" data-mute-off>Unmute</button>` : ""}<button type="button" class="primary" data-mute-save>Save</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-mute-err]");
  modal.querySelector("[data-mute-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  const off = modal.querySelector("[data-mute-off]");
  if (off) off.onclick = () => {
    modal.remove();
    clearChatMute(id);
  };
  modal.querySelector("[data-mute-save]").onclick = () => {
    const choice = modal.querySelector('input[name="mute-choice"]:checked')?.value || "";
    if (!choice) {
      err.textContent = "Pick a duration first.";
      err.hidden = false;
      return;
    }
    if (!setChatMute(id, choice)) {
      err.textContent = "Couldn't save that setting — try again.";
      err.hidden = false;
      return;
    }
    modal.remove();
  };
}
function openGroupInfo(id) {
  const g = groupById(id);
  if (!g) return;
  const counts = groupMediaCounts(id);
  const roster = groupRoster(id);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Group info</div><h2>${esc(g.name)}</h2><p class="muted">${esc(g.description || "A study group.")}</p><div class="book-facts">${(g.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}<span class="tag">${typeof g.members === "number" ? `~${g.members} members` : `${roster.length || "No"} active here`}</span>${isChatMuted(id) ? `<span class="tag">${esc(muteLabel(id))}</span>` : ""}</div><div class="book-facts"><span class="tag">${counts.media} media</span><span class="tag">${counts.files} files</span><span class="tag">${counts.links} links</span></div><div class="modal-actions"><button type="button" class="ghost" data-info-media>View shared</button><button type="button" class="primary" data-info-close>Done</button></div></div>`;
  $("#modal-root").append(modal);
  modal.querySelector("[data-info-close]").onclick = () => modal.remove();
  modal.querySelector("[data-info-media]").onclick = () => {
    modal.remove();
    openGroupMedia(id);
  };
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
}
function openGroupMembers(id) {
  const g = groupById(id);
  if (!g) return;
  const roster = groupRoster(id);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Members</div><h2>${esc(g.name)}</h2><div data-cloud-roster><p class="muted">Loading members…</p></div>${typeof g.members === "number" && !g.ownerId ? `<p class="muted">About ${g.members} learners follow this group. Recently active here:</p>` : `<p class="muted">People who have sent messages here:</p>`}${roster.length ? `<div class="grid">${roster.map((r) => `<div class="task"><div class="avatar">${r.you ? esc((state.profile.handle || "Y")[0].toUpperCase()) : "M"}</div><span class="task-text"><strong>${r.you ? "You" : "Group member"}</strong><br><small class="muted">${r.count} message${r.count === 1 ? "" : "s"}</small></span><span>${r.you ? `<span class="tag">you</span>` : ""}${r.you && g.ownerId === chatKey() ? `<span class="tag">owner</span>` : ""}${!r.you && g.ownerId && r.key === `other:${g.ownerId}` ? `<span class="tag">owner</span>` : ""}</span></div>`).join("")}</div>` : `<p class="muted">No messages here yet — members appear once they write.</p>`}<div class="modal-actions"><button type="button" class="primary" data-members-close>Done</button></div></div>`;
  $("#modal-root").append(modal);
  modal.querySelector("[data-members-close]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  paintCloudRoster(modal, id);
}
// Server membership roster with role badges and owner/admin actions.
// Local message-derived roster above stays as the offline fallback.
async function paintCloudRoster(modal, id) {
  const box = modal.querySelector("[data-cloud-roster]");
  if (!box) return;
  if (!signedIn() || !(isCloudGroup(id) || myGroupRole(id))) {
    box.innerHTML = "";
    return;
  }
  try {
    const { data, error } = await getGroupMembers(id);
    if (error) throw error;
    const members = Array.isArray(data) ? data : [];
    const me = state.user.id;
    const myRole = (members.find((m) => m.user_id === me) || {}).role || myGroupRole(id);
    const canAdmin = myRole === "owner" || myRole === "admin";
    if (!members.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = `<div class="section-row" style="margin-top:4px"><h3>Members (${members.length})</h3>${myRole ? `<span class="tag">you: ${esc(myRole)}</span>` : ""}</div><div class="grid">${members.map((m) => {
      const you = m.user_id === me;
      const actions = !you && canAdmin && m.role !== "owner"
        ? `<span class="friend-actions">${myRole === "owner" && m.role === "member" ? `<button type="button" class="ghost" data-m-promote="${m.user_id}">Make admin</button>` : ""}${myRole === "owner" && m.role === "admin" ? `<button type="button" class="ghost" data-m-demote="${m.user_id}">Demote</button>` : ""}<button type="button" class="ghost" data-m-remove="${m.user_id}">Remove</button>${myRole === "owner" ? `<button type="button" class="ghost" data-m-transfer="${m.user_id}" title="Give them ownership">Transfer</button>` : ""}</span>`
        : "";
      return `<div class="task"><div class="avatar">${esc(((m.handle || m.name || "?")[0] || "?").toUpperCase())}</div><span class="task-text"><strong>${you ? "You" : "@" + esc(m.handle || "member")}</strong><br><small class="muted">${esc(m.name || "")}</small></span><span class="tag">${esc(m.role)}</span>${actions}</div>`;
    }).join("")}</div>${canAdmin ? `<div class="input-row" style="margin-top:10px"><input class="input" data-m-invite placeholder="Username to invite" aria-label="Username to invite"><button type="button" class="primary" data-m-invite-btn>Invite</button></div><p class="muted" style="margin:6px 0 0">Invites work for private groups too — only owners and admins can add people.</p>` : ""}`;
    const refresh = async () => {
      await refreshCloudGroups(true).catch(() => {});
      paintCloudRoster(modal, id);
      if (state.tab === "community") renderCommunity();
    };
    box.querySelectorAll("[data-m-promote]").forEach((b) => (b.onclick = async () => {
      const { error } = await groupSetMember(id, b.dataset.mPromote, "promote");
      notify(error ? "Couldn't promote — " + String(error.message).slice(0, 100) : "Promoted to admin");
      if (!error) refresh();
    }));
    box.querySelectorAll("[data-m-demote]").forEach((b) => (b.onclick = async () => {
      const { error } = await groupSetMember(id, b.dataset.mDemote, "demote");
      notify(error ? "Couldn't demote — " + String(error.message).slice(0, 100) : "Demoted to member");
      if (!error) refresh();
    }));
    box.querySelectorAll("[data-m-remove]").forEach((b) => (b.onclick = () => {
      confirmBox("Remove this member?", "They lose access to the group and its chat.", async () => {
        const { error } = await groupSetMember(id, b.dataset.mRemove, "remove");
        notify(error ? "Couldn't remove — " + String(error.message).slice(0, 100) : "Member removed");
        if (!error) refresh();
      });
    }));
    box.querySelectorAll("[data-m-transfer]").forEach((b) => (b.onclick = () => {
      confirmBox("Transfer ownership?", "They become the group owner and you become an admin. This can't be undone by you.", async () => {
        const { error } = await groupTransfer(id, b.dataset.mTransfer);
        notify(error ? "Couldn't transfer — " + String(error.message).slice(0, 100) : "Ownership transferred");
        if (!error) refresh();
      });
    }));
    const inviteBtn = box.querySelector("[data-m-invite-btn]");
    if (inviteBtn) inviteBtn.onclick = async () => {
      const q = box.querySelector("[data-m-invite]").value.trim().replace(/^@/, "");
      if (q.length < 2) return notify("Type a username to invite");
      inviteBtn.disabled = true;
      try {
        const found = await inviteMemberByHandle(id, q);
        notify(found);
        if (!found.startsWith("Couldn't") && !found.startsWith("No user")) refresh();
      } finally {
        inviteBtn.disabled = false;
      }
    };
  } catch {
    box.innerHTML = "";
  }
}
// Resolve a username through the locked-down directory and add them.
async function inviteMemberByHandle(groupId, handle) {
  const { data: results, error: sErr } = await searchUsers(handle, 5);
  if (sErr) return "Couldn't search right now — " + String(sErr.message).slice(0, 80);
  const match = (results || []).find((u) => String(u.handle || "").toLowerCase() === handle.toLowerCase()) || (results || [])[0];
  if (!match) return "No user found with that name";
  const { error } = await groupAddMember(groupId, match.id, "member");
  if (error) return "Couldn't invite — " + String(error.message).slice(0, 100);
  return `Invited @${match.handle}`;
}
function openGroupSettings(id) {
  const role = myGroupRole(id);
  const cloudG = groupById(id);
  const isCloud = isCloudGroup(id) || (cloudG && cloudG.source === "cloud");
  if (isCloud && signedIn() && (role === "owner" || role === "admin")) {
    return openCloudGroupSettings(id, cloudG, role);
  }
  const g = (state.customGroups || []).find((x) => x.id === id);
  if (!g || !isGroupOwner(id)) return notify("Only the group owner can change settings");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Group settings</div><h2>${esc(g.name)}</h2><label class="field-label">Name<input class="input" data-gs-name value="${esc(g.name)}" maxlength="80"></label><label class="field-label">Description<textarea class="textarea autogrow" data-gs-desc rows="2" maxlength="500">${esc(g.description || "")}</textarea></label><label class="field-label">Topics (comma separated)<input class="input" data-gs-tags value="${esc((g.tags || []).join(", "))}" maxlength="200"></label><label class="field-label">Icon<select class="select" data-gs-logo>${GROUP_LOGOS.map((n) => `<option value="${n}"${g.logoName === n ? " selected" : ""}>${n[0].toUpperCase() + n.slice(1)}</option>`).join("")}</select></label><p class="st-confirm-err" data-gs-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-gs-cancel>Cancel</button><button type="button" class="primary" data-gs-save>Save</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-gs-err]");
  modal.querySelector("[data-gs-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.querySelector("[data-gs-save]").onclick = () => {
    const name = modal.querySelector("[data-gs-name]").value.trim();
    if (!name) {
      err.textContent = "The group needs a name.";
      err.hidden = false;
      return;
    }
    g.name = name.slice(0, 80);
    g.description = modal.querySelector("[data-gs-desc]").value.trim().slice(0, 500);
    g.tags = modal.querySelector("[data-gs-tags]").value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
    const logo = modal.querySelector("[data-gs-logo]").value;
    g.logoName = logo;
    g.emoji = sicon(logo);
    persist();
    save("sf-groups", state.customGroups);
    modal.remove();
    renderCommunity();
    notify("Group settings saved");
  };
}
// Server-backed settings for cloud groups (owner/admin; visibility is
// owner-only and enforced again by the database).
function openCloudGroupSettings(id, g, role) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Group settings · ${esc(role)}</div><h2>${esc(g.name)}</h2><div class="group-avatar-row"><span data-av-settings>${groupAvatarMarkup(g)}</span><div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ghost" data-av-change>Change photo</button>${g.avatarPath ? `<button type="button" class="ghost" data-av-remove>Remove</button>` : ""}</div><p class="muted" style="margin:6px 0 0">JPEG, PNG, WebP or GIF · under 2 MB · visible to members.</p><input type="file" data-av-file accept="image/jpeg,image/png,image/webp,image/gif" hidden aria-label="Choose a group photo"></div></div><label class="field-label">Name<input class="input" data-gs-name value="${esc(g.name)}" maxlength="120"></label><label class="field-label">Description<textarea class="textarea autogrow" data-gs-desc rows="2" maxlength="500">${esc(g.description || "")}</textarea></label><label class="field-label">Topics (comma separated)<input class="input" data-gs-tags value="${esc((g.tags || []).join(", "))}" maxlength="200"></label><label class="field-label">Icon<select class="select" data-gs-logo>${GROUP_LOGOS.map((n) => `<option value="${n}"${g.logoName === n ? " selected" : ""}>${n[0].toUpperCase() + n.slice(1)}</option>`).join("")}</select></label>${role === "owner" ? `<label class="field-label">Visibility<select class="select" data-gs-vis><option value="private"${g.visibility !== "public" ? " selected" : ""}>Private — invite only</option><option value="public"${g.visibility === "public" ? " selected" : ""}>Public — listed in Discover</option></select></label>` : ""}<p class="st-confirm-err" data-gs-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-gs-cancel>Cancel</button><button type="button" class="primary" data-gs-save>Save</button></div></div>`;
  $("#modal-root").append(modal);
  paintGroupAvatars(modal);
  const err = modal.querySelector("[data-gs-err]");
  modal.querySelector("[data-gs-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  const avFile = modal.querySelector("[data-av-file]");
  modal.querySelector("[data-av-change]").onclick = () => avFile?.click();
  avFile?.addEventListener("change", async () => {
    const file = avFile.files?.[0];
    avFile.value = "";
    if (!file) return;
    err.hidden = true;
    // Instant local verdict (same shared validator the server path uses),
    // so a valid PNG never spins into "Uploading…" just to be rejected.
    const bad = await validateImageFile(file, 2 * 1024 * 1024, "group-avatar");
    if (bad) {
      err.textContent = bad;
      err.hidden = false;
      return;
    }
    const btn = modal.querySelector("[data-av-change]");
    btn.disabled = true;
    btn.textContent = "Uploading…";
    try {
      const { data, error: upErr } = await uploadGroupAvatar(id, file);
      if (upErr) throw upErr;
      const { error: dbErr } = await groupUpdate(id, { avatarPath: data.path });
      if (dbErr) {
        await removeGroupAvatar(data.path).catch(() => {});
        throw dbErr;
      }
      const prev = groupById(id)?.avatarPath;
      if (prev && prev !== data.path) await removeGroupAvatar(prev).catch(() => {});
      const entry = cloudGroups.find((x) => x.id === id);
      if (entry) {
        entry.avatarPath = data.path;
        cloudGroupsAt = Date.now();
      }
      const wrap = modal.querySelector("[data-av-settings]");
      if (wrap) {
        wrap.innerHTML = groupAvatarMarkup({ ...g, avatarPath: data.path });
        paintGroupAvatars(wrap);
      }
      paintGroupAvatars(document);
      notify("Group photo updated");
    } catch (e2) {
      err.textContent = friendlyUploadError(e2);
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Change photo";
    }
  });
  modal.querySelector("[data-av-remove]")?.addEventListener("click", async () => {
    err.hidden = true;
    try {
      // Empty string clears avatar_path server-side (the RPC coalesces NULL
      // as "no change", so "" is the explicit clear signal).
      const { error: dbErr } = await groupUpdate(id, { avatarPath: "" });
      if (dbErr) throw dbErr;
      const prev = groupById(id)?.avatarPath;
      if (prev) await removeGroupAvatar(prev).catch(() => {});
      const entry = cloudGroups.find((x) => x.id === id);
      if (entry) {
        entry.avatarPath = null;
        cloudGroupsAt = Date.now();
      }
      const wrap = modal.querySelector("[data-av-settings]");
      if (wrap) wrap.innerHTML = groupAvatarMarkup({ ...g, avatarPath: null });
      paintGroupAvatars(document);
      notify("Group photo removed");
    } catch (e2) {
      err.textContent = friendlyUploadError(e2);
      err.hidden = false;
    }
  });
  modal.querySelector("[data-gs-save]").onclick = async () => {
    const name = modal.querySelector("[data-gs-name]").value.trim();
    if (!name) {
      err.textContent = "The group needs a name.";
      err.hidden = false;
      return;
    }
    const btn = modal.querySelector("[data-gs-save]");
    btn.disabled = true;
    btn.textContent = "Saving…";
    const patch = {
      name: name.slice(0, 120),
      description: modal.querySelector("[data-gs-desc]").value.trim().slice(0, 500),
      topics: modal.querySelector("[data-gs-tags]").value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8),
      logo: modal.querySelector("[data-gs-logo]").value,
    };
    const visSel = modal.querySelector("[data-gs-vis]");
    if (visSel && role === "owner") patch.visibility = visSel.value === "public" ? "public" : "private";
    const { error } = await groupUpdate(id, patch);
    btn.disabled = false;
    btn.textContent = "Save";
    if (error) {
      err.textContent = "Couldn't save — " + String(error.message).slice(0, 120);
      err.hidden = false;
      return;
    }
    modal.remove();
    await refreshCloudGroups(true).catch(() => {});
    renderCommunity();
    notify("Group settings saved");
  };
}
function openGroupReport(id) {
  const g = groupById(id);
  if (!g || isGroupOwner(id)) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Report · ${esc(g.name)}</div><h2>What's wrong with this group?</h2><p class="muted">Pick the closest reason. Reports go to moderation — never public.</p><div class="reason-list">${BLOCK_REASONS.map((r) => `<label><input type="radio" name="group-report-reason" value="${esc(r)}"> ${esc(r)}</label>`).join("")}</div><label class="field-label">Details (optional)<textarea class="textarea autogrow" data-group-report-details rows="2" maxlength="2000" placeholder="What happened in this group?"></textarea></label><p class="st-confirm-err" data-group-report-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-group-report-cancel>Cancel</button><button type="button" class="primary" data-group-report-send>Send report</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-group-report-err]");
  modal.querySelector("[data-group-report-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.querySelector("[data-group-report-send]").onclick = async () => {
    const reason = modal.querySelector('input[name="group-report-reason"]:checked')?.value || "";
    if (!reason) {
      err.textContent = "Choose a reason first.";
      err.hidden = false;
      return;
    }
    const details = modal.querySelector("[data-group-report-details]").value.trim().slice(0, 2000);
    const btn = modal.querySelector("[data-group-report-send]");
    btn.disabled = true;
    btn.textContent = "Sending…";
    const report = {
      id: uid(),
      reporter: state.profile.handle,
      reportedKey: `group:${id}`,
      reportedName: g.name,
      reasons: [reason],
      complaint: details,
      ts: Date.now(),
      status: "pending",
      context: "group-chat",
    };
    state.reports = [...(state.reports || []).filter((r) => r.reportedKey !== report.reportedKey), report];
    persist();
    let cloudOk = true;
    try {
      const { error } = await reportUser({
        reportedUserId: null,
        reasons: [reason],
        details: `Group report: ${g.name} (${id})\nComplaint: ${details || "—"}`,
      });
      if (error) cloudOk = false;
    } catch {
      cloudOk = false;
    }
    modal.remove();
    notify(cloudOk ? "Group reported — moderation will review" : "Report saved on this device");
  };
}
function askClearGroupHistory(id) {
  if (!isGroupChat(id)) return;
  const g = groupById(id);
  confirmBox(`Clear ${g?.name || "group"} history?`, "Messages on this device will be removed. New messages still arrive.", () => {
    const msgs = { ...(state.messages || {}) };
    delete msgs[id];
    state.messages = msgs;
    const pins = { ...(state.pins || {}) };
    delete pins[id];
    state.pins = pins;
    if (groupNav?.id === id) groupNav = null;
    if (groupSearch?.id === id) groupSearch = null;
    persist();
    rerenderChat();
    notify("Local chat history cleared");
  });
}
function leaveGroupById(id, cloudResult) {
  save("sf-joined", get("sf-joined", []).filter((x) => x !== id));
  cloudGroups = cloudGroups.filter((g) => g.id !== id);
  if (state.activeChat === id) state.activeChat = null;
  if (groupNav?.id === id) groupNav = null;
  if (groupSearch?.id === id) groupSearch = null;
  persist();
  renderCommunity();
}
function askLeaveGroup(id) {
  const g = groupById(id);
  if (!g) return;
  const role = myGroupRole(id);
  const ownerNote = role === "owner"
    ? " You own this group — ownership passes to the longest-standing admin or member, or the group is removed if you're the only one left."
    : "";
  confirmBox(`Leave ${g.name}?`, `You stop receiving its messages. Your sent messages stay visible to others.${ownerNote}`, async () => {
    if (signedIn() && (isCloudGroup(id) || role)) {
      try {
        const { data, error } = await groupLeave(id);
        if (error) throw error;
        leaveGroupById(id);
        if (data?.deleted_group) notify(`Left ${g.name} — the group was removed (you were the only member)`);
        else if (data?.transferred_to) notify(`Left ${g.name} — ownership transferred`);
        else notify(`Left ${g.name}`);
        refreshCloudGroups(true).then(() => {
          if (state.tab === "community") renderCommunity();
        }).catch(() => {});
        return;
      } catch (err) {
        if (!isPhase7Missing(err) && navigator.onLine) {
          notify("Couldn't leave on the server — " + String(err?.message || err).slice(0, 100));
          return;
        }
      }
    }
    leaveGroupById(id);
    notify(`Left ${g.name}`);
  });
}
function askDisbandGroup(id) {
  const g = (state.customGroups || []).find((x) => x.id === id) || groupById(id);
  const role = myGroupRole(id);
  const cloudOwned = isCloudGroup(id) && (role === "owner" || (g?.ownerId && state.user && g.ownerId === state.user.id));
  if (!g || (!isGroupOwner(id) && !cloudOwned)) return notify("Only the group owner can delete it");
  confirmBox(`Delete ${g.name}?`, "The group disappears for everyone, along with its messages.", async () => {
    if (signedIn() && isCloudGroup(id)) {
      try {
        const { error } = await groupDelete(id);
        if (error) throw error;
      } catch (err) {
        if (!isPhase7Missing(err) && navigator.onLine) {
          notify("Couldn't delete on the server — " + String(err?.message || err).slice(0, 100));
          return;
        }
      }
    }
    state.customGroups = (state.customGroups || []).filter((x) => x.id !== id);
    save("sf-groups", state.customGroups);
    save("sf-joined", get("sf-joined", []).filter((x) => x !== id));
    cloudGroups = cloudGroups.filter((x) => x.id !== id);
    const msgs = { ...(state.messages || {}) };
    delete msgs[id];
    state.messages = msgs;
    if (state.activeChat === id) state.activeChat = null;
    if (groupNav?.id === id) groupNav = null;
    if (groupSearch?.id === id) groupSearch = null;
    persist();
    renderCommunity();
    notify(`Deleted ${g.name}`);
    if (backendConfigured && state.user) {
      deleteCloudGroup(id).then(({ error } = {}) => {
        if (error) notify("Removed locally; cloud delete failed");
        refreshCloudGroups(true).catch(() => {});
      }).catch(() => {});
    }
  });
}

function bindGroupMenuActions(root) {
  $$("[data-gact]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll("[data-chat-pop]").forEach((el) => (el.hidden = true));
        groupAction(b.dataset.gact, b.dataset.gid, root);
      }),
  );
  $$("[data-gnav]", root).forEach(
    (b) =>
      (b.onclick = () => {
        const nav = groupNav;
        if (!nav || !nav.matches.length) return;
        if (b.dataset.gnav === "close") {
          groupNav = null;
          rerenderChat();
          return;
        }
        nav.pos = (nav.pos + (b.dataset.gnav === "next" ? 1 : -1) + nav.matches.length) % nav.matches.length;
        rerenderChat();
        flashBubble(nav.matches[nav.pos]);
      }),
  );
}
function groupAction(act, id, root) {
  // DM chats (friends + self) route through the same data-gact buttons.
  if (id && !isGroupChat(id)) return dmAction(act, id, root);
  if (!id) return;
  if (act === "search") openGroupSearch(id);
  else if (act === "mute") openMuteModal(id);
  else if (act === "unmute") clearChatMute(id);
  else if (act === "media") openGroupMedia(id);
  else if (act === "members") openGroupMembers(id);
  else if (act === "info") openGroupInfo(id);
  else if (act === "settings") {
    const role = myGroupRole(id);
    if (!isGroupOwner(id) && role !== "owner" && role !== "admin")
      return notify("Only the group owner can change settings");
    openGroupSettings(id);
  } else if (act === "clear") askClearGroupHistory(id);
  else if (act === "report") {
    if (isGroupOwner(id)) return notify("You own this group — use settings instead");
    openGroupReport(id);
  } else if (act === "leave") askLeaveGroup(id);
  else if (act === "disband") {
    if (!isGroupOwner(id)) return notify("Only the group owner can delete it");
    askDisbandGroup(id);
  }
}
if (!window.__sfGroupKeysBound) {
  window.__sfGroupKeysBound = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (editingMessage) {
      cancelMessageEdit();
      return;
    }
    const pop = document.querySelector('[data-chat-pop]:not([hidden])');
    if (pop) {
      pop.hidden = true;
      return;
    }
    const extras = document.querySelector('[data-chat-extras-pop]:not([hidden])');
    if (extras) {
      extras.hidden = true;
      extras
        .closest(".chat-extras-wrap")
        ?.querySelector("[data-chat-extras]")
        ?.setAttribute("aria-expanded", "false");
      return;
    }
    if (mediaViewer) {
      closeMediaViewer();
      return;
    }
    if (groupSearch) {
      groupSearch = null;
      rerenderChat();
    }
  });
}
function flashBubble(idx) {
  const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
  raf(() => {
    const bubbles = document.querySelectorAll(".chat-body .bubble");
    const el = bubbles[idx];
    if (!el) return;
    try {
      if (el.scrollIntoView) el.scrollIntoView({ block: "center" });
    } catch { /* ignore */ }
    el.classList.add("msg-flash");
    setTimeout(() => el.classList.remove("msg-flash"), 2600);
  });
}
// Scroll the chat to a pinned message by id and flash it.
function jumpToPinnedMessage(id, msgId) {
  const msgs = state.messages[id] || [];
  const idx = msgs.findIndex((m) => m.id === msgId);
  if (idx < 0) {
    notify("That pinned message is no longer in this chat");
    return;
  }
  const el = document.querySelector(`.chat-body .bubble[data-midx="${idx}"]`);
  if (!el) return;
  try {
    el.scrollIntoView({ block: "center", behavior: state.reduceMotion ? "auto" : "smooth" });
  } catch {
    /* ignore */
  }
  el.classList.add("msg-flash");
  setTimeout(() => el.classList.remove("msg-flash"), 2600);
}

// Modal listing every pinned message in the chat, newest first.
function openPinnedList(id) {
  $("#pins-modal")?.remove();
  const msgs = state.messages[id] || [];
  const pinned = pinnedIdsFor(id)
    .map((pid) => msgs.find((m) => m.id === pid))
    .filter(Boolean);
  const target = allGroups().find((g) => g.id === id) || state.friends.find((f) => f.id === id);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "pins-modal";
  modal.innerHTML = `<div class="modal pins-modal"><div class="eyebrow">${esc(target?.name || "Chat")}</div><h2>${sicon("pin")} Pinned messages</h2>${pinned.length ? `<div class="pins-list">${pinned
    .map(
      (pm) =>
        `<div class="pin-entry"><button type="button" class="pin-entry-main" data-pin-jump-modal="${pm.id}"><b>${esc(senderLabel(pm))}</b><span>${escSnippet(messageText(pm), 110)}</span><small>${new Date(pm.ts).toLocaleDateString([], { month: "short", day: "numeric" })} · ${new Date(pm.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></button><button type="button" class="ghost" data-pin-remove="${pm.id}" title="Unpin">${sicon("trash")}</button></div>`,
    )
    .join("")}</div>` : '<p class="muted">Nothing pinned yet. Hover a message and press the pin icon.</p>'}<div class="modal-actions"><button type="button" class="primary" data-pins-close>Done</button></div></div>`;
  $("#modal-root").append(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  $("[data-pins-close]", modal).onclick = () => modal.remove();
  $$('[data-pin-jump-modal]', modal).forEach(
    (b) =>
      (b.onclick = () => {
        modal.remove();
        jumpToPinnedMessage(id, b.dataset.pinJumpModal);
      }),
  );
  $$('[data-pin-remove]', modal).forEach(
    (b) =>
      (b.onclick = () => {
        togglePinMessage(id, b.dataset.pinRemove);
        modal.remove();
        openPinnedList(id);
        rerenderChat();
      }),
  );
}

function jumpToGroupMessage(id, idx) {
  const matches = groupNav && groupNav.id === id ? [...groupNav.matches] : [];
  let pos = matches.indexOf(idx);
  if (pos < 0) {
    matches.push(idx);
    pos = matches.length - 1;
  }
  groupNav = { id, matches, pos };
  groupSearch = null;
  rerenderChat();
  flashBubble(idx);
}
function snippetHtml(text, needle) {
  const t = String(text || "");
  const n = String(needle || "").toLowerCase();
  const i = t.toLowerCase().indexOf(n);
  if (!n || i < 0) return esc(t.slice(0, 90));
  const s = Math.max(0, i - 40);
  const e = Math.min(t.length, i + n.length + 40);
  return `${s > 0 ? "…" : ""}${esc(t.slice(s, i))}<mark>${esc(t.slice(i, i + n.length))}</mark>${esc(t.slice(i + n.length, e))}${e < t.length ? "…" : ""}`;
}
function searchGroupMessages(id, q) {
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return [];
  const out = [];
  for (const [idx, m] of (state.messages[id] || []).entries()) {
    const text = messageText(m);
    const hay = `${text} ${m.file || ""} ${senderLabel(m)} ${extractLinks(text).join(" ")}`.toLowerCase();
    if (!hay.includes(needle)) continue;
    const tags = [];
    if (m.kind === "file") tags.push(m.mime && m.mime.startsWith("image/") ? "photo" : m.mime && m.mime.startsWith("video/") ? "video" : "file");
    else if (m.kind === "voice") tags.push("voice");
    else if (m.kind === "poll") tags.push("poll");
    if (extractLinks(text).length) tags.push("link");
    out.push({
      idx,
      sender: senderLabel(m),
      ts: m.ts || Date.now(),
      snippet: snippetHtml(m.file && !text ? m.file : text, needle),
      tags,
    });
    if (out.length >= 100) break;
  }
  return out;
}
function openGroupSearch(id) {
  if (!isGroupChat(id) && !isSelfChat(id) && targetKind(id) === null) return;
  groupSearch = { id, q: "" };
  groupNav = null;
  state.activeChat = id;
  rerenderChat();
}
// Cheap kind check without building the full target (used by search gates).
function targetKind(id) {
  if (isSelfChat(id)) return "self";
  if (allGroups().some((g) => g.id === id)) return "group";
  if ((state.friends || []).some((f) => f.id === id)) return "friend";
  if (cloudFriends.some((f) => f.id === id)) return "connection";
  return null;
}
function groupSearchMarkup(id) {
  const info = chatDisplayInfo(id);
  const q = groupSearch?.q || "";
  const results = searchGroupMessages(id, q);
  return `<div class="chat-head wa-head"><button type="button" class="icon-btn" data-gs-back aria-label="Back to chat">‹</button><div style="flex:1;min-width:0"><strong>${esc(info.name || "Chat")}</strong><div class="muted" style="font-size:11px">Search messages</div></div><span class="tag">${results.length}</span></div><div class="input-row" style="margin:12px 14px 0"><span class="song-search-ico" style="position:static;transform:none" aria-hidden="true">${sicon("search")}</span><input class="input" id="gs-input" style="flex:1" placeholder="Search messages, files, links…" value="${esc(q)}" aria-label="Search messages" autocomplete="off"></div>${signedIn() && !isSelfChat(id) && q.trim().length >= 2 && (groupSearch?.depth || 0) < 4 && targetKind(id) !== "friend" ? `<div style="margin:8px 14px 0" data-gs-more-wrap><button type="button" class="ghost" data-gs-more ${groupSearch?.deepening ? "disabled" : ""}>${groupSearch?.deepening ? "Searching older messages…" : "Search older messages"}</button></div>` : `<div data-gs-more-wrap></div>`}<div class="chat-body" id="gs-results">${groupSearchResultsHtml(id, results)}</div>`;
}
function groupSearchResultsHtml(id, results) {
  if (!results.length) {
    const q = groupSearch?.q || "";
    return `<p class="muted" style="padding:16px">${q ? "No messages match that search." : "Type above to search this group's stored messages."}</p>`;
  }
  return results.map((r) => `<button type="button" class="gs-row" data-gs-jump="${r.idx}"><span class="gs-who">${esc(r.sender)} · ${new Date(r.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}${r.tags.length ? ` · ${r.tags.join(" · ")}` : ""}</span><span class="gs-snippet">${r.snippet}</span></button>`).join("");
}
function paintGroupSearchResults(id) {
  const box = $("#gs-results");
  if (!box) return;
  const q = groupSearch?.q || "";
  box.innerHTML = groupSearchResultsHtml(id, searchGroupMessages(id, q));
  $$("[data-gs-jump]", box).forEach(
    (b) => (b.onclick = () => jumpToGroupMessage(id, Number(b.dataset.gsJump))),
  );
  const tag = document.querySelector(".chat-head .tag");
  if (tag) tag.textContent = String(searchGroupMessages(id, q).length);
  // The deepen button lives outside #gs-results (so typing never loses it);
  // repaint + rebind it here so loading state and page budget stay current.
  const wrap = document.querySelector("[data-gs-more-wrap]");
  if (wrap) {
    const show = signedIn() && q.trim().length >= 2 && (groupSearch?.depth || 0) < 4;
    wrap.innerHTML = show
      ? `<button type="button" class="ghost" data-gs-more ${groupSearch?.deepening ? "disabled" : ""}>${groupSearch?.deepening ? "Searching older messages…" : "Search older messages"}</button>`
      : "";
    const btn = wrap.querySelector("[data-gs-more]");
    if (btn) btn.onclick = () => deepenGroupSearch(id);
  }
}
function bindGroupSearch(body, id) {
  $("[data-gs-back]", body).onclick = () => {
    groupSearch = null;
    renderMessages(body);
  };
  const inp = $("#gs-input", body);
  if (inp) {
    inp.focus();
    try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* ignore */ }
    inp.oninput = () => {
      groupSearch = { id, q: inp.value };
      paintGroupSearchResults(id);
    };
    inp.onkeydown = (e) => {
      if (e.key === "Enter") {
        const first = $("[data-gs-jump]", body);
        if (first) jumpToGroupMessage(id, Number(first.dataset.gsJump));
      }
    };
  }
  paintGroupSearchResults(id);
}

function openPollBuilder(id, root) {
  const MAX_OPTIONS = 10;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal poll-modal"><div class="poll-modal-head"><div><div class="eyebrow">New poll</div><h2>Ask the group</h2></div><button type="button" class="icon-btn poll-modal-close" data-poll-cancel title="Close" aria-label="Close poll builder">${sicon("x")}</button></div><label class="field-label">Question<input class="input" id="poll-q" placeholder="e.g. Sprint at 6pm?" maxlength="140"></label><div class="poll-opts-head"><span class="field-label-inline">Options</span><span class="poll-count muted" data-poll-count></span></div><div class="poll-opts" data-poll-opts></div><button type="button" class="ghost poll-add" data-poll-add>${sicon("plus")} <span>Add option</span></button><div class="modal-actions"><button type="button" class="ghost" data-poll-cancel2>Cancel</button><button type="button" class="primary" data-poll-create>Create poll</button></div></div>`;
  $("#modal-root").append(modal);
  const list = $("[data-poll-opts]", modal);
  const countEl = $("[data-poll-count]", modal);
  const addBtn = $("[data-poll-add]", modal);
  const optionRow = (n) => `<div class="poll-opt-row" data-poll-row><span class="poll-opt-num">${n}</span><input class="input" data-poll-opt placeholder="Option ${n}" maxlength="80"><button type="button" class="icon-btn poll-opt-del" data-poll-row-del title="Remove option" aria-label="Remove option ${n}">${sicon("x")}</button></div>`;
  const rows = () => [...list.querySelectorAll("[data-poll-row]")];
  const sync = () => {
    const n = rows().length;
    rows().forEach((row, i) => {
      const num = row.querySelector(".poll-opt-num");
      if (num) num.textContent = String(i + 1);
      const del = row.querySelector("[data-poll-row-del]");
      if (del) {
        del.disabled = n <= 2;
        del.title = n <= 2 ? "A poll needs at least two options" : "Remove option";
      }
    });
    if (countEl) countEl.textContent = `${n} of ${MAX_OPTIONS}`;
    addBtn.disabled = n >= MAX_OPTIONS;
    addBtn.style.display = n >= MAX_OPTIONS ? "none" : "";
  };
  const addRow = (focus = true) => {
    if (rows().length >= MAX_OPTIONS) return;
    list.insertAdjacentHTML("beforeend", optionRow(rows().length + 1));
    sync();
    if (focus) list.querySelector("[data-poll-row]:last-child [data-poll-opt]")?.focus();
  };
  list.addEventListener("click", (e) => {
    const del = e.target.closest?.("[data-poll-row-del]");
    if (!del || del.disabled) return;
    del.closest("[data-poll-row]").remove();
    sync();
  });
  addBtn.onclick = () => addRow();
  addRow();
  addRow();
  sync();
  $("#poll-q", modal).focus();
  const close = () => modal.remove();
  $("[data-poll-cancel]", modal).onclick = close;
  $("[data-poll-cancel2]", modal).onclick = close;
  $("[data-poll-create]", modal).onclick = () => {
    if (isBlockedKey(id)) {
      modal.remove();
      renderCommunity();
      return notify("You have blocked this conversation");
    }
    const question = $("#poll-q", modal).value.trim();
    const options = rows()
      .map((row) => row.querySelector("[data-poll-opt]").value.trim())
      .filter(Boolean)
      .map((text) => ({ text }));
    if (!question) return notify("Give your poll a question");
    if (options.length < 2) return notify("Add at least two options");
    state.messages[id] = [
      ...(state.messages[id] || []),
      {
        id: uid(),
        me: true,
        kind: "poll",
        question,
        options,
        voters: {},
        ts: Date.now(),
      },
    ];
    persist();
    modal.remove();
    renderMessages(root);
  };
}

function startRecording(id, root) {
  if (!window.MediaRecorder)
    return notify("Voice messages need a microphone-capable browser");
  if (!navigator.mediaDevices?.getUserMedia)
    return notify("Microphone unavailable in this browser");
  if (voiceRec) return;
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (voiceRec?.timer) clearInterval(voiceRec.timer);
        const action = voiceRec?.action || "cancel";
        const startedAt = voiceRec?.startedAt || Date.now();
        // Speech time only — paused stretches never count toward length.
        const speechMs = Math.max(1000, (voiceRec?.tickerAt || Date.now()) - startedAt);
        voiceRec = null;
        renderMessages(root);
        if (action === "send") {
          const blob = new Blob(chunks, {
            type: rec.mimeType || "audio/webm",
          });
          if (blob.size) saveVoice(id, blob, startedAt, root, speechMs);
        }
      };
      // Timeslice: data arrives every second, so the size hint stays live.
      rec.start(1000);
      voiceRec = {
        rec,
        chunks,
        startedAt: Date.now(),
        tickerAt: Date.now(),
        paused: false,
        timer: setInterval(() => {
          if (!voiceRec) return;
          // Speech clock: tickerAt freezes while paused, so elapsed speech
          // time is simply tickerAt - startedAt across any number of pauses.
          if (!voiceRec.paused) voiceRec.tickerAt = Date.now();
          const s = Math.max(0, Math.floor((voiceRec.tickerAt - voiceRec.startedAt) / 1000));
          const label = $("[data-rec-time]");
          // Live clock, minutes:seconds — recordings can run as long as the
          // user wants; the only hard limit is the 5 MB message size,
          // surfaced in the hint so it is never a surprise.
          if (label) label.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
          const hint = $(".rec-hint");
          if (hint) {
            if (voiceRec.paused) hint.textContent = "Paused — tap play to keep recording";
            else {
              const size = chunks.reduce((a, c) => a + (c.size || 0), 0) / (1024 * 1024);
              hint.textContent = size >= 4
                ? `Storage almost full (${size.toFixed(1)} / 5 MB) — send soon`
                : "Recording… tap Send when done";
            }
          }
        }, 250),
      };
      renderMessages(root);
    })
    .catch(() => notify("Microphone blocked — allow it to send voice notes"));
}

function stopRecording(action) {
  if (!voiceRec) return;
  voiceRec.action = action;
  try {
    voiceRec.rec.stop();
  } catch {
    // A recorder that already stopped never fires onstop, so clean up
    // here or the mic indicator and rec-bar would stay on screen.
    try {
      voiceRec.rec.stream?.getTracks?.().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    if (voiceRec.timer) clearInterval(voiceRec.timer);
    voiceRec = null;
    renderCommunity();
  }
}

function saveVoice(id, blob, startedAt, root, speechMs = 0) {
  if (isBlockedKey(id)) {
    renderCommunity();
    return notify("You have blocked this conversation");
  }
  if (blob.size > 5 * 1024 * 1024) return notify("Voice note too large");
  // Prefer the recorder's speech clock; fall back to wall-clock elapsed.
  const dur = speechMs
    ? Math.max(1, Math.round(speechMs / 1000))
    : Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const reader = new FileReader();
  reader.onload = () => {
    state.messages[id] = [
      ...(state.messages[id] || []),
      {
        id: uid(),
        me: true,
        kind: "voice",
        audio: reader.result,
        dur,
        ts: Date.now(),
      },
    ];
    persist();
    renderMessages(root);
  };
  reader.readAsDataURL(blob);
}

export function disconnectRealtime() {
  try {
    conversationSubscription?.unsubscribe();
  } catch {
    /* ignore */
  }
  chatSubTarget = null;
  try {
    if (presenceSub) presenceSub.untrack();
  } catch {
    /* ignore */
  }
}
function subscribePresenceFor(id) {
  if (presenceSub) {
    try {
      presenceSub.untrack();
    } catch {
      /* ignore */
    }
    presenceSub = null;
  }
  presenceInfo = { chatId: id, users: [] };
  if (!backendConfigured || !state.user) return;
  if (!allGroups().some((g) => g.id === id)) return;
  presenceSub = subscribeToPresence(
    `studyflow-presence:${id}`,
    { user_id: state.user.id, handle: state.profile.handle },
    (users) => {
      const others = (users || []).filter(
        (u) => u.user_id !== state.user.id,
      );
      // Presence syncs fire on every track — including our own resubscribe
      // (with a fresh timestamp, so the payload ALWAYS differs). Rebuilding
      // Community on each one creates a self-sustaining render storm that
      // kills open menus, drafts, and scroll. Re-render only when the actual
      // member set changes, and only for the actively viewed chat.
      const sig = others.map((u) => u.user_id).sort().join(",");
      const prev = ((id === presenceInfo.chatId && presenceInfo.users) || []).map((u) => u.user_id).sort().join(",");
      presenceInfo = { chatId: id, users: others };
      if (sig !== prev && state.tab === "community" && state.activeChat === id) renderCommunity();
    },
  );
}

// Resolve a chat id to its conversation: a group, a local friend, or a
// cloud connection (uuid). Cloud sends/loads happen only for cloud targets —
// local-only chats never touch the network.
const SELF_CHAT_ID = "self-chat";
function isSelfChat(id) {
  return id === SELF_CHAT_ID;
}
function chatTarget(id) {
  // "Message yourself" — a private notepad-style chat that always works,
  // signed in or not. Cloud rows need a *different* recipient than the
  // sender (023 validates that), so self-chat stays local-first storage:
  // no network required, no server round-trip, nothing to fail.
  if (isSelfChat(id))
    return {
      kind: "self",
      friend: { id: SELF_CHAT_ID, username: state.profile.handle || "me", name: "You (Message yourself)" },
    };
  const group = allGroups().find((g) => g.id === id);
  if (group) return { kind: "group", group };
  const local = (state.friends || []).find((f) => f.id === id);
  if (local) return { kind: "friend", friend: local };
  const cloud = cloudFriends.find((f) => f.id === id);
  if (cloud) return { kind: "connection", friend: { id: cloud.id, username: cloud.handle, handle: cloud.handle, name: cloud.name, cloud: true } };
  return { kind: "unknown" };
}
function chatRoot() {
  return $("#tab-messages") || $("#community-body");
}
function chatBodyEl(root) {
  return $(".chat-body", root || chatRoot());
}
// Rebuild only the message list. Input drafts, focus and scroll survive:
// the textarea lives outside .chat-body, and we restore the scroll position
// unless the caller explicitly wants the bottom (new outbound message).
function paintChatBody(id, root, scrollBottom) {
  const body = chatBodyEl(root);
  if (!body) return;
  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 120;
  const msgs = state.messages[id] || [];
  body.innerHTML = msgs.map((m, i) => `<div class="bubble ${m.me ? "me" : ""}" data-midx="${i}">${messageHtml(m)}</div>`).join("")
    || '<span class="muted">No messages yet. Start the conversation.</span>';
  if (scrollBottom || nearBottom) body.scrollTop = body.scrollHeight;
}
function appendChatBubble(id, m, root) {
  const body = chatBodyEl(root);
  if (!body) return false;
  const empty = body.querySelector(":scope > .muted");
  if (empty) empty.remove();
  const idx = (state.messages[id] || []).length - 1;
  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 160;
  body.insertAdjacentHTML("beforeend", `<div class="bubble ${m.me ? "me" : ""}" data-midx="${idx}">${messageHtml(m)}</div>`);
  if (nearBottom || m.me) body.scrollTop = body.scrollHeight;
  return true;
}
function paintMessageStatus(messageId) {
  const btn = document.querySelector(`[data-react-open="${messageId}"]`);
  const meta = btn?.closest(".bubble")?.querySelector(".message-meta");
  if (!meta || !btn) return;
  const st = state.messageStatus[messageId];
  meta.textContent = meta.textContent.replace(/·.*$/, st === "read" ? "· Read" : st === "delivered" ? "· Delivered" : "· Sent");
}
function paintTypingIndicator(id, isTyping, root) {
  const head = (root || chatRoot())?.querySelector(".chat-head > div");
  if (!head || state.activeChat !== id) return;
  let el = head.querySelector(".typing-indicator");
  if (isTyping && !el) {
    el = document.createElement("div");
    el.className = "typing-indicator";
    el.textContent = "Someone is typing…";
    head.append(el);
  } else if (!isTyping && el) {
    el.remove();
  }
}
// Server history merges into the local cache once per chat open. Guarded by
// a token so a late response never paints into a different conversation.
let historyToken = 0;
// Shared cloud-row plumbing: resolve sender handles, merge rows into the
// local cache (dedupe by cloud id, cap 300), and fold server reactions in.
// Used by both history load and search deepening so the mapping stays single.
const senderNameCache = new Map(); // userId -> "@handle" (session cache)
async function resolveSenderName(userId) {
  if (!userId || userId === state.user?.id) return undefined;
  if (senderNameCache.has(userId)) return senderNameCache.get(userId);
  // Friend connections already carry a handle — no network needed.
  const known = cloudFriends.find((f) => f.id === userId) || cloudFriendReqs.find((r) => r.otherId === userId);
  if (known?.handle) {
    const label = "@" + known.handle;
    senderNameCache.set(userId, label);
    return label;
  }
  const { data } = await getPublicProfiles([userId]).catch(() => ({ data: [] }));
  const label = data?.[0] ? "@" + (data[0].handle || "member") : undefined;
  if (label) senderNameCache.set(userId, label);
  return label;
}
async function resolveSenderNames(rows, me) {
  const unknown = [...new Set(rows.filter((r) => r.sender_id !== me).map((r) => r.sender_id).filter(Boolean))];
  if (!unknown.length) return new Map();
  const { data: profiles } = await getPublicProfiles(unknown).catch(() => ({ data: [] }));
  return new Map((profiles || []).map((p) => [p.id, "@" + (p.handle || "member")]));
}
function mergeCloudRows(id, rows, names, me) {
  // Dedupe key: a locally-sent message adopts the server row id as cloudId
  // (sendChat). Its LOCAL id differs from the server's — and server history
  // returns the server id — so the seen-set must test BOTH ids for every
  // cached message. Keying on `m.id || m.cloudId` alone matched a fresh
  // server row against the local id only, and every own message came back
  // from history as a second, identical bubble (the "sent twice" flaw).
  const seen = new Set();
  for (const m of state.messages[id] || []) {
    if (m.id) seen.add(m.id);
    if (m.cloudId) seen.add(m.cloudId);
  }
  if (isSelfChat(id)) return 0; // self-chat is local-first, no server rows
  let added = 0;
  const merged = [...(state.messages[id] || [])];
  for (const r of rows) {
    if (!r || !r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push({
      id: r.id,
      cloudId: r.id,
      me: r.sender_id === me,
      sender_id: r.sender_id,
      sysName: r.sender_id === me ? undefined : names.get(r.sender_id),
      text: r.text || "",
      kind: r.kind && r.kind !== "text" ? r.kind : undefined,
      ts: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      edited: Boolean(r.edited_at),
    });
    if (r.sender_id === me) state.messageStatus[r.id] = "delivered";
    added++;
  }
  if (added) {
    // Structured invite DMs (sprints / sessions) land in their inboxes too.
    harvestInvitesFromRows(rows, (r) => {
      const p = (r.sender_id && cloudFriendReqsById(r.sender_id)) || {};
      return { id: r.sender_id, handle: names.get(r.sender_id)?.replace(/^@/, "") || p.handle || "a friend" };
    });
  }
  if (!added) return 0;
  merged.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  state.messages[id] = merged.slice(-300);
  persist();
  return added;
}
// Server is authoritative for reactions on cloud messages (converges every
// device on reopen). Local-only messages keep local-only reactions.
async function attachCloudReactions(id, me) {
  const cloudIds = (state.messages[id] || []).map((m) => m.cloudId).filter(Boolean);
  if (!cloudIds.length) return false;
  const { data, error } = await loadMessageReactions(cloudIds).catch(() => ({ data: [] }));
  if (error || !Array.isArray(data) || !data.length) return false;
  const key = chatKey();
  const byMsg = new Map();
  for (const r of data) {
    if (!r || !r.message_id || !r.emoji) continue;
    if (!byMsg.has(r.message_id)) byMsg.set(r.message_id, {});
    const bucket = byMsg.get(r.message_id);
    const who = r.user_id === me ? key : String(r.user_id || "");
    if (!who) continue;
    bucket[r.emoji] = bucket[r.emoji] || [];
    if (!bucket[r.emoji].includes(who)) bucket[r.emoji].push(who);
  }
  if (!byMsg.size) return false;
  let changed = false;
  for (const m of state.messages[id] || []) {
    if (!m.cloudId || !byMsg.has(m.cloudId)) continue;
    if (JSON.stringify(m.reactions || {}) !== JSON.stringify(byMsg.get(m.cloudId))) {
      m.reactions = byMsg.get(m.cloudId);
      changed = true;
    }
  }
  if (changed) persist();
  return changed;
}
async function loadCloudHistory(id, root) {
  if (!signedIn()) return;
  const target = chatTarget(id);
  if (target.kind === "group" && !isCloudGroup(id) && !myGroupRole(id)) {
    // Custom groups created before Phase 7 may still have a cloud copy with
    // the same id — try it, but treat any failure as local-only.
  }
  if (target.kind !== "group" && target.kind !== "connection" && !(target.kind === "friend" && isUuid(id))) return;
  if (target.kind === "connection" && !isUuid(id)) return;
  const token = ++historyToken;
  try {
    const { data, error } = await loadConversation(
      target.kind === "group" ? { groupId: id } : { recipientId: id }, // friend/uuid DMs use recipientId too
    );
    if (error || token !== historyToken || state.activeChat !== id) return;
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return;
    const me = state.user.id;
    // Paint history immediately; sender names resolve afterwards and patch
    // in place. Waiting on profile lookups before painting was the visible
    // "messages arrive late" delay when opening a chat.
    const added = mergeCloudRows(id, rows, new Map(), me);
    if (token !== historyToken || state.activeChat !== id) return;
    if (added) {
      markChatRead(id); // history merged while the chat is open = seen
      paintChatBody(id, root, false);
      paintMessagesBadge(totalUnreadCount());
    }
    resolveSenderNames(rows, me).then((names) => {
      if (!names.size || token !== historyToken) return;
      let patched = false;
      for (const m of state.messages[id] || []) {
        if (!m.me && m.sender_id && names.has(m.sender_id) && m.sysName !== names.get(m.sender_id)) {
          m.sysName = names.get(m.sender_id);
          patched = true;
        }
      }
      if (patched) {
        persist();
        if (state.activeChat === id) paintChatBody(id, root, false);
      }
    }).catch(() => {});
    let reactionsChanged = false;
    if (token === historyToken && state.activeChat === id) {
      reactionsChanged = await attachCloudReactions(id, me).catch(() => false);
    }
    if (reactionsChanged && token === historyToken && state.activeChat === id) {
      paintChatBody(id, root, false);
    }
  } catch {
    /* offline — local cache stands */
  }
}
// Search deepening: group search starts local, then pages older cloud
// history (up to 4 extra pages) so matches aren't limited to the newest 300.
// Explicit button (never auto-query): offline-safe, no extra subscriptions.
async function deepenGroupSearch(id) {
  if (!signedIn()) return;
  if (!groupSearch || groupSearch.id !== id || groupSearch.deepening) return;
  const q = String(groupSearch.q || "").trim();
  if (q.length < 2) return;
  const target = chatTarget(id);
  if (target.kind !== "group" && target.kind !== "connection") return;
  if (target.kind === "connection" && !isUuid(id)) return;
  const depth = groupSearch.depth || 0;
  if (depth >= 4) return;
  const local = state.messages[id] || [];
  if (!local.length) return;
  const oldest = local.reduce((n, m) => Math.min(n, m.ts || Date.now()), Date.now());
  groupSearch.deepening = true;
  groupSearch.depth = depth + 1;
  paintGroupSearchResults(id);
  try {
    const args = target.kind === "group" ? { groupId: id } : { recipientId: id }; // friend/uuid DMs use recipientId too
    const { data, error } = await loadConversation({
      ...args,
      limit: 100,
      before: new Date(oldest).toISOString(),
    });
    if (error || !groupSearch || groupSearch.id !== id) return;
    const rows = Array.isArray(data) ? data : [];
    if (rows.length) {
      const me = state.user.id;
      const names = await resolveSenderNames(rows, me).catch(() => new Map());
      if (!groupSearch || groupSearch.id !== id) return;
      mergeCloudRows(id, rows, names, me);
      await attachCloudReactions(id, me).catch(() => {});
    }
  } finally {
    if (groupSearch && groupSearch.id === id) {
      groupSearch.deepening = false;
      paintGroupSearchResults(id);
    }
  }
}

function sendChat(id, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return;
  if (isBlockedKey(id) || cloudBlocked.has(id)) {
    renderCommunity();
    return notify("You have blocked this conversation");
  }
  const target = chatTarget(id);
  const message = {
    id: uid(),
    me: true,
    text: trimmed.slice(0, 4000),
    ts: Date.now(),
    deliveryStatus: "sent",
  };
  if (chatReply && chatReply.chatId === id) {
    message.reply = { author: chatReply.author, text: chatReply.text };
    chatReply = null;
  }
  state.messages[id] = [...(state.messages[id] || []), message];
  state.messageStatus[message.id] = "sent";
  persist();
  // Self-chat persists locally only — by design (see chatTarget).
  if (target.kind === "self") {
    renderMessages($("#tab-messages") || $("#community-body"));
    return;
  }
  // Cloud fan-out only for cloud-backed conversations. Local-only chats
  // stay local — and a cloud failure never blocks or spams the sender.
  // (Group sends always attempt when signed in: pre-Phase-7 custom groups
  // may still own a cloud copy with the same id; RLS decides.)
  // A locally-stored friend whose id was resolved to a real cloud account
  // (uuid) is cloud-backed too — that's how directory-resolved adds ship.
  const cloudOk = signedIn() && (target.kind === "group" || target.kind === "connection" || (target.kind === "friend" && isUuid(id)));
  if (cloudOk) {
    const payload = target.kind === "group"
      ? { id: crypto.randomUUID(), sender_id: state.user.id, group_id: id, recipient_id: null, text: message.text, kind: "text", delivery_status: "sent" }
      // NOTE: no `id` — sf_direct_message generates + returns the canonical
      // server id. Sending a client uuid here made PostgREST run
      // INSERT..RETURNING, which RLS-returned zero rows (delete policy) →
      // result.error → the RPC fallback inserted a SECOND server row, and
      // the recipient's history then showed every message twice.
      : { sender_id: state.user.id, group_id: null, recipient_id: id, text: message.text, kind: "text", delivery_status: "sent" };
    sendCloudMessage(payload).then((result) => {
      if (!result.error) {
        // The server assigns the canonical id (the RPC generates its own) —
        // adopt it so read receipts and edits key off the right row.
        message.cloudId = result.data?.id || payload.id;
        state.messageStatus[message.id] = "delivered";
        persist();
      }
      paintMessageStatus(message.id);
    }).catch(() => {});
  }
  renderMessages($("#tab-messages") || $("#community-body"));
}

function subscribeToChat(id) {
  // Closing a chat (mobile back arrow) and immediately reopening the SAME
  // chat re-subscribes while Supabase may still be tearing the old channel
  // down — which throws and, unguarded, used to break the whole tab render.
  // A same-chat resubscribe keeps the existing (already correct) channel.
  if (chatSubTarget === id && conversationSubscription) return;
  chatSubTarget = id;
  conversationSubscription?.unsubscribe();
  const target = chatTarget(id);
  const group = target.kind === "group" ? target.group : null;
  // Local-only chats have no server counterpart — nothing to subscribe to.
  // Directory-resolved friends (uuid id) are cloud-backed even though they
  // sit in state.friends.
  const cloudBacked = target.kind === "group" || target.kind === "connection" || (target.kind === "friend" && isUuid(id));
  if (!signedIn() || !cloudBacked) {
    // Self-chat and other local-only chats: inert subscription, typing stays local.
    conversationSubscription = { unsubscribe: () => {}, sendTyping: async () => {} };
    return;
  }
  try {
  conversationSubscription = subscribeToConversation({
    groupId: group?.id,
    recipientId: group ? undefined : id,
    myUserId: state.user?.id,
    onMessage: (message) => {
      if (!message || !message.id) return;
      // Own echo: Postgres realtime delivers MY writes back to my other
      // devices/tabs. Without this, a message typed here appears twice (once
      // optimistically, once from the echo) and my own reply never made it
      // into open chat on the second device. Instead of dropping, we merge:
      // stamp the canonical server id onto the matching local bubble (it
      // keyed status/read receipts off the server id) and bail — no second
      // bubble, no lost message.
      if (message.sender_id === state.user?.id) {
        const list = state.messages[id] || [];
        const match =
          list.find((m) => m.cloudId === message.id) ||
          list.find((m) => m.me && !m.cloudId && m.text === message.text && Math.abs((m.ts || 0) - (message.created_at ? new Date(message.created_at).getTime() : 0)) < 30000);
        if (match) {
          match.cloudId = message.id;
          if (match.ts && message.created_at) match.ts = new Date(message.created_at).getTime();
          state.messageStatus[match.id] = "delivered";
          persist();
          paintMessageStatus(match.id);
        }
        return;
      }
      // Someone else's message: if it's already cached (history raced
      // realtime), just paint — never append a twin.
      const dupe = (state.messages[id] || []).some((m) => m.id === message.id || m.cloudId === message.id);
      if (dupe) return;
      // Structured invite DMs (sprints / sessions) route themselves even when
      // this conversation is closed — the inbox is the destination, not the
      // chat window.
      harvestInvitesFromRows([message], (r) => ({ id: r.sender_id, handle: cloudFriendReqsById(r.sender_id)?.handle || "a friend" }));
      const row = {
        id: message.id,
        cloudId: message.id,
        text: message.text,
        kind: message.kind,
        ts: message.created_at ? new Date(message.created_at).getTime() : Date.now(),
        me: false,
        sender_id: message.sender_id,
      };
      const attach = async () => {
        // Sender name resolution happens after the bubble is on screen —
        // waiting for a profile fetch before painting made messages feel
        // seconds late. resolveSenderName patches the label in place.
        if (row.sender_id) resolveSenderName(row.sender_id).then((n) => {
          if (!n) return;
          row.sysName = n;
          if (state.activeChat === id) paintChatBody(id, chatRoot(), false);
        }).catch(() => {});
        const twin = (state.messages[id] || []).some((m) => m.id === message.id || m.cloudId === message.id);
        if (state.activeChat !== id) {
          // Background chat: cache only, plus the standard notification path.
          if (!twin) {
            state.messages[id] = [...(state.messages[id] || []), row].slice(-300);
            persist();
          }
          // Unread badge lives while the chat is closed; muted chats stay silent.
          if (state.tab === "community" && !isChatMuted(id)) paintMessagesBadge(totalUnreadCount());
        } else {
          if (!twin) {
            state.messages[id] = [...(state.messages[id] || []), row].slice(-300);
            persist();
          }
          markChatRead(id); // chat is open and visible — counts as read
          if (!twin && !appendChatBubble(id, row, chatRoot()) && state.tab === "community") renderCommunity();
          if (state.tab === "community") paintMessagesBadge(totalUnreadCount());
        }
        if (state.user) markMessageRead(message.id, state.user.id).catch(() => {});
        if (notifOn("community") && !isChatMuted(id)) {
          const chat = groupById(id) || (state.friends || []).find((f) => f.id === id) || cloudFriends.find((f) => f.id === id);
          const who = chat?.name || (chat ? "@" + (chat.username || chat.handle) : "Community");
          browserNotify(`New message · ${who}`, cleanText(message.text || "").slice(0, 120));
        }
      };
      attach().catch(() => {});
    },
    onUpdate: (message) => {
      // Edits repaint in place; soft-deletes remove the bubble. Both are
      // targeted — the input, focus and scroll are untouched.
      if (!message || state.activeChat !== id) return;
      const list = state.messages[id] || [];
      const idx = list.findIndex((m) => m.id === message.id || m.cloudId === message.id);
      if (idx < 0) return;
      if (message.deleted_at) {
        const [gone] = list.splice(idx, 1);
        if (gone) {
          const pins = pinnedIdsFor(id);
          if (pins.includes(gone.id)) togglePinMessage(id, gone.id);
        }
        state.messages[id] = list;
        persist();
        paintChatBody(id, chatRoot(), false);
      } else if (message.text != null && list[idx].text !== message.text) {
        list[idx] = { ...list[idx], text: message.text, edited: true };
        persist();
        paintChatBody(id, chatRoot(), false);
      }
    },
    onTyping: (payload) => {
      if (payload.userId === state.user?.id) return;
      state.typing[id] = payload.isTyping;
      paintTypingIndicator(id, payload.isTyping, chatRoot());
      // Typing flags expire on their own — a lost realtime update must
      // not leave "Someone is typing…" on screen forever.
      clearTimeout(typingTimeouts[id]);
      if (payload.isTyping)
        typingTimeouts[id] = setTimeout(() => {
          if (state.typing[id]) {
            delete state.typing[id];
            paintTypingIndicator(id, false, chatRoot());
          }
        }, 6000);
    },
    onRead: (receipt) => {
      state.messageStatus[receipt.message_id] = receipt.read_at
        ? "read"
        : "delivered";
      paintMessageStatus(receipt.message_id);
    },
  });
  } catch (err) {
    // A torn-down channel racing the new subscribe must never break the
    // chat render — the app still works with local messages + polling.
    console.warn("[studyflow] chat subscribe skipped:", err?.message || err);
    conversationSubscription = { unsubscribe: () => {}, sendTyping: async () => {} };
  }
}
// Delete a message: own messages always; others' only by group owner/admin
// on the server (the RPC re-checks the role — the UI gate is just courtesy).
function askDeleteMessage(id, mid, root) {
  const list = state.messages[id] || [];
  const msg = list.find((m) => m.id === mid);
  if (!msg) return;
  const role = myGroupRole(id);
  const canModerate = signedIn() && isGroupChat(id) && (role === "owner" || role === "admin") && msg.cloudId;
  if (!msg.me && !canModerate) return notify("You can only delete your own messages");
  confirmBox(canModerate && !msg.me ? "Delete this message?" : "Delete this message?", canModerate && !msg.me ? "Removed for everyone in the group." : "Removed from this conversation.", async () => {
    state.messages[id] = (state.messages[id] || []).filter((m) => m.id !== mid);
    const pins = pinnedIdsFor(id);
    if (pins.includes(mid)) togglePinMessage(id, mid);
    persist();
    if (msg.cloudId && signedIn()) {
      try {
        const { error } = await deleteCloudMessage(msg.cloudId);
        if (error && !isPhase7Missing(error) && navigator.onLine) {
          notify("Couldn't delete on the server — " + String(error.message).slice(0, 80));
        }
      } catch { /* local delete stands */ }
    }
    const bubble = document.querySelector(`[data-react-open="${mid}"]`)?.closest(".bubble");
    if (bubble && state.activeChat === id) bubble.remove();
    else paintChatBody(id, root, false);
  });
}
// Inline message editing: own text messages only (admins/owners get no edit
// rights on other people's messages — moderation stays delete-only, and the
// database re-checks sender ownership on every save).
let editingMessage = null; // { chatId, mid }
function startMessageEdit(cid, mid, root) {
  const msg = (state.messages[cid] || []).find((m) => m.id === mid);
  if (!msg || !msg.me) return;
  if (msg.kind != null && msg.kind !== "text") return notify("Only text messages can be edited");
  editingMessage = { chatId: cid, mid };
  const bubble = root.querySelector(`[data-react-open="${mid}"]`)?.closest(".bubble");
  if (!bubble) {
    editingMessage = null;
    return;
  }
  bubble.dataset.editing = "1";
  bubble.innerHTML = `<div class="msg-edit-box"><textarea class="textarea" data-msg-edit-input rows="2" maxlength="4000" aria-label="Edit message">${esc(msg.text || "")}</textarea><div class="msg-edit-actions"><button type="button" class="ghost" data-msg-edit-cancel>Cancel</button><button type="button" class="primary" data-msg-edit-save>Save</button></div></div>`;
  const input = bubble.querySelector("[data-msg-edit-input]");
  input?.focus();
  try {
    input?.setSelectionRange(input.value.length, input.value.length);
  } catch { /* ignore */ }
  input?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      cancelMessageEdit();
    } else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      saveMessageEdit();
    }
  });
  bubble.querySelector("[data-msg-edit-cancel]").onclick = () => cancelMessageEdit();
  bubble.querySelector("[data-msg-edit-save]").onclick = () => saveMessageEdit();
}
function cancelMessageEdit() {
  // Cancel makes NO database change — just repaint the chat region.
  if (!editingMessage) return;
  const { chatId } = editingMessage;
  editingMessage = null;
  paintChatBody(chatId, chatRoot(), false);
}
async function saveMessageEdit() {
  if (!editingMessage) return;
  const { chatId: cid, mid } = editingMessage;
  if (state.activeChat !== cid) {
    editingMessage = null;
    return;
  }
  const root = chatRoot();
  const bubble = root.querySelector(`[data-react-open="${mid}"]`)?.closest(".bubble")
    || [...root.querySelectorAll(".bubble")].find((b) => b.dataset.editing);
  const input = bubble?.querySelector("[data-msg-edit-input]");
  const msg = (state.messages[cid] || []).find((m) => m.id === mid);
  if (!msg || !input || !msg.me) {
    editingMessage = null;
    paintChatBody(cid, root, false);
    return;
  }
  const next = input.value.trim().slice(0, 4000);
  if (!next) {
    notify("Message can't be empty");
    input.focus();
    return;
  }
  if (next === msg.text) {
    editingMessage = null;
    paintChatBody(cid, root, false);
    return;
  }
  const saveBtn = bubble.querySelector("[data-msg-edit-save]");
  // Cloud-backed messages confirm with the server first, so a reload always
  // shows exactly what the user sees. Local-only edits apply instantly.
  if (msg.cloudId && signedIn()) {
    if (!navigator.onLine) {
      notify("You're offline — reconnect to save this edit.");
      input.focus();
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const { error } = await editCloudMessage(msg.cloudId, next);
      if (error) throw error;
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
      const raw = String(e?.message || "");
      notify(/permission|forbidden|GROUP_FORBIDDEN/i.test(raw)
        ? "You can only edit your own messages."
        : "Couldn't save the edit — try again.");
      input.focus();
      return;
    }
  }
  msg.text = next;
  msg.edited = true;
  persist();
  editingMessage = null;
  paintChatBody(cid, root, false);
  notify("Message edited");
}

let callClockT = 0;
let remoteStream = null;
let callReactions = []; // {emoji, id} — floating reaction bursts

function callDurationText() {
  if (!state.callStartedAt) return "00:00";
  const s = Math.max(0, Math.floor((Date.now() - state.callStartedAt) / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const two = (n) => String(n).padStart(2, "0");
  return h ? `${two(h)}:${two(m % 60)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`;
}

function startCallClock() {
  stopCallClock();
  callClockT = setInterval(() => {
    const el = $("[data-call-timer]");
    if (el) el.textContent = callDurationText();
  }, 1000);
}

function stopCallClock() {
  if (callClockT) {
    clearInterval(callClockT);
    callClockT = 0;
  }
}

function pushCallReaction(emoji) {
  if (!state.call) return;
  const id = uid();
  callReactions = [...callReactions.slice(-6), { emoji, id }];
  const stage = $("[data-call-stage]");
  if (stage) {
    const el = document.createElement("span");
    el.className = "call-reaction";
    el.textContent = emoji;
    el.style.left = 12 + Math.random() * 70 + "%";
    stage.append(el);
    setTimeout(() => el.remove(), 2400);
  }
}

function callQualityMeta() {
  if (state.callStatus === "connected") {
    return { cls: "ok", label: "Connected" };
  }
  if (state.callStatus === "connecting") {
    return { cls: "wait", label: "Connecting" };
  }
  return { cls: "idle", label: "Ready" };
}

function renderCall() {
  let old = $("#call-window");
  if (old) old.remove();
  if (!state.call) {
    stopCallClock();
    remoteStream = null;
    return;
  }
  const q = callQualityMeta();
  const minimized = Boolean(state.callMinimized);
  const call = document.createElement("div");
  call.id = "call-window";
  call.className = `call-window ${minimized ? "minimized" : ""} q-${q.cls}`;
  call.setAttribute("role", "dialog");
  call.setAttribute("aria-label", `Call with ${state.call.name}`);
  // Keep 1:1 remoteStream mirror in sync with the mesh map.
  if (callRemotes.size === 1) remoteStream = callRemotes.values().next().value;
  else if (callRemotes.size === 0) remoteStream = null;
  const isGroup = state.call.kind === "group" || callRemotes.size > 1;
  const remoteTiles = [...callRemotes.entries()].map(([pid, stream], i) => {
    const label = state.call.kind === "group" ? `Guest ${i + 1}` : "Partner";
    return `<div class="call-tile remote" data-remote-tile="${esc(pid)}">${
      stream
        ? `<video class="call-video" data-call-remote="${esc(pid)}" autoplay playsinline></video>`
        : `<div class="tile-avatar">${state.call.emoji || "◉"}</div><div class="tile-hint"><span class="call-dots"><i></i><i></i><i></i></span> Connecting…</div>`
    }<span class="tile-tag">${sicon("user")} ${label}</span></div>`;
  }).join("");
  const partnerTile = callRemotes.size
    ? (isGroup ? remoteTiles : `<div class="call-tile main">${
        remoteStream
          ? `<video class="call-video" data-call-remote autoplay playsinline></video><span class="tile-tag">${sicon("user")} Partner</span>`
          : `<div class="tile-avatar">${state.call.emoji || "◉"}</div><span class="tile-tag">${sicon("user")} Partner</span>`
      }</div>`)
    : `<div class="call-tile main"><div class="tile-avatar">${state.call.emoji || "◉"}</div><span class="tile-tag">${sicon("user")} ${isGroup ? "Room" : "Partner"}</span><div class="tile-hint">${
        state.callStatus === "connecting"
          ? `<span class="call-dots"><i></i><i></i><i></i></span> ${state.call.kind === "dm" && callIsInitiator ? "Ringing your partner…" : "Waiting for others to join…"}`
          : "Press Connect to start the call"
      }</div></div>`;
  const selfTile = activeCallStream
    ? `<video class="call-video mirrored" data-call-self autoplay playsinline muted></video>`
    : `<div class="tile-avatar small">${state.profile.photo ? `<img src="${esc(state.profile.photo)}" alt="">` : esc(state.profile.avatar || "SL")}</div>`;
  const stageInner = isGroup && callRemotes.size
    ? `${selfTile ? `<div class="call-tile self-inline">${selfTile}<span class="tile-tag">${state.callMuted ? sicon("mute") + " Muted" : "You"}</span></div>` : ""}${remoteTiles}`
    : `<div class="call-tile main">${partnerTile.replace(/^<div class="call-tile main">|<\/div>$/g, "")}</div>
       <div class="call-tile self">${selfTile}<span class="tile-tag">${state.callMuted ? sicon("mute") + " Muted" : "You"}</span></div>`;
  call.innerHTML = `
    <div class="call-head">
      <span class="call-live"><i class="call-dot"></i> ${esc(state.call.name)}${isGroup ? ` · ${callRemotes.size + 1}` : ""}</span>
      <span class="call-meta">
        <span class="call-timer" data-call-timer>${callDurationText()}</span>
        <span class="call-quality q-${q.cls}"><i></i>${q.label}</span>
      </span>
      <span class="call-head-actions">
        ${state.callStatus === "connected" ? `<button type="button" class="call-icon" data-call-add title="Add people" aria-label="Add people to call">${sicon("users")}</button>` : ""}
        <button type="button" class="call-icon" data-call-pips title="${minimized ? "Expand call" : "Minimize"}" aria-label="${minimized ? "Expand call" : "Minimize call"}">${minimized ? sicon("expand") : sicon("tab")}</button>
        <button type="button" class="call-icon danger" data-end title="End call" aria-label="End call">${sicon("x")}</button>
      </span>
    </div>
    <div class="call-stage ${isGroup ? "group" : ""}" data-call-stage>
      ${stageInner}
      ${state.callCameraOff && activeCallStream ? '<div class="cam-off-note">Camera is off</div>' : ""}
      ${state.callStatus === "connecting" ? '<div class="call-connecting"><span class="call-dots"><i></i><i></i><i></i></span><p>Connecting to your study partner…</p><p class="sub">End-to-end peer connection · audio + video</p></div>' : ""}
    </div>
    <div class="call-controls">
      <div class="call-ctrl-group">
        ${state.callStatus === "connected" ? `<button type="button" class="call-btn" data-call-reaction="fire" title="Send a fire reaction" aria-label="Fire reaction">🔥</button><button type="button" class="call-btn" data-call-reaction="party" title="Send a celebration reaction" aria-label="Celebration reaction">🎉</button><button type="button" class="call-btn" data-call-reaction="strong" title="Send a encouragement reaction" aria-label="Encouragement reaction">💪</button>` : `<button type="button" class="call-btn primary tall" data-connect>${state.callStatus === "connecting" ? '<span class="call-dots light"><i></i><i></i><i></i></span> Connecting…' : sicon("phone") + " Start call"}</button>`}
      </div>
      <div class="call-ctrl-group">
        <button type="button" class="call-btn round ${state.callMuted ? "off" : ""}" data-mute title="${state.callMuted ? "Unmute microphone" : "Mute microphone"}" aria-pressed="${Boolean(state.callMuted)}" aria-label="Microphone">${state.callMuted ? sicon("mute") : sicon("mic")}</button>
        <button type="button" class="call-btn round ${state.callCameraOff ? "off" : ""}" data-camera title="${state.callCameraOff ? "Turn camera on" : "Turn camera off"}" aria-pressed="${Boolean(state.callCameraOff)}" aria-label="Camera">${sicon("camera")}</button>
        <button type="button" class="call-btn round" data-flip-camera title="Flip camera" aria-label="Flip camera">${sicon("refresh")}</button>
        <button type="button" class="call-btn round" data-share title="Share your screen" aria-label="Share screen">${sicon("upload")}</button>
        <button type="button" class="call-btn round" data-call-chat title="Open chat" aria-label="Open chat">${sicon("chat")}</button>
        <button type="button" class="call-btn round hang" data-end title="Leave call" aria-label="Leave call">${sicon("phone")}</button>
      </div>
    </div>
  `;
  document.body.append(call);
  startCallClock();
  // Attach streams as soon as the tiles exist.
  if (isGroup) {
    callRemotes.forEach((stream, pid) => {
      const rv = $(`[data-call-remote="${CSS.escape(pid)}"]`, call);
      if (rv && stream) rv.srcObject = stream;
    });
  } else if (remoteStream) {
    const rv = $("[data-call-remote]", call);
    if (rv) rv.srcObject = remoteStream;
  }
  if (activeCallStream) {
    const sv = $("[data-call-self]", call);
    if (sv) {
      sv.srcObject = activeCallStream;
      sv.addEventListener("loadedmetadata", () => sv.play?.().catch(() => {}), { once: true });
    }
  }
  if (!minimized) {
    callReactions.forEach((r) => pushCallReaction(r.emoji));
  }
  $(`[data-connect]`, call) && ($(`[data-connect]`, call).onclick = connectCall);
  $(`[data-call-add]`, call)?.addEventListener("click", () => inviteToActiveCall());
  $$('[data-call-reaction]', call).forEach(
    (b) => (b.onclick = () => pushCallReaction(b.dataset.callReaction === "fire" ? "🔥" : b.dataset.callReaction === "party" ? "🎉" : "💪")),
  );
  const eachPeer = (fn) => {
    callPeers.forEach((p) => { try { fn(p.peer); } catch { /* ignore */ } });
    if (activePeer) { try { fn(activePeer.peer); } catch { /* ignore */ } }
  };
  $(`[data-mute]`, call).onclick = () => {
    state.callMuted = !state.callMuted;
    eachPeer((peer) => peer.getSenders().forEach((s) => {
      if (s.track?.kind === "audio") s.track.enabled = !state.callMuted;
    }));
    activeCallStream?.getAudioTracks().forEach((t) => (t.enabled = !state.callMuted));
    renderCall();
  };
  $(`[data-camera]`, call).onclick = () => {
    state.callCameraOff = !state.callCameraOff;
    eachPeer((peer) => peer.getSenders().forEach((s) => {
      if (s.track?.kind === "video") s.track.enabled = !state.callCameraOff;
    }));
    activeCallStream?.getVideoTracks().forEach((t) => (t.enabled = !state.callCameraOff));
    renderCall();
  };
  $(`[data-flip-camera]`, call)?.addEventListener("click", async () => {
    try {
      const videoTrack = activeCallStream?.getVideoTracks()[0];
      if (!videoTrack) return notify("No camera active to flip");
      const devices = await navigator.mediaDevices?.enumerateDevices();
      const cams = (devices || []).filter((d) => d.kind === "videoinput");
      if (cams.length < 2) return notify("Only one camera found");
      const curId = videoTrack.getSettings().deviceId;
      const next = cams.find((d) => d.deviceId !== curId) || cams[0];
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } } });
      const newTrack = newStream.getVideoTracks()[0];
      eachPeer((peer) => peer.getSenders().forEach((s) => {
        if (s.track?.kind === "video") s.replaceTrack(newTrack).catch(() => {});
      }));
      videoTrack.stop();
      activeCallStream.removeTrack(videoTrack);
      activeCallStream.addTrack(newTrack);
      renderCall();
    } catch (err) {
      notify("Could not flip camera: " + (err.message || "unknown error"));
    }
  });
  $(`[data-share]`, call).onclick = async () => {
    try {
      const display = await navigator.mediaDevices?.getDisplayMedia({ video: true });
      if (!display) return;
      notify("Screen sharing started");
      display.getVideoTracks().forEach((track) =>
        eachPeer((peer) => peer.getSenders().forEach((s) => {
          if (s.track?.kind === "video") s.replaceTrack(track).catch(() => {});
        })),
      );
      display.getVideoTracks().forEach((track) =>
        track.addEventListener(
          "ended",
          () => {
            notify("Screen sharing stopped");
            activeCallStream?.getVideoTracks().forEach((cam) =>
              eachPeer((peer) => peer.getSenders().forEach((s) => {
                if (s.track?.kind === "video") s.replaceTrack(cam).catch(() => {});
              })),
            );
          },
          { once: true },
        ),
      );
    } catch {
      notify("Screen sharing was cancelled");
    }
  };

  $("[data-call-pips]", call).onclick = () => {
    state.callMinimized = !state.callMinimized;
    renderCall();
  };
  if (minimized) {
    const stage = $("[data-call-stage]", call);
    if (stage) {
      let dragging = false, startX, startY, origX, origY;
      const onMove = (e) => {
        if (!dragging) return;
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const cy = e.touches ? e.touches[0].clientY : e.clientY;
        call.style.right = "auto";
        call.style.bottom = "auto";
        call.style.left = (origX + cx - startX) + "px";
        call.style.top = (origY + cy - startY) + "px";
      };
      const onUp = () => { dragging = false; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.removeEventListener("touchmove", onMove); document.removeEventListener("touchend", onUp); };
      stage.addEventListener("mousedown", (e) => { dragging = true; startX = e.clientX; startY = e.clientY; origX = call.offsetLeft; origY = call.offsetTop; document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp); });
      stage.addEventListener("touchstart", (e) => { dragging = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY; origX = call.offsetLeft; origY = call.offsetTop; document.addEventListener("touchmove", onMove, { passive: true }); document.addEventListener("touchend", onUp); }, { passive: true });
    }
  }
  $$("[data-end]", call).forEach(
    (b) => (b.onclick = () => teardownCall(true)),
  );
  $("[data-call-chat]", call).onclick = () => {
    if (!state.call) return;
    const chatId = state.call.peerId || state.call.id;
    state.callMinimized = true;
    state.tab = "community";
    state.subtab = "messages";
    state.activeChat = chatId;
    persist();
    call.remove();
    shell();
  };
}

// Mid-call invite: ring extra friends into the current room (group or 1:1
// upgraded). Each invitee gets a ringing participant row + call_history echo
// through the same subscription that powers Accept/Decline.
async function inviteToActiveCall() {
  if (!state.call || !activeCallHistoryId) return notify("Start the call first");
  openFriendsPicker({
    title: "Add people to the call",
    eyebrow: "Mid-call invite",
    note: "They'll get a ring and can join this room.",
    cta: "Send invites",
    onDone: async (ids) => {
      if (!ids.length) return;
      if (callPeers.size + ids.length > 5) return notify("This call is full (max 6 people)");
      if (!Array.isArray(state.call.extras)) state.call.extras = [];
      for (const id of ids) {
        if (!state.call.extras.includes(id)) state.call.extras.push(id);
        await upsertCallParticipant({
          call_id: activeCallHistoryId,
          user_id: id,
          status: "ringing",
        }).catch(() => {});
        // Their incoming-call subscription keys off participant INSERT too.
        await updateCall(activeCallHistoryId, { status: "ringing" }).catch(() => {});
      }
      startMeshWatch();
      notify(`Ringing ${ids.length} friend${ids.length === 1 ? "" : "s"}…`);
    },
  });
}

// force=true tears existing peers first (Accept re-offer when an early
// timeout offer went out before the callee's channel was up). Default is
// additive: fill missing mesh slots without dropping live ones.
async function connectCall({ force = false } = {}) {
  if (!backendConfigured)
    return notify("Add Supabase keys to enable live WebRTC calls");
  if (!state.call) return;
  if (connectInFlight) {
    // A second Accept/retry while the first connect is still opening media:
    // remember it and re-run (force) as soon as the in-flight call finishes.
    if (force) forceConnectPending = true;
    return;
  }
  connectInFlight = true;
  try {
    // A force-retry must tear previous peers down first, or old signaling
    // channels and tracks leak and the second connect always fails.
    if (force && (callPeers.size || activePeer)) {
      callPeers.forEach((p) => { try { p.close(); } catch { /* ignore */ } });
      callPeers.clear();
      callRemotes.clear();
      activePeer = null;
    }
    const permission = await navigator.permissions?.query?.({ name: "camera" });
    if (permission?.state === "denied")
      return notify(
        "Camera permission is blocked. Allow it in browser settings and try again.",
      );
    const micPermission = await navigator.permissions?.query?.({
      name: "microphone",
    });
    if (micPermission?.state === "denied")
      return notify(
        "Microphone permission is blocked. Allow it in browser settings and try again.",
      );
    if (state.callStatus !== "connected") state.callStatus = "connecting";
    renderCall();
    const stream = activeCallStream || await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    activeCallStream = stream;
    if (!state.callStartedAt) state.callStartedAt = Date.now();
    const targets = await resolveCallTargets();
    await Promise.all(targets.map((id) => ensureCallPeer(id, stream)));
    // Stay in "connecting" until onTrack reports real ICE — never claim
    // "connected" before a peer is up.
    if (!callPeers.size) state.callStatus = "idle";
    renderCall();
    notify(callPeers.size
      ? (callIsInitiator || state.call.kind === "group"
          ? "Outgoing call live — waiting for peers"
          : "Joined — waiting for the offer")
      : "Camera and microphone connected");
    ensureIncomingCallSubscription();
    startMeshWatch();
  } catch (error) {
    // A failed start must not leave a half-open camera or a stuck
    // "connecting" state behind.
    try {
      activeCallStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    activeCallStream = null;
    remoteStream = null;
    callRemotes.clear();
    callPeers.forEach((p) => { try { p.close(); } catch { /* ignore */ } });
    callPeers.clear();
    activePeer = null;
    if (state.call) {
      state.callStatus = "idle";
      renderCall();
    }
    notify(error?.message || "Could not start camera and microphone");
  } finally {
    connectInFlight = false;
    if (forceConnectPending && state.call) {
      forceConnectPending = false;
      // Re-offer after a concurrent Accept — don't lose the ring handshake.
      connectCall({ force: true }).catch(() => {});
    } else {
      forceConnectPending = false;
    }
  }
}



export { allGroups, sprintTicker, weekKey, logFocusDay, weekMinutes, progressChallenges, fmtCountdown, clearSprintTicker, ensureSprintTicker, renderCommunity, groupMatches, groupCardWithReason, renderSprints, leaderboardMarkup, sprintGroupName, sprintBoardMarkup, challengeRow, challengeMarkup, eventWhen, eventMarkup, postGroupMessage, bindSprints, timeAgo, isSeen, markSeen, statusDuration, buildStatusSequence, pruneExpiredStories, ownStory, deleteStatus, liveStories, storiesMarkup, bindStories, statusSeq, statusIdx, statusTimer, statusItemStart, statusItemDur, statusElapsed, statusPaused, statusHoldTimer, statusHolding, statusTouch, statusNavToken, statusNextIdx, statusPrevIdx, statusRemaining, clearStatusTimer, openStatus, closeStatus, closeStatusMenu, toggleStatusMenu, askDeleteStatus, afterStatusDeleted, statusKeys, goStatus, showStatusItem, renderStatusProgress, setStatusFill, startStatusPlayback, pauseStatus, resumeStatus, statusPointerDown, statusPointerUp, statusPointerCancel, renderDiscover, bindFeed, renderComments, subjectForGroup, groupCard, bindGroupButtons, renderMyGroups, inviteText, myReferralCode, referralMarkup, redeemReferral, conversationSubscription, renderFriends, renderMessages, chatKey, REACT_EMOJI, escSnippet, messageText, pollVotes, messageHtml, chatMarkup, bindChat, openPollBuilder, startRecording, stopRecording, saveVoice, subscribePresenceFor, sendChat, subscribeToChat, activePeer, activeCallHistoryId, chatReply, voiceRec, presenceSub, presenceInfo, renderCall, connectCall, ensureIncomingCallSubscription, startOutgoingCall, teardownCall, inviteToActiveCall };
export { postOwnerId, isOwnPost, visiblePosts, postMenuMarkup, closePostMenus, togglePostMenu, startPostEdit, askDeletePost, BLOCK_REASONS, isUuid, blockKeyFor, isBlockedKey, askBlockUser, blockReasonDialog, submitBlock, unblockUser, blockedSectionMarkup };
export { isGroupChat, groupById, isGroupOwner, isChatMuted, setChatMute, clearChatMute, muteLabel, searchGroupMessages, extractLinks, groupShared, groupRoster, senderLabel, groupMenuMarkup, leaveGroupById, openGroupSearch, jumpToGroupMessage, openGroupMedia, openMuteModal, openGroupInfo, openGroupMembers, openGroupSettings, openGroupReport, askClearGroupHistory, askLeaveGroup, askDisbandGroup, closeGroupMedia, closeMediaViewer };
export { sanitizeSprint, ensureSprintFields, isSprintOwner, sprintCrewWithMe, crewPaceMarkup, inviteInboxMarkup, resolveOneInvite, openSprintEditor, missionDeskMarkup, bindMissionDesk };
export { cleanText, sanitizeChallenge, ensureChallengeFields, fmtPace, paceSec, challengeLock, challengeLockBanner, otherActiveChallenge, joinChallenge, leaveChallenge, bumpChallengeMember, challengeScore, mateChallengeSession, finishChallenge };
export { isEventOwner, ensureEventFields, eventInboxMarkup, resolveOneEventInvite };
