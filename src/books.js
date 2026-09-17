/* books.js — book library: catalog, upload, details, favorites, download, reports */
import {
  state, $, $$, uid, esc, sicon, persist, notify, confirmBox, viewHead, fitTextarea, requireAuth,
} from "./core.js";
import {
  backendConfigured, uploadBookFile, getBookFileUrl, downloadBookFile, removeBookFile,
  createBook, updateBook, deleteBook, listMyBooks, getBook,
  toggleBookFavorite as toggleBookFavoriteRemote, listBookFavorites, saveBookProgress, listBookProgress,
  listBookBookmarks, addBookBookmark, removeBookBookmark,
  listBookHighlights, addBookHighlight, updateBookHighlight, removeBookHighlight,
} from "./services/backend.js";
import { openReader, readerOpenId, repaintReader } from "./books-reader.js";

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
  }
  return url;
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
async function syncMyBooksFromBackend() {
  if (!backendConfigured || !state.user) return false;
  const before = libSignature();
  try {
    const [mine, favs, prog] = await Promise.all([listMyBooks(), listBookFavorites(), listBookProgress()]);
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
    return false;
  }
}
async function pushBookRow(book) {
  if (!backendConfigured || !state.user) return;
  try {
    await updateBook(book.id, {
      title: book.title, author: book.author, description: book.description,
      category: book.category, tags: book.tags, isbn: book.isbn || "",
      publisher: book.publisher || "", published_year: book.year ?? null,
      page_count: book.pageCount ?? null, word_count: book.wordCount ?? null,
      visibility: book.visibility, allow_download: Boolean(book.allowDownload),
    });
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
  return blob.text().then((t) => {
    try {
      const m = t.match(/\/Type\s*\/Page[^s]/g);
      return m ? m.length : null;
    } catch {
      return null;
    }
  }).catch(() => null);
}
function coverUrl(book, signedCache) {
  if (book.coverData) return book.coverData;
  if (book.coverPath && signedCache && signedCache.get(book.coverPath)) return signedCache.get(book.coverPath);
  return "";
}
function monogram(title) {
  const words = String(title || "?").trim().split(/\s+/).slice(0, 2);
  return words.map((w) => (w[0] || "?").toUpperCase()).join("");
}

let bookHome = { q: "", cat: "All", page: 0 };
const BOOK_PAGE_SIZE = 24;
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
const coverSignedCache = new Map();

async function resolveCovers(books) {
  if (!backendConfigured) return false;
  let changed = false;
  await Promise.all((books || []).map(async (b) => {
    if (!b.coverPath || b.coverData || coverSignedCache.has(b.coverPath)) return;
    try {
      const { data, error } = await getBookFileUrl(b.coverPath, 86400);
      const url = !error && data ? data.signedUrl || data.signedURL : "";
      if (url) {
        coverSignedCache.set(b.coverPath, url);
        changed = true;
      }
    } catch {
      /* offline */
    }
  }));
  return changed;
}
function coverImg(book, cls) {
  const url = coverUrl(book, coverSignedCache);
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
  return `<article class="book-card"><button class="book-cover" data-book-open="${b.id}" title="Open ${esc(b.title)}">${coverImg(b)}${pct > 0 ? `<span class="book-progressbar"><i style="width:${pct}%"></i></span>` : ""}</button><div class="book-meta"><strong>${esc(b.title)}</strong><small>${esc(b.author || "Unknown author")}</small><span class="tag">${esc(b.category || "General")}</span></div><div class="book-actions"><button class="ghost" data-book-open="${b.id}">${pct > 0 && pct < 100 ? "Continue" : "Read"}</button><button class="icon-btn book-fav${fav ? " on" : ""}" data-book-fav="${b.id}" title="${fav ? "Remove favorite" : "Add favorite"}" aria-label="Favorite" aria-pressed="${fav}">${sicon("star")}</button></div></article>`;
}
function bookRowMatches(b, q, cat) {
  if (cat && cat !== "All" && (b.category || "General") !== cat) return false;
  if (!q) return true;
  const hay = `${b.title || ""} ${b.author || ""} ${b.category || ""} ${(b.tags || []).join(" ")} ${b.isbn || ""} ${b.description || ""}`.toLowerCase();
  return hay.includes(q);
}
export function renderLibrary() {
  const t = $("#tab-books");
  if (!t) return;
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
  t.innerHTML = `${viewHead("Book Library", "Your personal shelves — upload, discover, read, and study.")}<div class="card empty-state"><div class="emoji">${sicon("bookOpen")}</div><h3>Book Library hit a snag</h3><p class="muted">${esc(err?.message || "Something went wrong loading your shelves. Your books are safe.")}</p><button class="primary" data-lib-retry>Try again</button></div>`;
  $("[data-lib-retry]", t).onclick = () => renderLibrary();
}
function renderLibraryHome(t) {
  const books = allBooks();
  const favs = books.filter((b) => isBookFav(b.id));
  const started = books.filter((b) => { const p = bookProgressOf(b.id); return p > 0 && p < 1; });
  const finished = books.filter((b) => bookProgressOf(b.id) >= 1);
  const recent = [...books].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
  const cats = ["All", ...ALL_CATEGORY_NAMES.filter((c) => books.some((b) => (b.category || "General") === c))];
  if (!cats.includes(bookHome.cat)) bookHome.cat = "All";
  t.innerHTML = `${viewHead("Book Library", "Your personal shelves — upload, discover, read, and study.")}
  <div class="card" style="margin-bottom:18px"><div class="input-row" style="margin-bottom:0"><input class="input" id="book-search" placeholder="Search title, author, category, ISBN…" aria-label="Search books" value="${esc(bookHome.q)}"><button class="primary" data-book-upload>Upload Book</button></div>
  <div class="filter-bar" style="margin:12px 0 0">${cats.slice(0, 14).map((c) => `<button class="filter ${bookHome.cat === c ? "active" : ""}" data-book-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div></div>
  <div id="book-results"></div>
  ${started.length ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Continue Reading</h2><span class="tag">${started.length}</span></div><div class="book-grid">${started.slice(0, 6).map(safeBookCard).join("")}</div></div>` : ""}
  ${finished.length ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Finished</h2><span class="tag">${finished.length}</span></div><div class="book-grid">${finished.slice(0, 6).map(safeBookCard).join("")}</div></div>` : ""}
  ${favs.length ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>My Favorites</h2><span class="tag">${favs.length}</span></div><div class="book-grid">${favs.slice(0, 6).map(safeBookCard).join("")}</div></div>` : ""}
  ${recent.length ? `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Recently Added</h2><span class="tag">yours</span></div><div class="book-grid">${recent.map(safeBookCard).join("")}</div></div>` : ""}`;
  renderBookResults();
  const input = $("#book-search", t);
  input.oninput = () => {
    bookHome.q = input.value.trim().toLowerCase();
    bookHome.page = 0;
    renderBookResults();
  };
  $$("[data-book-cat]", t).forEach((b) => (b.onclick = () => {
    bookHome.cat = b.dataset.bookCat;
    bookHome.page = 0;
    renderLibrary();
  }));
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
  let list = [];
  try {
    list = allBooks().filter((b) => bookRowMatches(b, bookHome.q, bookHome.cat));
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
  box.innerHTML = `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>${bookHome.q || bookHome.cat !== "All" ? "Results" : "All Books"}</h2><span class="tag">${list.length}</span></div><div class="book-grid">${shown.map(safeBookCard).join("")}</div>${rest > 0 ? `<div style="margin-top:12px;text-align:center"><button class="ghost" data-book-more>Show more (${rest} remaining)</button></div>` : ""}</div>`;
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
      if (error) notify("Favorite saved on this device; cloud sync failed");
    } catch {
      notify("Favorite saved on this device; cloud sync failed");
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
    t.innerHTML = `${viewHead("Book Library", "Your personal shelves.")}<div class="card empty-state"><div class="emoji">${sicon("lock")}</div><h3>Book unavailable</h3><p class="muted">It may have been removed or is private.</p><button class="primary" data-book-home>Back to library</button></div>`;
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
  const isEpub = bookKindOf(book.fileName, book.fileType) === "epub";
  t.innerHTML = `${viewHead("Book Library", "Your personal shelves.")}
  <button class="ghost" data-book-home style="margin-bottom:14px">← All books</button>
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
      <div class="book-detail-actions">
        ${isEpub && !canDl ? `<p class="muted" style="margin:0">EPUB preview is not supported in this version, and downloads are disabled for this book.</p>` : `<button class="primary" data-book-read="${book.id}">Read Now</button>`}
        ${canDl ? `<button class="ghost" data-book-dl="${book.id}">${sicon("download")} Download</button>` : ""}
        <button class="ghost" data-book-fav="${book.id}">${sicon("star")} ${fav ? "Favorited" : "Favorite"}</button>
        ${own ? `<button class="ghost" data-book-edit="${book.id}">Edit</button><button class="danger-button" data-book-delete="${book.id}">Delete</button>` : ""}
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
  const favBtn = $("[data-book-fav]", t);
  if (favBtn) favBtn.onclick = () => toggleBookFavorite(book.id);
  const dlBtn = $("[data-book-dl]", t);
  if (dlBtn) dlBtn.onclick = () => downloadBook(book);
  const editBtn = $("[data-book-edit]", t);
  if (editBtn) editBtn.onclick = () => openEditBook(book.id);
  const delBtn = $("[data-book-delete]", t);
  if (delBtn) delBtn.onclick = () => askDeleteBook(book.id);
  if (book.coverPath && !book.coverData && !coverSignedCache.has(book.coverPath)) {
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
  <div class="modal-actions"><button class="ghost" data-up-cancel>Cancel</button><button class="primary" data-up-save>Upload</button></div></div>`;
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
      const customCat = modal.querySelector("[data-up-custom]").value.trim().slice(0, 120);
      const selCat = modal.querySelector("[data-up-cat]").value;
      const author = modal.querySelector("[data-up-author]").value.trim().slice(0, 200);
      const description = modal.querySelector("[data-up-desc]").value.trim().slice(0, 4000);
      const tags = modal.querySelector("[data-up-tags]").value.split(",").map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
      const isbn = modal.querySelector("[data-up-isbn]").value.trim().slice(0, 32);
      const visibility = modal.querySelector("[data-up-vis]").value === "public" ? "public" : "private";
      const allowDownload = false;
      let textContent = "";
      let wordCount = null;
      let pageCount = null;
      if (kind === "txt" || kind === "md") {
        try {
          textContent = await file.text();
          if (textContent.length > 5000000) return fail("That text file is too large to read in the browser (over ~5 MB of text).");
          const words = textContent.split(/\s+/).filter(Boolean).length;
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
      const fileKey = uid();
      const entry = {
        id: fileKey, fileKey, ownerId: myUserKey(), title,
        author: author || "Unknown author", description,
        category: customCat || selCat || "General", tags, isbn,
        publisher: "", year: null, pageCount, wordCount,
        coverPath: "", coverData, filePath: "", fileName: file.name,
        fileType: file.type || "", fileSize: file.size, textContent: "",
        visibility, allowDownload, source: "upload",
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      saveBtn.textContent = "Saving…";
      await bookBlobPut("file:" + fileKey, file);
      if (textContent) await bookBlobPut("text:" + fileKey, new Blob([textContent], { type: "text/plain" }));
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
            title: entry.title, author: entry.author, description: entry.description,
            category: entry.category, tags: entry.tags, isbn: entry.isbn,
            publisher: "", published_year: null,
            page_count: entry.pageCount, word_count: entry.wordCount,
            cover_path: coverPath || null, file_path: entry.filePath,
            file_type: entry.fileType, file_size: entry.fileSize,
            visibility: entry.visibility, allow_download: entry.allowDownload,
          });
          if (created.error) throw created.error;
          entry.id = created.data.id;
          entry.coverPath = coverPath;
          await bookBlobPut("file:" + entry.id, file);
        } catch (e) {
          notify("Saved on this device; cloud upload failed — " + (e?.message || "try again later"));
        }
      }
      state.books = [entry, ...(state.books || [])];
      persist();
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
  <div class="field-label">Replace cover${coverPickerMarkup("data-ed-cover", book.coverData || coverSignedCache.get(book.coverPath) || "")}</div></div>
  <label class="field-label" style="display:none">Visibility<select class="select" data-ed-vis><option value="private" selected>Private — only I can see this book</option></select></label>
  <label class="toggle-row"><span><strong>Allow downloads</strong><small>Export the file when reading your book</small></span><input type="checkbox" data-ed-dl${book.allowDownload ? " checked" : ""}></label>
  <p class="st-confirm-err" data-ed-err hidden></p>
  <div class="modal-actions"><button class="ghost" data-ed-cancel>Cancel</button><button class="primary" data-ed-save>Save changes</button></div></div>`;
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
  modal.innerHTML = `<div class="modal"><div class="eyebrow">Delete book</div><h2>Delete “${esc(book.title)}”?</h2><p class="muted">The file, cover, progress, bookmarks, highlights, and notes for this book will be permanently removed. This cannot be undone.</p><p class="st-confirm-err" data-del-err hidden></p><div class="modal-actions"><button class="ghost" data-del-cancel>Cancel</button><button class="danger-button" data-del-go>Delete</button></div></div>`;
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
      if (backendConfigured && state.user && fresh.source !== "seed") {
        try {
          const { error } = await deleteBook(fresh.id);
          if (error) throw error;
        } catch (e) {
          throw new Error("Server delete failed — " + (e?.message || "try again later"));
        }
        try {
          if (fresh.filePath) await removeBookFile(fresh.filePath);
          if (fresh.coverPath) await removeBookFile(fresh.coverPath);
        } catch { /* files best-effort */ }
      }
      await bookBlobDelete("file:" + (fresh.fileKey || fresh.id));
      await bookBlobDelete("text:" + (fresh.fileKey || fresh.id));
      bookUrlCache.delete(fresh.fileKey || fresh.id);
      try {
        const url = coverSignedCache.get(fresh.coverPath);
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
      persist();
      modal.remove();
      state.bookView = { name: "home" };
      renderLibrary();
      notify("Book deleted");
    } catch (e) {
      err.textContent = e?.message || "Delete failed. Try again.";
      err.hidden = false;
      go.disabled = false;
      go.textContent = "Delete";
    }
  };
}
export async function downloadBook(book) {
  const b = typeof book === "string" ? findBook(book) : book;
  if (!b || !canDownloadBook(b)) return notify("Download is not available for this book");
  notify("Preparing download…");
  try {
    if (b.textContent) {
      const blob = new Blob([b.textContent], { type: "text/markdown" });
      triggerBlobDownload(blob, safeBookFilename(b, "md"));
      return;
    }
    const blob = await getBookBlob(b);
    if (!blob) return notify("File unavailable — try again later");
    const ext = (b.fileName || "").split(".").pop() || (b.fileType.includes("pdf") ? "pdf" : b.fileType.includes("epub") ? "epub" : "txt");
    triggerBlobDownload(blob, safeBookFilename(b, ext));
  } catch {
    notify("Download failed — try again later");
  }
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
export { findBook, openBookDetails, openUploadBook, openEditBook, askDeleteBook, bookProgressOf, isBookFav, isOwnBook, canReadBook, canDownloadBook };
