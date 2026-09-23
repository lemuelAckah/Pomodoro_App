/* books.js — book library: catalog, upload, details, favorites, download, reports */
import {
  state, $, $$, esc, sicon, persist, notify, toast, confirmBox, viewHead, fitTextarea, requireAuth,
  save, paintBackendPill, registerBackendPillResolver, backendPillMarkup,
} from "./core.js";
import {
  backendConfigured, uploadBookFile, getBookFileUrl, downloadBookFile, removeBookFile,
  createBook, deleteBook, listMyBooks, getBook, cloudUpsertBook, probeBooksBackend,
  toggleBookFavorite as toggleBookFavoriteRemote, listBookFavorites, saveBookProgress, listBookProgress,
  listBookBookmarks, addBookBookmark, removeBookBookmark,
  listBookHighlights, addBookHighlight, updateBookHighlight, removeBookHighlight,
} from "./services/backend.js";
import { openReader, readerOpenId, repaintReader } from "./books-reader.js";
import { mirrorBooks, deleteBookEverywhere, pullBooks, BOOK_UUID_RE } from "./services/books-sync.js";
import { txtToMarkdown, mdToMarkdown, epubSectionsToMarkdown, sectionsToMarkdown, markdownToDocxBlob } from "./books-format.js";

export function newBookId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  // Fallback stays uuid-SHAPED so the id remains valid for books.id even
  // where crypto.randomUUID is unavailable (non-secure contexts).
  const h = () => Math.floor(Math.random() * 65536).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${[8, 9, "a", "b"][Math.floor(Math.random() * 4)]}${h().slice(1)}-${h()}${h()}${h()}`;
}

// Stable duplicate identity: filename can change, content rarely does, so the
// fingerprint hashes size + head/tail slices (fast, no full-file read). Two
// different books with identical bytes intentionally share it.
export async function bookFingerprintOf(file) {
  const size = Number(file?.size || 0);
  try {
    const parts = [];
    if (size > 0 && typeof file.slice === "function") {
      const n = 32768;
      parts.push(file.slice(0, Math.min(n, size)));
      if (size > n) parts.push(file.slice(Math.max(0, size - n), size));
    }
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    const mixStr = (str) => {
      for (let i = 0; i < str.length; i++) {
        h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 + str.charCodeAt(i), 2246822519) >>> 0;
      }
    };
    const mixBytes = (buf) => {
      const step = Math.max(1, Math.floor(buf.length / 4096));
      for (let i = 0; i < buf.length; i += step) {
        h1 = Math.imul(h1 ^ buf[i], 16777619) >>> 0;
        h2 = Math.imul(h2 + buf[i], 2246822519) >>> 0;
      }
    };
    mixStr(`size:${size}|type:${String(file?.type || "")}`);
    for (const part of parts) mixBytes(new Uint8Array(await part.arrayBuffer()));
    return `fp${size.toString(36)}${h1.toString(16)}${h2.toString(16)}`.slice(0, 160);
  } catch {
    return "";
  }
}

export function findDuplicateBook(file, fingerprint) {
  const fp = fingerprint || "";
  const nm = String(file?.name || "").toLowerCase();
  const sz = Number(file?.size || 0);
  return (state.books || []).find((b) => {
    if (!b) return false;
    if (fp && b.fingerprint && b.fingerprint === fp) return true;
    return nm && String(b.fileName || "").toLowerCase() === nm && Number(b.fileSize || 0) === sz && sz > 0;
  }) || null;
}

// Re-key one book (legacy text id → server-compatible UUID), moving its
// IndexedDB blobs and every local reference. Returns true on success;
// on any failure the old id stays untouched.
export async function rekeyBook(oldId, newId) {
  const book = (state.books || []).find((b) => b && b.id === oldId);
  if (!book || !newId || newId === oldId) return false;
  try {
    for (const kind of ["file:", "text:"]) {
      const blob = await bookBlobGet(kind + oldId);
      if (blob) {
        const ok = await bookBlobPut(kind + newId, blob);
        if (!ok) return false;
      }
    }
    for (const kind of ["file:", "text:"]) await bookBlobDelete(kind + oldId);
    book.id = newId;
    book.fileKey = newId;
    book.updatedAt = Date.now();
    const prog = { ...(state.bookProgress || {}) };
    if (oldId in prog) {
      prog[newId] = prog[oldId];
      delete prog[oldId];
      state.bookProgress = prog;
    }
    if (Array.isArray(state.bookFavorites)) {
      state.bookFavorites = state.bookFavorites.map((x) => (x === oldId ? newId : x));
    }
    const local = { ...(state.bookLocal || {}) };
    if (local[oldId]) {
      local[newId] = local[oldId];
      delete local[oldId];
      state.bookLocal = local;
    }
    if (Array.isArray(state.bookRecent)) {
      state.bookRecent = state.bookRecent.map((x) => (x === oldId ? newId : x));
    }
    const stats = state.bookStats && typeof state.bookStats === "object" ? state.bookStats : null;
    if (stats) {
      if (stats.opened && stats.opened[oldId]) {
        stats.opened[newId] = stats.opened[oldId];
        delete stats.opened[oldId];
      }
      if (Array.isArray(stats.completed)) stats.completed = stats.completed.map((x) => (x === oldId ? newId : x));
      save("sf-book-stats", stats);
    }
    persist();
    return true;
  } catch {
    return false;
  }
}

let bookIdsMigrated = false;
// One-time, guarded: legacy text ids can't sync (books.id is uuid), so move
// each legacy book to a fresh UUID. Never wipes: failures keep the old id.
export async function migrateBookIds() {
  if (bookIdsMigrated) return false;
  bookIdsMigrated = true;
  const legacy = (state.books || []).filter((b) => b && !BOOK_UUID_RE.test(String(b.id || "")));
  if (!legacy.length) return false;
  let moved = 0;
  for (const b of legacy) {
    let nid = null;
    try {
      nid = crypto?.randomUUID ? crypto.randomUUID() : null;
    } catch {
      nid = null;
    }
    if (!nid) break;
    if (await rekeyBook(b.id, nid)) moved++;
  }
  if (moved) {
    persist();
    mirrorBooks();
  }
  return moved > 0;
}

// Twin adoption for cloud pull: same file on another device (matched by
// fingerprint, else filename + size) takes the cloud id instead of
// duplicating the shelf. Only legacy (non-uuid) locals are eligible.
export async function adoptCloudTwin(cloud) {
  if (!cloud || !cloud.id) return null;
  const cfp = String(cloud.fingerprint || "");
  const cnm = String(cloud.fileName || "").toLowerCase();
  const csz = Number(cloud.fileSize || 0);
  const twin = (state.books || []).find((b) => {
    if (!b || BOOK_UUID_RE.test(String(b.id || ""))) return false;
    if (cfp && b.fingerprint && b.fingerprint === cfp) return true;
    return !!cnm && String(b.fileName || "").toLowerCase() === cnm && Number(b.fileSize || 0) === csz && csz > 0;
  });
  if (!twin) return null;
  const ok = await rekeyBook(twin.id, cloud.id);
  return ok ? (state.books || []).find((b) => b && b.id === cloud.id) || null : null;
}

// Boot/login entry: migrate legacy ids, then pull cloud rows (with twin
// adoption so two devices converge instead of duplicating).
export async function syncBooksLibrary() {
  try {
    await migrateBookIds();
  } catch {
    /* local library stands */
  }
  try {
    return await pullBooks(adoptCloudTwin);
  } catch {
    return { ok: false };
  }
}

export const BOOK_CATEGORIES = [
  { group: "Academic & Education", items: ["Engineering", "Telecommunication Engineering", "Electrical & Electronic Engineering", "Computer Science", "Mathematics", "Physics", "Chemistry", "Biology", "Medicine", "Economics", "Business", "Accounting", "Law", "Psychology", "Sociology", "History", "Geography"] },
  { group: "Technology", items: ["Programming", "Artificial Intelligence", "Machine Learning", "Data Science", "Cybersecurity", "Networking", "Software Engineering", "Web Development"] },
  { group: "General Reading", items: ["Fiction", "Novels", "Romance", "Mystery", "Science Fiction", "Biography", "Self-Development", "Personal Finance", "Leadership", "Religion", "Philosophy", "Health & Wellness"] },
];
export const BOOK_COLORS = ["yellow", "green", "blue", "pink", "purple"];
const ALL_CATEGORY_NAMES = BOOK_CATEGORIES.flatMap((g) => g.items);

// ---------- IndexedDB file store (blobs) ----------
let bookDbPromise = null;
function bookDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!bookDbPromise) {
    bookDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open("studyflow-books", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("files");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return bookDbPromise;
}
async function bookBlobPut(key, blob) {
  try {
    const db = await bookDb();
    if (!db) return false;
    await new Promise((res, rej) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(blob, key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}
async function bookBlobGet(key) {
  try {
    const db = await bookDb();
    if (!db) return null;
    const blob = await new Promise((res, rej) => {
      const tx = db.transaction("files", "readonly");
      const rq = tx.objectStore("files").get(key);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => rej(rq.error);
    });
    return blob;
  } catch {
    return null;
  }
}
async function bookBlobDelete(key) {
  try {
    const db = await bookDb();
    if (!db) return;
    await new Promise((res) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(true);
    });
  } catch {
    /* ignore */
  }
}

const bookUrlCache = new Map();
function bookObjectUrl(id, blob) {
  let url = bookUrlCache.get(id);
  if (!url) {
    url = URL.createObjectURL(blob);
    bookUrlCache.set(id, url);
    // Bound the cache: evict oldest first so opening many books never leaks.
    while (bookUrlCache.size > 5) {
      const oldest = bookUrlCache.keys().next().value;
      if (oldest === id) break;
      try { URL.revokeObjectURL(bookUrlCache.get(oldest)); } catch { /* ignore */ }
      bookUrlCache.delete(oldest);
    }
  }
  return url;
}
export function revokeBookUrl(id) {
  const url = bookUrlCache.get(id);
  if (!url) return;
  try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  bookUrlCache.delete(id);
}

function myUserKey() {
  return state.user?.id || state.deviceId || "local";
}
function isOwnBook(b) {
  if (!b) return false;
  return b.ownerId === myUserKey();
}
function canReadBook(b) {
  return isOwnBook(b);
}
function canDownloadBook(b) {
  return isOwnBook(b);
}
function bookProgressOf(id) {
  const p = Number((state.bookProgress || {})[id]);
  return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
}
function isBookFav(id) {
  return (state.bookFavorites || []).includes(id);
}
export function searchBooks(q) {
  const needle = String(q || "").trim().toLowerCase();
  const seen = new Set();
  return (state.books || []).filter((b) => {
    if (!b || seen.has(b.id)) return false;
    seen.add(b.id);
    if (!needle) return true;
    const hay = `${b.title || ""} ${b.author || ""} ${b.category || ""} ${(b.tags || []).join(" ")} ${b.isbn || ""} ${b.description || ""}`.toLowerCase();
    return hay.includes(needle);
  }).slice(0, 12);
}

// Books are private by design: only the uploader ever sees their uploads.
// (No public catalog, no discovery feed, no shared shelves.)
// --- Backend status pill -----------------------------------------------------
// Books live on this device; the cloud matters for sync (shelf, covers, file
// storage). Signed-out visitors get the honest "Local data" pill, signed-in
// users get a real reachability probe driven by the periodic shelf sync.
let booksBackendStatus = null; // ok | down | offline | null = probing
let booksBackendStatusAt = 0;
let booksProbing = false;

function booksPillInfo() {
  const s = !backendConfigured || !state.user ? "local" : booksBackendStatus || "probing";
  const cls = s;
  const label =
    s === "ok" ? "Live"
    : s === "down" ? "Backend error"
    : s === "offline" ? "Offline"
    : s === "local" ? "Local data"
    : "Connecting…";
  const title =
    s === "ok" ? "Your library is synced with the cloud — shelves, covers, and reading progress are live"
    : s === "down" ? "The server responded with an error — showing your local shelves. Cloud changes may be delayed."
    : s === "offline" ? "Can't reach the server — showing your local shelves. Cloud changes may be delayed. Check your connection."
    : s === "local" ? "Books are stored on this device. Sign in to sync your library, covers, and reading progress."
    : "Checking the backend…";
  return { cls, label, title, retryable: s !== "local" };
}
registerBackendPillResolver("books", booksPillInfo);

async function probeBooks(root) {
  if (!backendConfigured || !state.user) {
    booksBackendStatus = "local";
    paintBackendPill("books", root);
    return;
  }
  booksProbing = true;
  booksBackendStatus = null; // probing
  paintBackendPill("books", root);
  const res = await probeBooksBackend().catch((err) => ({ error: err }));
  const msg = String(res.error?.message || res.error || "");
  booksBackendStatus = res.error ? (/Failed to fetch|network|NetworkError/i.test(msg) ? "offline" : "down") : "ok";
  booksBackendStatusAt = Date.now();
  booksProbing = false;
  paintBackendPill("books", root);
}

async function syncMyBooksFromBackend() {
  if (!backendConfigured || !state.user) return false;
  const before = libSignature();
  try {
    const [mine, favs, prog] = await Promise.all([listMyBooks(), listBookFavorites(), listBookProgress()]);
    // Report the real outcome for the Library pill: any of the three requests
    // failing means the cloud shelf state is stale this round.
    booksBackendStatus = mine.error || favs.error || prog.error
      ? (/Failed to fetch|network|NetworkError/i.test(String(mine.error?.message || favs.error?.message || prog.error?.message || "")) ? "offline" : "down")
      : "ok";
    booksBackendStatusAt = Date.now();
    if (!mine.error && Array.isArray(mine.data)) {
      const remote = mine.data.map((r) => ({
        id: r.id, ownerId: r.owner_id, title: r.title, author: r.author,
        description: r.description, category: r.category, tags: r.tags || [],
        isbn: r.isbn || "", publisher: r.publisher || "", year: r.published_year ?? null,
        pageCount: r.page_count ?? null, wordCount: r.word_count ?? null,
        coverPath: r.cover_path || "", coverData: "",
        filePath: r.file_path || "", fileType: r.file_type || "", fileSize: r.file_size || 0,
        textContent: "", visibility: r.visibility, allowDownload: Boolean(r.allow_download),
        source: "upload", createdAt: new Date(r.created_at).getTime() || Date.now(),
      }));
      const localOnly = (state.books || []).filter((b) => b.source !== "remote" && !remote.some((r) => r.id === b.id));
      state.books = [...remote, ...localOnly];
    }
    if (!favs.error && Array.isArray(favs.data)) {
      const remoteIds = favs.data.map((f) => f.book_id);
      state.bookFavorites = [...new Set([...(state.bookFavorites || []), ...remoteIds])];
    }
    if (!prog.error && Array.isArray(prog.data)) {
      const merged = { ...(state.bookProgress || {}) };
      for (const p of prog.data) merged[p.book_id] = Math.max(Number(merged[p.book_id]) || 0, Number(p.position) || 0);
      state.bookProgress = merged;
    }
    persist();
    return libSignature() !== before;
  } catch {
    /* offline — local data stands */
    booksBackendStatus = "offline";
    booksBackendStatusAt = Date.now();
    return false;
  }
}
async function pushBookRow(book) {
  if (!backendConfigured || !state.user) return;
  try {
    // Upsert (not update): offline-first books may never have a remote row.
    await cloudUpsertBook(book);
  } catch {
    /* local copy is authoritative for UX */
  }
}

// ---------- file helpers ----------
export async function getBookBlob(book) {
  if (!book) return null;
  const key = book.fileKey || book.id;
  const local = await bookBlobGet("file:" + key);
  if (local) return local;
  if (backendConfigured && book.filePath) {
    try {
      const { data, error } = await downloadBookFile(book.filePath);
      if (!error && data) {
        await bookBlobPut("file:" + book.id, data);
        return data;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}
export async function getBookText(book) {
  if (book.textContent) return book.textContent;
  const blob = await getBookBlob(book);
  if (!blob) return "";
  try {
    const text = await blob.text();
    const nm = `${book.fileName || ""} ${book.fileType || ""}`;
    if (/text|markdown|\.txt|\.md/i.test(nm)) return text;
    return "";
  } catch {
    return "";
  }
}
function estimatePdfPages(blob) {
  // Read only the head: page markers live near the start, and pulling a full
  // 50 MB file into a JS string would jank or crash the tab.
  const probe = typeof blob.slice === "function" ? blob.slice(0, 2 * 1024 * 1024) : blob;
  return probe.text().then((t) => {
    try {
      const m = t.match(/\/Type\s*\/Page[^s]/g);
      return m ? m.length : null;
    } catch {
      return null;
    }
  }).catch(() => null);
}
function coverUrl(book) {
  if (book.coverData) return book.coverData;
  return coverSignedUrl(book.coverPath);
}
function monogram(title) {
  const words = String(title || "?").trim().split(/\s+/).slice(0, 2);
  return words.map((w) => (w[0] || "?").toUpperCase()).join("");
}

let bookHome = { q: "", cat: "All", filter: "all", page: 0 };
const BOOK_PAGE_SIZE = 24;
const BOOK_FILTERS = [
  ["all", "All"],
  ["favorites", "Favorites"],
  ["reading", "Reading"],
  ["completed", "Completed"],
  ["recent", "Recent"],
];
// Re-render guards: bookView starts unset, so post-fetch .then chains must only
// repaint when fresh data actually arrived — otherwise they re-render forever
// (infinite microtask loop) and freeze the page.
let libCoversRunning = false;
let libMineSyncedAt = 0;
// One-time cleanup: drop the old demo/seed books from existing localStorage.
function purgeLegacySeedBooks() {
  const keep = (state.books || []).filter((b) => b && b.source !== "seed" && b.ownerId !== "seed" && !String(b.id || "").startsWith("seed-"));
  if (keep.length !== (state.books || []).length) {
    state.books = keep;
    persist();
  }
}
function libOnHome() {
  const v = state.bookView || {};
  return !v.name || v.name === "home";
}
function libSignature() {
  return `${(state.books || []).length}|${(state.bookFavorites || []).length}|${Object.keys(state.bookProgress || {}).length}`;
}
function libFiltering() {
  return bookHome.filter !== "all" || !!bookHome.q || bookHome.cat !== "All";
}
const coverSignedCache = new Map(); // path -> { url, exp }
// Signed URLs live 24h server-side: cache them for 20h (no repeated
// downloads) and cap the map (bounded memory even at 300 books).
const COVER_URL_TTL_MS = 20 * 3600 * 1000;
const COVER_CACHE_MAX = 60;
function coverSignedUrl(path) {
  const hit = path ? coverSignedCache.get(path) : null;
  if (!hit) return "";
  if (hit.exp <= Date.now()) {
    coverSignedCache.delete(path);
    return "";
  }
  return hit.url;
}

async function resolveCovers(books) {
  if (!backendConfigured) return false;
  let changed = false;
  const now = Date.now();
  await Promise.all((books || []).map(async (b) => {
    if (!b.coverPath || b.coverData || coverSignedUrl(b.coverPath)) return;
    try {
      const { data, error } = await getBookFileUrl(b.coverPath, 86400);
      const url = !error && data ? data.signedUrl || data.signedURL : "";
      if (url) {
        if (coverSignedCache.size >= COVER_CACHE_MAX) {
          coverSignedCache.delete(coverSignedCache.keys().next().value);
        }
        coverSignedCache.set(b.coverPath, { url, exp: now + COVER_URL_TTL_MS });
        changed = true;
      }
    } catch {
      /* offline */
    }
  }));
  return changed;
}
function coverImg(book, cls) {
  const url = coverUrl(book);
  if (url) return `<img class="${cls || ""}" src="${url}" alt="Cover of ${esc(book.title)}" loading="lazy">`;
  return `<span class="book-mono ${cls || ""}" aria-hidden="true">${esc(monogram(book.title))}</span>`;
}
function allBooks() {
  const seen = new Set();
  return (state.books || []).filter((b) => {
    if (!b || seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}
function bookProgressPct(id) {
  return Math.round(bookProgressOf(id) * 100);
}
function bookCard(b) {
  const pct = bookProgressPct(b.id);
  const fav = isBookFav(b.id);
  return `<article class="book-card"><button type="button" class="book-cover" data-book-open="${b.id}" title="Open ${esc(b.title)}">${coverImg(b)}${pct > 0 ? `<span class="book-progressbar"><i style="width:${pct}%"></i></span>` : ""}</button><div class="book-meta"><strong>${esc(b.title)}</strong><small>${esc(b.author || "Unknown author")}</small><span class="tag">${esc(b.category || "General")}</span></div><div class="book-actions"><button type="button" class="ghost" data-book-open="${b.id}">${pct > 0 && pct < 100 ? "Continue" : "Read"}</button><button type="button" class="icon-btn book-fav${fav ? " on" : ""}" data-book-fav="${b.id}" title="${fav ? "Remove favorite" : "Add favorite"}" aria-label="Favorite" aria-pressed="${fav}">${sicon("star")}</button><button class="ghost book-menu-btn" data-book-menu="${b.id}" title="More actions" aria-label="More actions for ${esc(b.title)}" aria-haspopup="menu" type="button">⋯</button></div></article>`;
}

function readingStatsStrip() {
  const books = allBooks();
  const stats = bookStatsOf();
  const done = books.filter((b) => isBookCompleted(b.id)).length;
  const mins = Math.round((Number(stats.seconds) || 0) / 60);
  const hrs = Math.floor(mins / 60);
  const time = hrs ? `${hrs}h ${mins % 60}m` : `${mins}m`;
  return `<div class="card book-stats"><div><strong>${books.length}</strong><span>books</span></div><div><strong>${done}</strong><span>finished</span></div><div><strong>${time}</strong><span>reading</span></div><div><strong>${Number(stats.pages) || 0}</strong><span>pages</span></div></div>`;
}

function categorySelect(selected, books) {
  const cats = [...new Set((books || []).map((b) => b.category || "General"))].sort((a, b) => a.localeCompare(b));
  return `<select class="select" id="book-cat" aria-label="Filter by category"><option value="All">All categories</option>${cats.map((c) => `<option value="${esc(c)}"${c === selected ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
}
function bookStatsOf() {
  const s = state.bookStats && typeof state.bookStats === "object" ? state.bookStats : {};
  if (!s.opened || typeof s.opened !== "object") s.opened = {};
  if (!s.lastOpened || typeof s.lastOpened !== "object") s.lastOpened = {};
  if (!Array.isArray(s.completed)) s.completed = [];
  if (!Number.isFinite(+s.seconds)) s.seconds = 0;
  if (!Number.isFinite(+s.pages)) s.pages = 0;
  state.bookStats = s;
  return s;
}

export function recordBookOpen(id) {
  const stats = bookStatsOf();
  stats.opened[id] = (Number(stats.opened[id]) || 0) + 1;
  stats.lastOpened[id] = Date.now();
  state.bookRecent = [id, ...(state.bookRecent || []).filter((x) => x !== id)].slice(0, 12);
  persist();
}

export function recordBookTime(id, seconds, pages) {
  if (!id) return;
  const stats = bookStatsOf();
  stats.seconds = (Number(stats.seconds) || 0) + Math.max(0, Math.round(Number(seconds) || 0));
  if (Number(pages) > 0) stats.pages = (Number(stats.pages) || 0) + Math.round(Number(pages));
  persist();
}

export function markBookCompleted(id, done = true) {
  const stats = bookStatsOf();
  const has = stats.completed.includes(id);
  if (done && !has) stats.completed.push(id);
  if (!done && has) stats.completed = stats.completed.filter((x) => x !== id);
  if (done) {
    state.bookProgress = { ...(state.bookProgress || {}), [id]: 1 };
    if (backendConfigured && state.user) saveBookProgress(id, 1).catch(() => {});
  } else if (bookProgressOf(id) >= 0.995) {
    // Reopening must be visible: progress alone would still read "finished".
    state.bookProgress = { ...(state.bookProgress || {}), [id]: 0.99 };
    if (backendConfigured && state.user) saveBookProgress(id, 0.99).catch(() => {});
  }
  persist();
}

export function isBookCompleted(id) {
  const stats = bookStatsOf();
  if (stats.completed.includes(id)) return true;
  return bookProgressOf(id) >= 0.995;
}

function bookRowMatches(b, q, cat, filter) {
  if (filter === "favorites" && !isBookFav(b.id)) return false;
  if (filter === "reading") {
    const p = bookProgressOf(b.id);
    if (!(p > 0 && p < 0.995)) return false;
  }
  if (filter === "completed" && !isBookCompleted(b.id)) return false;
  if (filter === "recent" && !(state.bookRecent || []).includes(b.id)) return false;
  if (cat && cat !== "All" && (b.category || "General") !== cat) return false;
  if (!q) return true;
  const hay = `${b.title || ""} ${b.author || ""} ${b.category || ""} ${(b.tags || []).join(" ")} ${b.isbn || ""} ${b.description || ""}`.toLowerCase();
  return hay.includes(q);
}
export function renderLibrary() {
  const t = $("#tab-books");
  if (!t) return;
  closeBookMenu();
  try {
    purgeLegacySeedBooks();
    const view = state.bookView || { name: "home" };
    if (view.name === "details") return renderBookDetails(t, view.id);
    if (view.name === "reader") {
      // render() wipes #tab-books on every nav; repaint a live reader in place,
      // only paying for a full re-open when it isn't already loaded.
      if (readerOpenId() === view.id) repaintReader();
      else openReader(view.id);
      return;
    }
    renderLibraryHome(t);
  } catch (err) {
    paintLibError(t, err);
  }
}
function paintLibError(t, err) {
  console.error("[studyflow] book library failed:", err);
  t.innerHTML = `${viewHead("Book Library", "Your personal shelves — upload, discover, read, and study.")}<div class="card empty-state"><div class="emoji">${sicon("bookOpen")}</div><h3>Book Library hit a snag</h3><p class="muted">${esc(err?.message || "Something went wrong loading your shelves. Your books are safe.")}</p><button type="button" class="primary" data-lib-retry>Try again</button></div>`;
  $("[data-lib-retry]", t).onclick = () => renderLibrary();
}
function renderLibraryHome(t) {
  const books = allBooks();
  booksProbing = false;
  const lastOpened = (state.bookStats && state.bookStats.lastOpened) || {};
  const byRecentOpen = (a, b) => (Number(lastOpened[b.id]) || 0) - (Number(lastOpened[a.id]) || 0);
  const started = books.filter((b) => { const p = bookProgressOf(b.id); return p > 0 && p < 0.995; }).sort(byRecentOpen);
  const finished = books.filter((b) => isBookCompleted(b.id)).sort(byRecentOpen);
  const favs = books.filter((b) => isBookFav(b.id));
  const recent = [...books].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
  const filtering = bookHome.filter !== "all" || bookHome.q || bookHome.cat !== "All";
  t.innerHTML = `${viewHead("Book Library", "Your personal shelves — upload, discover, read, and study.")}
  <div class="backend-pill-head">${backendPillMarkup("books")}</div>
  <div class="card" style="margin-bottom:18px"><div class="input-row" style="margin-bottom:0"><input class="input" id="book-search" placeholder="Search title, author, category, ISBN…" aria-label="Search books" value="${esc(bookHome.q)}"><button type="button" class="primary" data-book-upload>Upload Book</button></div>
  <div class="filter-bar" style="margin:12px 0 0">${BOOK_FILTERS.map(([v, label]) => `<button type="button" class="filter ${bookHome.filter === v ? "active" : ""}" data-book-filter="${v}">${label}</button>`).join("")}</div>
  <div class="book-catrow">${categorySelect(bookHome.cat, books)}</div></div>
  ${readingStatsStrip()}
  <div id="book-results"></div>
  ${!books.length && !filtering ? `<div class="card empty-state"><div class="emoji">${sicon("bookOpen")}</div><h3>Your library is empty</h3><p class="muted">Import your first book to start reading.</p><button type="button" class="primary" data-book-upload>Import a Book</button></div>` : ""}
  ${filtering ? "" : `${started.length ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Continue Reading</h2><span class="tag">${started.length}</span></div><div class="book-grid">${started.slice(0, 6).map(safeBookCard).join("")}</div></div>` : ""}
  ${finished.length ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Completed</h2><span class="tag">${finished.length}</span></div><div class="book-grid">${finished.slice(0, 6).map(safeBookCard).join("")}</div></div>` : ""}
  ${favs.length ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>My Favorites</h2><span class="tag">${favs.length}</span></div><div class="book-grid">${favs.slice(0, 6).map(safeBookCard).join("")}</div></div>` : ""}
  ${recent.length ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Recently Added</h2><span class="tag">yours</span></div><div class="book-grid">${recent.map(safeBookCard).join("")}</div></div>` : ""}`}`;
  renderBookResults();
  paintBackendPill("books", t);
  t.querySelector('[data-backend-retry][data-backend-status="books"]')?.addEventListener("click", async () => {
    if (!backendConfigured || !state.user) return; // local pill has nothing to retry
    await probeBooks(t);
  });
  if (!booksProbing && Date.now() - booksBackendStatusAt > 60000) probeBooks(t);
  const input = $("#book-search", t);
  let searchT = null;
  input.oninput = () => {
    clearTimeout(searchT);
    searchT = setTimeout(() => {
      const wasFiltering = libFiltering();
      bookHome.q = input.value.trim().toLowerCase();
      bookHome.page = 0;
      if (wasFiltering === libFiltering()) {
        renderBookResults(); // targeted: the input itself survives typing
      } else {
        // Sections appear/disappear — full rebuild, then hand focus back.
        renderLibraryHome(t);
        const si = $("#book-search", t);
        if (si) {
          si.focus();
          try { si.setSelectionRange(si.value.length, si.value.length); } catch { /* ignore */ }
        }
      }
    }, 150);
  };
  $$("[data-book-filter]", t).forEach((b) => (b.onclick = () => {
    bookHome.filter = b.dataset.bookFilter;
    bookHome.page = 0;
    renderLibrary();
  }));
  const catSel = $("#book-cat", t);
  if (catSel) catSel.onchange = () => {
    bookHome.cat = catSel.value;
    bookHome.page = 0;
    renderLibrary();
  };
  $$("[data-book-upload]", t).forEach((b) => (b.onclick = openUploadBook));
  bindBookCards(t);
  // Post-fetch repaints below are token-guarded: repaint ONLY when fresh data
  // arrived, otherwise each paint schedules another paint forever (freeze).
  if (!libCoversRunning) {
    libCoversRunning = true;
    resolveCovers(books.slice(0, 60)).then((changed) => {
      libCoversRunning = false;
      if (changed && state.tab === "books" && libOnHome()) renderLibrary();
    }).catch(() => { libCoversRunning = false; });
  }
  if (backendConfigured && state.user && Date.now() - libMineSyncedAt > 60000) {
    libMineSyncedAt = Date.now();
    syncMyBooksFromBackend().then((changed) => {
      if (changed && state.tab === "books" && libOnHome()) renderLibrary();
      paintBackendPill("books", $("#tab-books"));
    }).catch(() => {});
  }
}
function safeBookCard(b) {
  try {
    if (!b || typeof b !== "object" || !b.id) throw new Error("bad entry");
    return bookCard(b);
  } catch (err) {
    console.warn("[studyflow] skipping corrupt book entry:", err);
    return `<article class="book-card"><div class="book-cover" style="cursor:default"><span class="book-mono">?</span></div><div class="book-meta"><strong>Unreadable book</strong><small>This entry could not be displayed</small></div></article>`;
  }
}
function renderBookResults() {
  const box = $("#book-results");
  if (!box) return;
  const filtering = libFiltering();
  if (!filtering) {
    // Home sections render below instead.
    box.innerHTML = "";
    return;
  }
  let list = [];
  try {
    list = allBooks().filter((b) => bookRowMatches(b, bookHome.q, bookHome.cat, bookHome.filter));
    if (bookHome.filter === "recent") {
      const order = new Map((state.bookRecent || []).map((id, i) => [id, i]));
      list.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
    }
  } catch (err) {
    console.error("[studyflow] book filter failed:", err);
  }
  if (!list.length) {
    box.innerHTML = `<div class="card empty-state"><div class="emoji">${sicon("bookOpen")}</div><h3>No books found</h3><p class="muted">Try searching with another title, author, or keyword.</p></div>`;
    return;
  }
  // Paginate: metadata renders first, covers resolve lazily, content loads on open.
  const shown = list.slice(0, (bookHome.page + 1) * BOOK_PAGE_SIZE);
  const rest = list.length - shown.length;
  const filterLabel = bookHome.filter === "all" ? null : BOOK_FILTERS.find(([v]) => v === bookHome.filter)?.[1];
  const title = filterLabel || (bookHome.q || bookHome.cat !== "All" ? "Results" : "All Books");
  box.innerHTML = `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>${title}</h2><span class="tag">${list.length}</span></div><div class="book-grid">${shown.map(safeBookCard).join("")}</div>${rest > 0 ? `<div style="margin-top:12px;text-align:center"><button type="button" class="ghost" data-book-more>Show more (${rest} remaining)</button></div>` : ""}</div>`;
  bindBookCards(box);
  const more = $("[data-book-more]", box);
  if (more) more.onclick = () => {
    bookHome.page += 1;
    renderBookResults();
    resolveCovers(list.slice(0, (bookHome.page + 1) * BOOK_PAGE_SIZE)).then((changed) => {
      if (changed) renderBookResults();
    }).catch(() => {});
  };
}
function bindBookCards(root) {
  $$("[data-book-open]", root).forEach((b) => (b.onclick = () => openBookDetails(b.dataset.bookOpen)));
  $$("[data-book-fav]", root).forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    toggleBookFavorite(b.dataset.bookFav);
  }));
  $$("[data-book-menu]", root).forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    openBookMenu(b.dataset.bookMenu, b);
  }));
}

function closeBookMenu() {
  document.querySelectorAll(".book-menu-pop").forEach((m) => m.remove());
  document.removeEventListener("pointerdown", closeBookMenuOutside, true);
  document.removeEventListener("keydown", closeBookMenuKeys, true);
}

function closeBookMenuOutside(e) {
  if (!e.target.closest?.(".book-menu-pop") && !e.target.closest?.("[data-book-menu]")) {
    closeBookMenu();
  }
}

function closeBookMenuKeys(e) {
  if (e.key === "Escape") closeBookMenu();
}

function openBookMenu(id, anchor) {
  closeBookMenu();
  const book = findBook(id);
  if (!book) return;
  const pct = bookProgressPct(id);
  const fav = isBookFav(id);
  const pop = document.createElement("div");
  pop.className = "book-menu-pop";
  pop.setAttribute("role", "menu");
  const item = (action, icon, label) =>
    `<button type="button" class="book-menu-item" data-book-act="${action}" role="menuitem">${sicon(icon)}<span>${label}</span></button>`;
  pop.innerHTML =
    item("open", "bookOpen", pct > 0 && pct < 100 ? "Continue Reading" : "Open")
    + item("details", "doc", "View Details")
    + item("fav", "star", fav ? "Remove Favorite" : "Add to Favorites")
    + (isOwnBook(book) ? item("edit", "memo", "Edit Details") : "")
    + (canDownloadBook(book) ? item("download", "download", "Download") : "")
    + (isOwnBook(book) ? item("delete", "trash", "Delete") : "");
  document.body.append(pop);
  try {
    const r = anchor.getBoundingClientRect();
    const w = 220;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
    pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 12, r.bottom + 6) + "px";
  } catch {
    /* falls back to CSS default position */
  }
  document.addEventListener("pointerdown", closeBookMenuOutside, true);
  document.addEventListener("keydown", closeBookMenuKeys, true);
  pop.onclick = (e) => {
    const btn = e.target.closest?.("[data-book-act]");
    if (!btn) return;
    const act = btn.dataset.bookAct;
    closeBookMenu();
    if (act === "open") openReader(id);
    else if (act === "details") openBookDetails(id);
    else if (act === "fav") toggleBookFavorite(id);
    else if (act === "edit") openEditBook(id);
    else if (act === "download") openExportSheet(id, anchor);
    else if (act === "delete") askDeleteBook(id);
  };
  pop.querySelector(".book-menu-item")?.focus();
}
export async function toggleBookFavorite(id) {
  const favs = new Set(state.bookFavorites || []);
  const on = !favs.has(id);
  if (on) favs.add(id);
  else favs.delete(id);
  state.bookFavorites = [...favs];
  persist();
  if (backendConfigured && state.user) {
    try {
      const { error } = await toggleBookFavoriteRemote(id, on);
      if (error) toast("Favorite saved on this device; will sync when connected");
    } catch {
      toast("Favorite saved on this device; will sync when connected");
    }
  }
  renderLibrary();
  notify(on ? "Added to favorites" : "Removed from favorites");
}

function findBook(id) {
  return allBooks().find((b) => b && b.id === id) || null;
}
async function renderBookDetails(t, id) {
  let book = findBook(id);
  if (!book && backendConfigured) {
    try {
      const me = state.user?.id || null;
      const { data, error } = await getBook(id, me);
      if (!error && data) {
        book = {
          id: data.id, ownerId: data.owner_id, title: data.title, author: data.author,
          description: data.description, category: data.category, tags: data.tags || [],
          isbn: data.isbn || "", publisher: data.publisher || "", year: data.published_year ?? null,
          pageCount: data.page_count ?? null, wordCount: data.word_count ?? null,
          coverPath: data.cover_path || "", coverData: "", filePath: data.file_path || "",
          fileType: data.file_type || "", fileSize: data.file_size || 0, textContent: "",
          visibility: data.visibility, allowDownload: Boolean(data.allow_download),
          source: "remote", createdAt: new Date(data.created_at).getTime() || Date.now(),
        };
        state.books = [book, ...(state.books || [])];
      }
    } catch {
      /* offline */
    }
  }
  if (!book || !canReadBook(book)) {
    t.innerHTML = `${viewHead("Book Library", "Your personal shelves.")}<div class="card empty-state"><div class="emoji">${sicon("lock")}</div><h3>Book unavailable</h3><p class="muted">It may have been removed or is private.</p><button type="button" class="primary" data-book-home>Back to library</button></div>`;
    $("[data-book-home]", t).onclick = () => {
      state.bookView = { name: "home" };
      persist();
      renderLibrary();
    };
    return;
  }
  const pct = bookProgressPct(book.id);
  const fav = isBookFav(book.id);
  const own = isOwnBook(book);
  const canDl = canDownloadBook(book);
  const done = isBookCompleted(book.id);
  const stats = bookStatsOf();
  const lastOpened = stats.lastOpened?.[book.id] || null;
  t.innerHTML = `${viewHead("Book Library", "Your personal shelves.")}
  <button type="button" class="ghost" data-book-home style="margin-bottom:14px">← All books</button>
  <div class="card"><div class="book-detail">
    <div class="book-cover-lg">${coverImg(book)}</div>
    <div class="book-detail-main">
      <div class="eyebrow">${esc(book.category || "General")}</div>
      <h2>${esc(book.title)}</h2>
      <p class="muted">by ${esc(book.author || "Unknown author")}</p>
      ${pct > 0 ? `<div class="tc-bar-row"><div class="tc-bar"><i style="width:${pct}%"></i></div><strong>${pct}%</strong></div>` : ""}
      <p>${esc(book.description || "No description yet.")}</p>
      <div class="book-facts">
        ${book.pageCount ? `<span class="tag">${book.pageCount} pages</span>` : ""}
        ${book.wordCount ? `<span class="tag">${book.wordCount.toLocaleString()} words</span>` : ""}
        ${book.year ? `<span class="tag">${book.year}</span>` : ""}
        ${book.publisher ? `<span class="tag">${esc(book.publisher)}</span>` : ""}
        ${book.isbn ? `<span class="tag">ISBN ${esc(book.isbn)}</span>` : ""}
        ${own ? `<span class="tag">private</span>` : ""}
      </div>
      ${(book.tags || []).length ? `<p class="muted">Tags: ${(book.tags || []).map((x) => `#${esc(x)}`).join(" ")}</p>` : ""}
      ${lastOpened ? `<p class="muted">Last opened ${new Date(lastOpened).toLocaleDateString()}${done ? " · Finished" : ""}</p>` : ""}
      <div class="book-detail-actions">
        <button type="button" class="primary" data-book-read="${book.id}">${pct > 0 && pct < 100 ? "Continue Reading" : "Read Now"}</button>
        ${pct > 0 ? `<button type="button" class="ghost" data-book-restart="${book.id}">Start Over</button>` : ""}
        ${canDl ? `<button type="button" class="ghost" data-book-dl="${book.id}">${sicon("download")} Download</button>` : ""}
        <button type="button" class="ghost" data-book-fav="${book.id}">${sicon("star")} ${fav ? "Favorited" : "Favorite"}</button>
        <button type="button" class="ghost" data-book-finish="${book.id}">${done ? "Reopen (unfinish)" : "Mark Finished"}</button>
        ${own ? `<button type="button" class="ghost" data-book-edit="${book.id}">Edit</button><button type="button" class="danger-button" data-book-delete="${book.id}">Delete</button>` : ""}
      </div>
    </div>
  </div></div>`;
  $("[data-book-home]", t).onclick = () => {
    state.bookView = { name: "home" };
    persist();
    renderLibrary();
  };
  const readBtn = $("[data-book-read]", t);
  if (readBtn) readBtn.onclick = () => openReader(book.id);
  const restartBtn = $("[data-book-restart]", t);
  if (restartBtn) restartBtn.onclick = () => openReader(book.id, { fromStart: true });
  const finishBtn = $("[data-book-finish]", t);
  if (finishBtn) finishBtn.onclick = () => {
    const nowDone = !isBookCompleted(book.id);
    markBookCompleted(book.id, nowDone);
    if (nowDone) notify("Book marked as finished");
    renderLibrary();
  };
  const favBtn = $("[data-book-fav]", t);
  if (favBtn) favBtn.onclick = () => toggleBookFavorite(book.id);
  const dlBtn = $("[data-book-dl]", t);
  if (dlBtn) dlBtn.onclick = () => openExportSheet(book, dlBtn);
  const editBtn = $("[data-book-edit]", t);
  if (editBtn) editBtn.onclick = () => openEditBook(book.id);
  const delBtn = $("[data-book-delete]", t);
  if (delBtn) delBtn.onclick = () => askDeleteBook(book.id);
  if (book.coverPath && !book.coverData && !coverSignedUrl(book.coverPath)) {
    resolveCovers([book]).then((changed) => {
      if (changed && state.tab === "books" && state.bookView?.name === "details" && state.bookView?.id === book.id)
        renderBookDetails(t, book.id);
    });
  }
}

const BOOK_EXTS = [".txt", ".md", ".markdown", ".pdf", ".epub"];
const BOOK_MAX_BYTES = 50 * 1024 * 1024;
function bookKindOf(name, type) {
  const n = String(name || "").toLowerCase();
  if (n.endsWith(".pdf") || (type || "").includes("pdf")) return "pdf";
  if (n.endsWith(".epub") || (type || "").includes("epub")) return "epub";
  if (n.endsWith(".md") || n.endsWith(".markdown")) return "md";
  return "txt";
}
function cleanFileTitle(name) {
  return String(name || "Untitled")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .slice(0, 120) || "Untitled";
}
function categoryOptions(selected) {
  const opts = [`<option value="">Choose a category…</option>`];
  for (const g of BOOK_CATEGORIES) {
    opts.push(`<optgroup label="${esc(g.group)}">${g.items.map((c) => `<option value="${esc(c)}"${c === selected ? " selected" : ""}>${esc(c)}</option>`).join("")}</optgroup>`);
  }
  if (selected && !ALL_CATEGORY_NAMES.includes(selected))
    opts.push(`<option value="${esc(selected)}" selected>${esc(selected)} (custom)</option>`);
  return opts.join("");
}
// Dressed-up cover picker: gradient art tile with live thumbnail, a Browse
// pill and a filename line. The plain file input stays hidden — saves read
// `[data-*-cover]` untouched, so upload/edit flows keep working as before.
function coverPickerMarkup(inputAttr, currentSrc) {
  return `<button type="button" class="cover-pick${currentSrc ? " has-cover" : ""}" data-coverbtn="${inputAttr}" aria-label="Choose a cover image"><span class="cover-pick-art" data-coverart="${inputAttr}">${currentSrc ? `<img src="${currentSrc}" alt="Current cover">` : sicon("camera")}</span><span class="cover-pick-txt"><strong>Choose cover</strong><small>JPG · PNG · WEBP — under 8 MB · or drop a file here</small></span><span class="cover-pick-go">Browse</span></button><input type="file" ${inputAttr} accept="image/*" hidden><div class="cover-pick-name" data-covername="${inputAttr}">${currentSrc ? "Current cover — pick a file to replace it" : "No cover chosen yet"}</div>`;
}

function bindCoverPicker(modal, inputAttr) {
  const input = modal.querySelector(`[${inputAttr}]`);
  const btn = modal.querySelector(`[data-coverbtn="${inputAttr}"]`);
  const art = modal.querySelector(`[data-coverart="${inputAttr}"]`);
  const nameEl = modal.querySelector(`[data-covername="${inputAttr}"]`);
  if (!input || !btn) return;
  const paint = (src, name) => {
    if (src && art) {
      art.innerHTML = `<img src="${src}" alt="Cover preview">`;
      btn.classList.add("has-cover");
    }
    if (nameEl && name) nameEl.textContent = name;
  };
  const take = (f) => {
    if (!f) return;
    if (!String(f.type || "").startsWith("image/")) {
      notify("Cover must be an image file");
      try { input.value = ""; } catch { /* ignore */ }
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      notify("Cover must be under 8 MB");
      try { input.value = ""; } catch { /* ignore */ }
      return;
    }
    const rd = new FileReader();
    rd.onload = () => paint(rd.result, `${f.name} • looking sharp`);
    try {
      rd.readAsDataURL(f);
    } catch {
      if (nameEl) nameEl.textContent = `${f.name} • ready`;
      btn.classList.add("has-cover");
    }
  };
  btn.onclick = () => input.click();
  input.onchange = () => take(input.files[0] || null);
  ["dragenter", "dragover"].forEach((ev) =>
    btn.addEventListener(ev, (e) => {
      e.preventDefault();
      btn.classList.add("dragging");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    btn.addEventListener(ev, (e) => {
      e.preventDefault();
      btn.classList.remove("dragging");
    }),
  );
  btn.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    try {
      input.files = e.dataTransfer.files;
    } catch {
      /* some browsers lock the file list — preview still works */
    }
    take(f);
  });
}

function openUploadBook() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal modal-lg book-upload-modal"><div class="eyebrow">Book Library</div><h2>Upload a book</h2>
  <div class="book-dropzone" data-up-drop role="button" tabindex="0" aria-label="Choose a book file">
    <input type="file" data-up-file accept=".pdf,.epub,.txt,.md,.markdown,text/plain,text/markdown,application/pdf,application/epub+zip">
    <span class="book-dz-ico" aria-hidden="true">${sicon("book")}</span>
    <span class="book-dz-hint"><strong>Drop your book here</strong><small>or click to browse</small></span>
    <button type="button" class="primary book-dz-browse">Choose file</button>
    <small class="book-dz-formats">PDF · EPUB · TXT · MD — up to 50 MB</small>
    <p class="book-dz-picked" data-up-picked hidden></p>
  </div>
  <div class="grid two book-up-row"><label class="field-label">Title<input class="input" data-up-title placeholder="Book title"></label>
  <label class="field-label">Author<input class="input" data-up-author placeholder="Author name"></label></div>
  <label class="field-label">Description<textarea class="textarea autogrow" data-up-desc rows="2" placeholder="What is this book about?"></textarea></label>
  <div class="grid two book-up-row"><label class="field-label">Category<select class="select" data-up-cat>${categoryOptions("")}</select></label>
  <label class="field-label">Custom category (optional)<input class="input" data-up-custom placeholder="e.g. Poetry"></label></div>
  <div class="grid two book-up-row"><label class="field-label">Tags (comma separated)<input class="input" data-up-tags placeholder="classic, algorithms"></label>
  <label class="field-label">ISBN (optional)<input class="input" data-up-isbn placeholder=""></label></div>
  <div class="grid two book-up-row"><div class="field-label">Cover image (optional)${coverPickerMarkup("data-up-cover", "")}</div>
  <label class="field-label">Visibility<select class="select" data-up-vis disabled><option value="private" selected>Private — only I can see this book</option></select></label></div>
  <label class="toggle-row book-up-rights"><span><strong>I have the right to share this</strong><small>Required to upload</small></span><input type="checkbox" data-up-rights></label>
  <p class="st-confirm-err" data-up-err hidden></p>
  <div class="modal-actions"><button type="button" class="ghost" data-up-cancel>Cancel</button><button type="button" class="primary" data-up-save>Upload</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-up-err]");
  const saveBtn = modal.querySelector("[data-up-save]");
  const fail = (msg) => {
    err.textContent = msg;
    err.hidden = false;
    saveBtn.disabled = false;
    saveBtn.textContent = "Upload";
  };
  modal.querySelector("[data-up-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal && !saveBtn.disabled) modal.remove();
  });
  const fileInput = modal.querySelector("[data-up-file]");
  const dropzone = modal.querySelector("[data-up-drop]");
  const pickedEl = modal.querySelector("[data-up-picked]");
  const dzHint = dropzone.querySelector(".book-dz-hint");
  let pickedFile = null;
  const fmtKB = (n) => (n >= 1024 * 1024 ? (n / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const setPicked = (f) => {
    if (f) {
      pickedFile = f;
      pickedEl.textContent = `${f.name} • ${fmtKB(f.size)} ready to upload`;
      pickedEl.hidden = false;
      dropzone.classList.add("picked");
      dzHint.innerHTML = `<strong>File selected</strong><small>Click or drop to replace</small>`;
      const titleInput = modal.querySelector("[data-up-title]");
      if (!titleInput.value.trim()) titleInput.value = cleanFileTitle(f.name);
    } else {
      pickedFile = null;
      pickedEl.hidden = true;
      dropzone.classList.remove("picked");
      dzHint.innerHTML = `<strong>Drop your book here</strong><small>or click to browse</small>`;
    }
  };
  const browse = () => fileInput.click();
  dropzone.querySelector(".book-dz-browse").onclick = (e) => { e.stopPropagation(); browse(); };
  dropzone.onclick = (e) => {
    if (e.target.closest(".book-dz-browse") || e.target === fileInput) return;
    browse();
  };
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); browse(); }
  });
  fileInput.onchange = (e) => setPicked(e.target.files[0] || null);
  bindCoverPicker(modal, "data-up-cover");
  ["dragenter", "dragover"].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("dragging"); }));
  dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) setPicked(f);
  });
  saveBtn.onclick = async () => {
    if (!requireAuth("upload books")) return;
    const file = pickedFile || modal.querySelector("[data-up-file]").files[0];
    const title = modal.querySelector("[data-up-title]").value.trim();
    const extOk = file && BOOK_EXTS.some((x) => file.name.toLowerCase().endsWith(x));
    err.hidden = true;
    if (!file) return fail("Choose a book file first (PDF, EPUB, TXT, MD).");
    if (!extOk) return fail("Unsupported format. Use PDF, EPUB, TXT, or Markdown.");
    if (file.size > BOOK_MAX_BYTES) return fail("That file is over 50 MB — pick a smaller file.");
    if (file.size === 0) return fail("That file is empty.");
    if (!title) return fail("Give the book a title.");
    if (!modal.querySelector("[data-up-rights]").checked)
      return fail("Confirm you have the right to share this book.");
    saveBtn.disabled = true;
    saveBtn.textContent = "Reading file…";
    try {
      const kind = bookKindOf(file.name, file.type);
      const fingerprint = await bookFingerprintOf(file);
      const dupe = findDuplicateBook(file, fingerprint);
      if (dupe) return fail(`“${dupe.title}” is already in your library.`);
      if ((state.books || []).length >= 300) return fail("Library is full (300 books) — remove something first.");
      const customCat = modal.querySelector("[data-up-custom]").value.trim().slice(0, 120);
      const selCat = modal.querySelector("[data-up-cat]").value;
      const author = modal.querySelector("[data-up-author]").value.trim().slice(0, 200);
      const description = modal.querySelector("[data-up-desc]").value.trim().slice(0, 4000);
      const tags = modal.querySelector("[data-up-tags]").value.split(",").map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
      const isbn = modal.querySelector("[data-up-isbn]").value.trim().slice(0, 32);
      const visibility = modal.querySelector("[data-up-vis]").value === "public" ? "public" : "private";
      const allowDownload = false;
      let textContent = "";
      let canonicalMd = "";
      let wordCount = null;
      let pageCount = null;
      if (kind === "txt" || kind === "md") {
        try {
          textContent = await file.text();
          if (textContent.length > 5000000) return fail("That text file is too large to read in the browser (over ~5 MB of text).");
          // Canonical document: every upload is normalized into clean,
          // chapter-structured Markdown. The reader renders it beautifully,
          // highlights anchor to stable section/paragraph indices, and the
          // same document powers the .md / Word exports.
          const meta = { title, author: author || "Unknown author" };
          canonicalMd = kind === "md" ? mdToMarkdown(textContent, meta) : txtToMarkdown(textContent, meta);
          const words = canonicalMd.split(/\s+/).filter(Boolean).length;
          wordCount = words;
          pageCount = Math.max(1, Math.ceil(words / 250));
        } catch {
          return fail("Could not read that text file.");
        }
      } else if (kind === "pdf") {
        saveBtn.textContent = "Inspecting PDF…";
        pageCount = await estimatePdfPages(file);
      }
      let coverData = "";
      const coverFile = modal.querySelector("[data-up-cover]").files[0];
      if (coverFile) {
        if (!coverFile.type.startsWith("image/")) return fail("The cover must be an image file.");
        if (coverFile.size > 8 * 1024 * 1024) return fail("Cover image must be under 8 MB.");
        saveBtn.textContent = "Optimizing cover…";
        coverData = await resizeCover(coverFile).catch(() => "");
      }
      const fileKey = newBookId();
      const entry = {
        id: fileKey, fileKey, ownerId: myUserKey(), title,
        author: author || "Unknown author", description,
        category: customCat || selCat || "General", tags, isbn,
        publisher: "", year: null, pageCount, wordCount,
        coverPath: "", coverData, filePath: "", fileName: file.name,
        fileType: file.type || "", fileSize: file.size, textContent: "",
        formatted: Boolean(canonicalMd),
        fingerprint, visibility, allowDownload, source: "upload",
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      saveBtn.textContent = "Formatting…";
      await bookBlobPut("file:" + fileKey, file);
      if (canonicalMd) await bookBlobPut("text:" + fileKey, new Blob([canonicalMd], { type: "text/markdown" }));
      else if (textContent) await bookBlobPut("text:" + fileKey, new Blob([textContent], { type: "text/plain" }));
      if (backendConfigured && state.user) {
        saveBtn.textContent = "Uploading…";
        try {
          const up = await uploadBookFile(state.user.id, file, "books");
          if (up.error) throw up.error;
          entry.filePath = up.data.path;
          let coverPath = "";
          if (coverFile) {
            const upc = await uploadBookFile(state.user.id, coverFile, "covers");
            if (!upc.error) coverPath = upc.data.path;
          }
          const created = await createBook({
            id: entry.id,
            title: entry.title, author: entry.author, description: entry.description,
            category: entry.category, tags: entry.tags, isbn: entry.isbn,
            publisher: "", published_year: null,
            page_count: entry.pageCount, word_count: entry.wordCount,
            cover_path: coverPath || null, file_path: entry.filePath,
            file_type: entry.fileType, file_size: entry.fileSize,
            visibility: entry.visibility, allow_download: entry.allowDownload,
          });
          if (created.error) throw created.error;
          entry.coverPath = coverPath;
        } catch (e) {
          toast("Saved on this device; cloud upload failed — " + (e?.message || "try again later"));
        }
      }
      state.books = [entry, ...(state.books || [])];
      persist();
      mirrorBooks();
      modal.remove();
      state.bookView = { name: "details", id: entry.id };
      renderLibrary();
      notify("Book added to your library");
    } catch (e) {
      fail(e?.message || "Upload failed. Try again.");
    }
  };
}
function openBookDetails(id) {
  state.bookView = { name: "details", id };
  persist();
  renderLibrary();
}
function resizeCover(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 400;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}
function openEditBook(id) {
  const book = findBook(id);
  if (!book || !isOwnBook(book)) return notify("You can only edit your own books");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Book Library</div><h2>Edit book</h2>
  <label class="field-label">Title<input class="input" data-ed-title value="${esc(book.title)}"></label>
  <label class="field-label">Author<input class="input" data-ed-author value="${esc(book.author || "")}"></label>
  <label class="field-label">Description<textarea class="textarea autogrow" data-ed-desc rows="2">${esc(book.description || "")}</textarea></label>
  <div class="grid two"><label class="field-label">Category<select class="select" data-ed-cat>${categoryOptions(book.category)}</select></label>
  <label class="field-label">Custom category<input class="input" data-ed-custom placeholder="Leave blank to keep selection"></label></div>
  <label class="field-label">Tags (comma separated)<input class="input" data-ed-tags value="${esc((book.tags || []).join(", "))}"></label>
  <div class="grid two"><label class="field-label">ISBN<input class="input" data-ed-isbn value="${esc(book.isbn || "")}"></label>
  <div class="field-label">Replace cover${coverPickerMarkup("data-ed-cover", book.coverData || coverSignedUrl(book.coverPath) || "")}</div></div>
  <label class="field-label" style="display:none">Visibility<select class="select" data-ed-vis><option value="private" selected>Private — only I can see this book</option></select></label>
  <label class="toggle-row"><span><strong>Allow downloads</strong><small>Export the file when reading your book</small></span><input type="checkbox" data-ed-dl${book.allowDownload ? " checked" : ""}></label>
  <p class="st-confirm-err" data-ed-err hidden></p>
  <div class="modal-actions"><button type="button" class="ghost" data-ed-cancel>Cancel</button><button type="button" class="primary" data-ed-save>Save changes</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-ed-err]");
  const saveBtn = modal.querySelector("[data-ed-save]");
  modal.querySelector("[data-ed-cancel]").onclick = () => modal.remove();
  bindCoverPicker(modal, "data-ed-cover");
  modal.addEventListener("click", (e) => {
    if (e.target === modal && !saveBtn.disabled) modal.remove();
  });
  saveBtn.onclick = async () => {
    const title = modal.querySelector("[data-ed-title]").value.trim().slice(0, 300);
    if (!title) {
      err.textContent = "Title cannot be empty.";
      err.hidden = false;
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const customCat = modal.querySelector("[data-ed-custom]").value.trim().slice(0, 120);
      book.title = title;
      book.author = modal.querySelector("[data-ed-author]").value.trim().slice(0, 200);
      book.description = modal.querySelector("[data-ed-desc]").value.trim().slice(0, 4000);
      const selCat = modal.querySelector("[data-ed-cat]").value;
      book.category = customCat || selCat || book.category || "General";
      book.tags = modal.querySelector("[data-ed-tags]").value.split(",").map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
      book.isbn = modal.querySelector("[data-ed-isbn]").value.trim().slice(0, 32);
      book.visibility = modal.querySelector("[data-ed-vis]").value === "public" ? "public" : "private";
      book.allowDownload = modal.querySelector("[data-ed-dl]").checked;
      book.updatedAt = Date.now();
      const coverFile = modal.querySelector("[data-ed-cover]").files[0];
      if (coverFile) {
        if (!coverFile.type.startsWith("image/")) throw new Error("Cover must be an image file.");
        if (coverFile.size > 8 * 1024 * 1024) throw new Error("Cover image must be under 8 MB.");
        const oldCoverPath = book.coverPath;
        book.coverData = await resizeCover(coverFile).catch(() => "");
        if (backendConfigured && state.user) {
          try {
            const upc = await uploadBookFile(state.user.id, coverFile, "covers");
            if (!upc.error) {
              book.coverPath = upc.data.path;
              if (oldCoverPath && oldCoverPath !== book.coverPath) {
                try { await removeBookFile(oldCoverPath); } catch { /* best-effort */ }
              }
            }
          } catch { /* keep dataURL */ }
        }
      }
      await pushBookRow(book);
      mirrorBooks();
      persist();
      modal.remove();
      renderLibrary();
      notify("Book updated");
    } catch (e) {
      err.textContent = e?.message || "Save failed. Try again.";
      err.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "Save changes";
    }
  };
}
function askDeleteBook(id) {
  const book = findBook(id);
  if (!book || !isOwnBook(book)) return notify("You can only delete your own books");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Delete book</div><h2>Delete “${esc(book.title)}”?</h2><p class="muted">The file, cover, progress, bookmarks, highlights, and notes for this book will be permanently removed. This cannot be undone.</p><p class="st-confirm-err" data-del-err hidden></p><div class="modal-actions"><button type="button" class="ghost" data-del-cancel>Cancel</button><button type="button" class="danger-button" data-del-go>Delete</button></div></div>`;
  $("#modal-root").append(modal);
  const err = modal.querySelector("[data-del-err]");
  const go = modal.querySelector("[data-del-go]");
  modal.querySelector("[data-del-cancel]").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (e.target === modal && !go.disabled) modal.remove();
  });
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = "Deleting…";
    err.hidden = true;
    try {
      const fresh = findBook(id);
      if (!fresh || !isOwnBook(fresh)) throw new Error("That book is already gone or is not yours.");
      // Local-first: the library, blobs, annotations, refs and URLs go away
      // NOW, online or not. The cloud follows via attempt + durable outbox.
      const wasSynced = Boolean(fresh.filePath) || BOOK_UUID_RE.test(String(fresh.id || ""));
      await bookBlobDelete("file:" + (fresh.fileKey || fresh.id));
      await bookBlobDelete("text:" + (fresh.fileKey || fresh.id));
      bookUrlCache.delete(fresh.fileKey || fresh.id);
      try {
        const url = coverSignedUrl(fresh.coverPath);
        if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
      } catch { /* ignore */ }
      if (fresh.coverPath) coverSignedCache.delete(fresh.coverPath);
      state.books = (state.books || []).filter((b) => b.id !== id);
      const prog = { ...(state.bookProgress || {}) };
      delete prog[id];
      state.bookProgress = prog;
      state.bookFavorites = (state.bookFavorites || []).filter((x) => x !== id);
      const local = { ...(state.bookLocal || {}) };
      delete local[id];
      state.bookLocal = local;
      state.bookRecent = (state.bookRecent || []).filter((x) => x !== id);
      const stats = state.bookStats && typeof state.bookStats === "object" ? state.bookStats : null;
      if (stats) {
        if (stats.opened) delete stats.opened[id];
        if (stats.lastOpened) delete stats.lastOpened[id];
        if (Array.isArray(stats.completed)) stats.completed = stats.completed.filter((x) => x !== id);
      }
      deleteBookEverywhere(id);
      persist();
      modal.remove();
      if (state.bookView?.name !== "home") state.bookView = { name: "home" };
      renderLibrary();
      if (!state.user) {
        notify("Book deleted from this device");
        return;
      }
      if (!wasSynced) {
        notify("Book deleted");
        return;
      }
      // Signed in with a possibly-synced book: try the server now, otherwise
      // the outbox finishes the job on reconnect. Never resurrect locally.
      try {
        const { error } = await deleteBook(fresh.id);
        if (error) throw error;
        try {
          if (fresh.filePath) await removeBookFile(fresh.filePath);
          if (fresh.coverPath) await removeBookFile(fresh.coverPath);
        } catch { /* files best-effort */ }
        notify("Book deleted");
      } catch (e) {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        toast(offline
          ? "Deleted on this device — will sync when you reconnect"
          : "Deleted on this device; cloud delete failed — will retry automatically");
      }
    } catch (e) {
      err.textContent = e?.message || "Delete failed. Try again.";
      err.hidden = false;
      go.disabled = false;
      go.textContent = "Delete";
    }
  };
}
export async function downloadBook(book, format = "original") {
  const b = typeof book === "string" ? findBook(book) : book;
  if (!b || !canDownloadBook(b)) return notify("Download is not available for this book");
  toast("Preparing download…");
  try {
    if (format === "md") {
      const md = (await getBookText(b)) || "";
      if (!md) return toast("No readable text to export for this book");
      triggerBlobDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), safeBookFilename(b, "md"));
      return;
    }
    if (format === "docx") {
      const md = (await getBookText(b)) || "";
      if (!md) return toast("No readable text to export for this book");
      const blob = markdownToDocxBlob(md, { title: b.title, author: b.author });
      triggerBlobDownload(blob, safeBookFilename(b, "docx"));
      return;
    }
    if (b.textContent) {
      const blob = new Blob([b.textContent], { type: "text/markdown" });
      triggerBlobDownload(blob, safeBookFilename(b, "md"));
      return;
    }
    const blob = await getBookBlob(b);
    if (!blob) return toast("File unavailable — try again later");
    const ext = (b.fileName || "").split(".").pop() || (b.fileType.includes("pdf") ? "pdf" : b.fileType.includes("epub") ? "epub" : "txt");
    triggerBlobDownload(blob, safeBookFilename(b, ext));
  } catch {
    toast("Download failed — try again later");
  }
}

// Export sheet: pick Markdown or Word. Anchored above the triggering button.
export function openExportSheet(book, anchor) {
  const b = typeof book === "string" ? findBook(book) : book;
  if (!b) return;
  const sheet = document.createElement("div");
  sheet.className = "modal-backdrop export-sheet-backdrop";
  sheet.innerHTML = `<div class="modal export-sheet"><div class="eyebrow">Export “${esc(b.title || "book")}”</div><h2>Choose a format</h2><p class="muted">Your highlights and notes stay in StudyFlow — the document exports clean and beautifully formatted.</p><div class="export-opts"><button type="button" class="export-opt" data-export-md><span class="export-ico">${sicon("doc")}</span><span class="export-txt"><strong>Markdown (.md)</strong><small>Clean chapters · opens in any editor, Notion, Obsidian</small></span><span class="export-go">→</span></button><button type="button" class="export-opt" data-export-docx><span class="export-ico">${sicon("memo")}</span><span class="export-txt"><strong>Word document (.docx)</strong><small>Styled title page · Georgia serif · ready to share</small></span><span class="export-go">→</span></button></div><div class="modal-actions"><button type="button" class="ghost" data-export-cancel>Cancel</button></div></div>`;
  document.body.append(sheet);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.remove(); });
  sheet.querySelector("[data-export-cancel]").onclick = () => sheet.remove();
  sheet.querySelector("[data-export-md]").onclick = () => { sheet.remove(); downloadBook(b, "md"); };
  sheet.querySelector("[data-export-docx]").onclick = () => { sheet.remove(); downloadBook(b, "docx"); };
}
function safeBookFilename(b, ext) {
  const base = String(b.title || "book").replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "book";
  return `${base}.${String(ext || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin"}`;
}
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    a.remove();
  }, 4000);
}
export { findBook, openBookDetails, openUploadBook, openEditBook, askDeleteBook, bookProgressOf, isBookFav, isOwnBook, canReadBook, canDownloadBook, bookKindOf, resizeCover };
