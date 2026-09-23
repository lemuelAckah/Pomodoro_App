/* productivity-sync.js — Phase 3 cloud persistence for tasks, notes and
   study-technique data.

   Model: localStorage stays the immediate store (offline-first UI unchanged);
   this layer mirrors the same data to Supabase for signed-in users.

   - Every mutation calls `mirror*()` which schedules ONE debounced upsert per
     dataset — burst actions (complete 5 tasks, type in a note) produce one
     request, not five.
   - Deletes are sent through a durable queue (`sf-sync-outbox`) so a delete
     that happens offline still lands on the server after reconnect.
   - On login/refresh, `pullProductivity()` loads the user's cloud rows and
     merges them with local by `updated` timestamp (last-writer-wins per row),
     so two devices converge without duplicates (rows are keyed by client id).
   - All failures are silent-safe: local data is never erased, and a sync
     status ping (`setSyncStatus`) lets the UI show honest saving states. */

import { state, get, save } from "../core.js";
import { backendConfigured } from "./backend.js";
import {
  cloudListTasks,
  cloudUpsertTasks,
  cloudDeleteTask,
  cloudListNotes,
  cloudUpsertNotes,
  cloudDeleteNote,
  cloudGetAssessment,
  cloudSaveAssessment,
  cloudGetTechniqueUsage,
  cloudSaveTechniqueUsage,
} from "./backend.js";

const OUTBOX_KEY = "sf-sync-outbox";
const outbox = get(OUTBOX_KEY, { tasks: [], notes: [], counts: {} });
let flushTimer = null;
const timers = {};
const inflight = {};

let statusListener = null;
export function onSyncStatus(fn) {
  statusListener = fn;
  return () => (statusListener = null);
}
function setSyncStatus(key, status) {
  try {
    statusListener?.(key, status);
  } catch {
    /* UI listener errors never break syncing */
  }
}

const online = () => navigator.onLine !== false;
const canSync = () => backendConfigured && state.user && online();

// --- outbox (durable deletes) ------------------------------------------------

function queueOutbox(kind, id) {
  const list = outbox[kind] || (outbox[kind] = []);
  if (!list.includes(id)) list.push(id);
  save(OUTBOX_KEY, outbox);
  scheduleFlush();
}

async function flushOutbox() {
  if (!canSync()) return;
  const taskIds = outbox.tasks || [];
  const noteIds = outbox.notes || [];
  if (!taskIds.length && !noteIds.length) return;
  outbox.tasks = [];
  outbox.notes = [];
  save(OUTBOX_KEY, outbox);
  // Fire-and-forget each queued delete; on failure it rejoins the outbox.
  const results = await Promise.allSettled([
    ...taskIds.map((id) => cloudDeleteTask(id)),
    ...noteIds.map(([kind, id]) => cloudDeleteNote(kind, id)),
  ]);
  const stillDead = { tasks: [], notes: [] };
  results.forEach((r, i) => {
    if (r.status === "rejected" || r.value?.error) {
      if (i < taskIds.length) stillDead.tasks.push(taskIds[i]);
      else stillDead.notes.push(noteIds[i - taskIds.length]);
    }
  });
  if (stillDead.tasks.length || stillDead.notes.length) {
    outbox.tasks = [...(outbox.tasks || []), ...stillDead.tasks];
    outbox.notes = [...(outbox.notes || []), ...stillDead.notes];
    save(OUTBOX_KEY, outbox);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushOutbox().catch(() => {});
  }, 1200);
}

window.addEventListener("online", () => {
  scheduleFlush();
  // Offline edits set dirty flags in schedule(); re-push them now that we
  // can reach the server (pullProductivity merges the rest).
  schedule("tasks", async () => {
    const res = await cloudUpsertTasks(
      (state.tasks || []).map((t) => ({
        ...t,
        updated: t.updated || Date.now(),
        created: t.created || t.updated || Date.now(),
      })),
    );
    if (res.error) throw res.error;
  }, 0);
  schedule("notes", async () => {
    await cloudUpsertNotes("cornell", state.cornellNotes || []);
    await cloudUpsertNotes("feynman", state.feynmanNotes || []);
    await cloudUpsertNotes("mindmap", state.mindmaps || []);
  }, 0);
  syncAll().catch(() => {});
});

// --- debounced mirror per dataset ---------------------------------------------

// Dirty flags stay set when offline so schedule() can queue the work and the
// reconnect listener can push it — a bare `return` used to drop every edit
// made without a connection.
const dirty = new Set();

function schedule(dataset, fn, delay = 1500) {
  dirty.add(dataset);
  if (!canSync()) {
    // Local persistence already happened; push on reconnect.
    setSyncStatus(dataset, "offline");
    return;
  }
  clearTimeout(timers[dataset]);
  timers[dataset] = setTimeout(async () => {
    if (!canSync()) {
      setSyncStatus(dataset, "offline");
      return;
    }
    if (inflight[dataset]) return schedule(dataset, fn, 800); // queue behind
    timers[dataset] = null;
    if (!dirty.has(dataset)) return;
    dirty.delete(dataset);
    inflight[dataset] = true;
    setSyncStatus(dataset, "saving");
    try {
      await fn();
      setSyncStatus(dataset, "saved");
    } catch {
      dirty.add(dataset); // retry on next flush/tick
      setSyncStatus(dataset, "error");
    } finally {
      inflight[dataset] = false;
    }
  }, delay);
}

// Re-run the mirror for every dataset edited while offline. Callers pass the
// same factory they used for schedule() so the offline work finally lands.
export function flushDirtyMirrors(mirrors) {
  if (!canSync()) return;
  for (const [dataset, run] of Object.entries(mirrors || {})) {
    if (dirty.has(dataset)) schedule(dataset, run, 0);
  }
}

// --- public mirror API (called from UI mutation sites) -------------------------

export function mirrorTasks() {
  schedule("tasks", async () => {
    const res = await cloudUpsertTasks(
      (state.tasks || []).map((t) => ({
        ...t,
        updated: t.updated || Date.now(),
        created: t.created || t.updated || Date.now(),
      })),
    );
    if (res.error) throw res.error;
  });
}

export function deleteTaskEverywhere(id) {
  queueOutbox("tasks", id);
}

export function mirrorNotes(kind, list) {
  schedule(`notes:${kind}`, async () => {
    const res = await cloudUpsertNotes(kind, list);
    if (res.error) throw res.error;
  });
}

export function deleteNoteEverywhere(kind, id) {
  queueOutbox("notes", [kind, id]);
}

export function mirrorAssessment() {
  schedule("assessment", async () => {
    const res = await cloudSaveAssessment(state.techCheck);
    if (res.error) throw res.error;
  });
}

let usageDirty = false;
export function mirrorTechniqueUsage() {
  usageDirty = true;
  schedule(
    "usage",
    async () => {
      if (!usageDirty) return;
      usageDirty = false;
      const res = await cloudSaveTechniqueUsage(state.techUses, state.techTime);
      if (res.error) throw res.error;
    },
    5000,
  ); // usage counters are low-value: sync lazily
}

// --- pull + merge (login / refresh / reconnect) --------------------------------

const ts = (v) => new Date(v || 0).getTime();

function mergeById(localList, cloudList, readUpdated) {
  const byId = new Map(localList.map((item) => [item.id, item]));
  (cloudList || []).forEach((cloud) => {
    const local = byId.get(cloud.id);
    if (!local) {
      byId.set(cloud.id, cloud);
      return;
    }
    if (ts(readUpdated(cloud)) > ts(readUpdated(local)))
      byId.set(cloud.id, { ...local, ...cloud });
  });
  return [...byId.values()];
}

export async function pullProductivity() {
  if (!canSync()) return { ok: false, offline: true };
  let ok = true;
  setSyncStatus("tasks", "loading");
  try {
    const tasks = await cloudListTasks();
    if (tasks.error) throw tasks.error;
    state.tasks = mergeById(state.tasks || [], tasks.data || [], (t) => t.clientUpdatedAt || t.updated);
    save("sf-tasks", state.tasks);
    setSyncStatus("tasks", "saved");
  } catch {
    ok = false;
    setSyncStatus("tasks", "error");
  }
  setSyncStatus("notes", "loading");
  try {
    const notes = await cloudListNotes();
    if (notes.error) throw notes.error;
    const byKind = { cornell: [], feynman: [], mindmap: [] };
    (notes.data || []).forEach((n) => byKind[n.kind]?.push({ ...n.payload, id: n.id }));
    const merge = (localKey, kind) => {
      state[localKey] = mergeById(
        state[localKey] || [],
        byKind[kind],
        (n) => n.clientUpdatedAt || n.updated,
      );
      save(localKey === "cornellNotes" ? "sf-cornell" : localKey === "feynmanNotes" ? "sf-feynman" : "sf-mindmaps", state[localKey]);
    };
    merge("cornellNotes", "cornell");
    merge("feynmanNotes", "feynman");
    merge("mindmaps", "mindmap");
    setSyncStatus("notes", "saved");
  } catch {
    ok = false;
    setSyncStatus("notes", "error");
  }
  setSyncStatus("assessment", "loading");
  try {
    const a = await cloudGetAssessment();
    if (a.error) throw a.error;
    if (a.data) {
      const local = state.techCheck;
      const cloudDate = ts(a.data.takenAt);
      if (!local || ts(local.date) < cloudDate) {
        state.techCheck = {
          done: a.data.done,
          skipped: a.data.skipped,
          answers: a.data.answers,
          scores: a.data.scores,
          top: a.data.top,
          signals: a.data.signals,
          date: cloudDate || Date.now(),
        };
        save("sf-techcheck", state.techCheck);
      }
    }
    setSyncStatus("assessment", "saved");
  } catch {
    ok = false;
    setSyncStatus("assessment", "error");
  }
  try {
    const u = await cloudGetTechniqueUsage();
    if (u.error) throw u.error;
    const max = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
    state.techUses = { ...(u.data.uses || {}), ...(state.techUses || {}) };
    state.techTime = { ...(u.data.minutes || {}), ...(state.techTime || {}) };
    Object.keys(state.techUses || {}).forEach((k) => {
      state.techUses[k] = max(state.techUses[k], u.data.uses?.[k]);
    });
    Object.keys(state.techTime || {}).forEach((k) => {
      state.techTime[k] = max(state.techTime[k], u.data.minutes?.[k]);
    });
    save("sf-tech-uses", state.techUses || {});
    save("sf-tech-time", state.techTime || {});
  } catch {
    /* usage counters are best-effort */
  }
  scheduleFlush(); // push anything queued while offline
  return { ok };
}

// Full push of everything local (used on login when cloud is empty, and on
// reconnect) — upserts are idempotent so this can never duplicate rows.
export async function pushAllProductivity() {
  if (!canSync()) return;
  try {
    await cloudUpsertTasks(
      (state.tasks || []).map((t) => ({
        ...t,
        updated: t.updated || Date.now(),
        created: t.created || t.updated || Date.now(),
      })),
    );
  } catch {
    /* retried by the next mirror */
  }
  try {
    await cloudUpsertNotes("cornell", state.cornellNotes || []);
    await cloudUpsertNotes("feynman", state.feynmanNotes || []);
    await cloudUpsertNotes("mindmap", state.mindmaps || []);
  } catch {
    /* retried by the next mirror */
  }
  try {
    await cloudSaveAssessment(state.techCheck || { done: false, skipped: true, date: Date.now() });
    await cloudSaveTechniqueUsage(state.techUses, state.techTime);
  } catch {
    /* retried by the next mirror */
  }
}

export async function syncAll() {
  await pushAllProductivity();
  return pullProductivity();
}
