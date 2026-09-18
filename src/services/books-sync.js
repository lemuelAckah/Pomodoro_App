/* books-sync.js — Phase 6 cloud persistence for book metadata rows.
 *
 * Model mirrors music-sync.js: IndexedDB blobs + localStorage stay the
 * immediate store (offline-first UI unchanged); this layer mirrors metadata
 * rows to Supabase for signed-in users. Annotations (bookmarks/highlights/
 * notes/progress/favorites) write through directly at their action sites
 * (low frequency) with the same silent-safe discipline.
 *
 * - mirrorBooks(): ONE debounced upsert of the member's own book rows.
 * - deleteBookEverywhere(id): durable cloud delete (FK cascades clear the
 *   server-side favorites/progress/bookmarks/highlights/notes).
 * - pullBooks(): LWW merge by client_updated_at; local-only fields (fileKey,
 *   textContent, coverData, source, ownerId) are never overwritten; cloud
 *   rows unknown locally are added as metadata (audio downloads on open).
 * - All failures are silent-safe: local data is never erased.
 */

import { state, get, save, persist } from "../core.js";
import { backendConfigured } from "./backend.js";
import {
  cloudUpsertBooks,
  cloudListBooks,
  deleteBook,
} from "./backend.js";

const OUTBOX_KEY = "sf-book-outbox";
const outbox = get(OUTBOX_KEY, { books: [] });
let flushTimer = null;
const timers = {};
const inflight = {};

const online = () => navigator.onLine !== false;
const canSync = () => backendConfigured && state.user && online();

export const BOOK_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- outbox (durable deletes) ------------------------------------------------

function queueOutbox(id) {
  const list = outbox.books || (outbox.books = []);
  if (!list.includes(id)) list.push(id);
  save(OUTBOX_KEY, outbox);
  scheduleFlush();
}

async function flushOutbox() {
  if (!canSync()) return;
  const ids = outbox.books || [];
  if (!ids.length) return;
  outbox.books = [];
  save(OUTBOX_KEY, outbox);
  const results = await Promise.allSettled(ids.map((id) => deleteBook(id)));
  const stillDead = [];
  results.forEach((r, i) => {
    if (r.status === "rejected" || r.value?.error) stillDead.push(ids[i]);
  });
  if (stillDead.length) {
    outbox.books = [...(outbox.books || []), ...stillDead];
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
  syncBooks().catch(() => {});
});

// --- debounced mirror ----------------------------------------------------------

function schedule(dataset, fn, delay = 1500) {
  if (!canSync()) return; // offline: local persistence already happened
  clearTimeout(timers[dataset]);
  timers[dataset] = setTimeout(async () => {
    if (inflight[dataset]) return schedule(dataset, fn, 800);
    timers[dataset] = null;
    inflight[dataset] = true;
    try {
      await fn();
    } catch {
      /* best-effort; retried by the next mirror */
    } finally {
      inflight[dataset] = false;
    }
  }, delay);
}

// Only rows with server-compatible UUID ids sync (legacy text ids are
// re-keyed locally first — see migrateBookIds in books.js).
const syncableBooks = () =>
  (state.books || []).filter((b) => b && BOOK_UUID_RE.test(String(b.id || "")));

export function mirrorBooks() {
  schedule("books", async () => {
    const res = await cloudUpsertBooks(
      syncableBooks().map((b) => ({
        ...b,
        updatedAt: b.updatedAt || Date.now(),
      })),
    );
    if (res.error) throw res.error;
  });
}

export function deleteBookEverywhere(id) {
  if (BOOK_UUID_RE.test(String(id || ""))) queueOutbox(id);
}

export async function pullBooks(adopt) {
  if (!canSync()) return { ok: false, offline: true };
  try {
    const res = await cloudListBooks();
    if (res.error) throw res.error;
    const byId = new Map((state.books || []).filter(Boolean).map((b) => [b.id, b]));
    const pendingDelete = new Set(outbox.books || []);
    let changed = false;
    for (const cloud of res.data || []) {
      // Pending-delete rows must never resurrect: the outbox flush removes
      // them remotely right after this pull.
      if (pendingDelete.has(cloud.id)) continue;
      const local = byId.get(cloud.id);
      if (!local) {
        // Same file on another device? Adopt the cloud id instead of
        // duplicating the shelf (audio stays per-device).
        const twin = typeof adopt === "function" ? await adopt(cloud) : null;
        if (twin) {
          changed = true;
          continue;
        }
        byId.set(cloud.id, {
          ...cloud,
          ownerId: state.user.id,
          fileKey: cloud.id,
          coverData: "",
          textContent: "",
          source: "remote",
          updatedAt: Date.now(),
        });
        changed = true;
        continue;
      }
      const cloudTs = cloud.clientUpdatedAt ? new Date(cloud.clientUpdatedAt).getTime() : 0;
      if (cloudTs > Number(local.updatedAt || 0)) {
        byId.set(cloud.id, { ...local, ...cloud, fileKey: local.fileKey || local.id });
        changed = true;
      }
    }
    if (changed) {
      state.books = [...byId.values()];
      save("sf-books", state.books);
      persist();
    }
    scheduleFlush();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function pushAllBooks() {
  if (!canSync()) return;
  try {
    const res = await cloudUpsertBooks(
      syncableBooks().map((b) => ({ ...b, updatedAt: b.updatedAt || Date.now() })),
    );
    if (res.error) throw res.error;
  } catch {
    /* retried by the next mirror */
  }
}

export async function syncBooks(adopt) {
  await pushAllBooks();
  return pullBooks(adopt);
}
