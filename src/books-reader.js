/* books-reader.js — text/PDF reader: sections, progress, search, highlights, notes, bookmarks, settings */
import {
  state, $, $$, uid, esc, sicon, persist, notify, fitTextarea, get, save,
  isPersistHalted,
} from "./core.js";
import {
  getBookBlob, getBookText, bookProgressOf,
  toggleBookFavorite, isBookFav, renderLibrary, BOOK_COLORS,
} from "./books.js";
import {
  backendConfigured, saveBookProgress,
  listBookBookmarks, addBookBookmark, removeBookBookmark,
  listBookHighlights, addBookHighlight, updateBookHighlight, removeBookHighlight,
} from "./services/backend.js";
import { renderCompanionPanel as paintCompanion } from "./books-companion.js";

let R = null;
function readerSettings() {
  return {
    fontSize: 18, lineHeight: 1.7, width: "medium", theme: "auto", align: "left",
    ...(JSON.parse(localStorage.getItem("sf-book-settings") || "{}")),
  };
}
function saveReaderSettings(s) {
  try {
    localStorage.setItem("sf-book-settings", JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
function localStore(bookId) {
  const all = state.bookLocal || {};
  if (!all[bookId] || typeof all[bookId] !== "object")
    all[bookId] = { highlights: [], bookmarks: [] };
  const s = all[bookId];
  if (!Array.isArray(s.highlights)) s.highlights = [];
  if (!Array.isArray(s.bookmarks)) s.bookmarks = [];
  state.bookLocal = all;
  return s;
}
function unionById(local, remote) {
  const map = new Map();
  for (const r of remote || []) if (r && r.id) map.set(r.id, r);
  for (const l of local || []) if (l && l.id) map.set(l.id, l);
  return [...map.values()];
}
function parseBookText(text) {
  const sections = [];
  let cur = { title: null, paras: [] };
  let buf = [];
  const flushPara = () => {
    const p = buf.join(" ").replace(/\s+/g, " ").trim();
    if (p) cur.paras.push(p.slice(0, 4000));
    buf = [];
  };
  const pushSec = () => {
    if (cur.paras.length || cur.title) sections.push(cur);
  };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushPara(); pushSec();
      cur = { title: h[2].trim().slice(0, 120), paras: [] };
      continue;
    }
    if (!line) { flushPara(); continue; }
    buf.push(line);
    if (buf.join(" ").length > 2000) flushPara();
  }
  flushPara(); pushSec();
  // chunk long untitled runs so the TOC stays useful
  const out = [];
  for (const s of sections) {
    if (s.title || s.paras.length <= 15) { out.push(s); continue; }
    for (let i = 0; i < s.paras.length; i += 15)
      out.push({ title: null, paras: s.paras.slice(i, i + 15) });
  }
  return out.length ? out : [{ title: null, paras: ["(Empty book)"] }];
}
function bookKind(b) {
  const nm = `${b.fileName || ""} ${b.fileType || ""}`.toLowerCase();
  if (nm.includes("pdf")) return "pdf";
  if (nm.includes("epub")) return "epub";
  return "text";
}

export async function openReader(id) {
  const { findBook } = await import("./books.js");
  const book = findBook(id);
  if (!book) {
    notify("Book unavailable");
    state.bookView = { name: "home" };
    persist();
    renderLibrary();
    return;
  }
  const kind = bookKind(book);
  if (kind === "epub") {
    state.bookView = { name: "details", id };
    persist();
    const { downloadBook } = await import("./books.js");
    notify("EPUB preview is not supported in this version — use Download to read it");
    return;
  }
  R = {
    id: book.id, book, kind, sections: [], panel: null,
    settings: readerSettings(), search: { q: "", hits: [], idx: -1 },
    saveT: 0, cloudT: 0, scrollT: 0,
  };
  if (kind === "text") {
    const text = await getBookText(book);
    if (!text) {
      notify("No readable text found in this book");
      return;
    }
    R.sections = parseBookText(text);
  }
  // load annotations: backend wins when signed in, union with local (local intent wins ties)
  if (backendConfigured && state.user) {
    try {
      const [h, bkm] = await Promise.all([listBookHighlights(book.id), listBookBookmarks(book.id)]);
      const store = localStore(book.id);
      if (!h.error && Array.isArray(h.data) && h.data.length) {
        const mapped = h.data.map((x) => ({ id: x.id, color: x.color, excerpt: x.excerpt, prefix: x.prefix || "", suffix: x.suffix || "", note: x.note || "", ts: new Date(x.created_at).getTime() || Date.now() }));
        store.highlights = unionById(store.highlights, mapped);
      }
      if (!bkm.error && Array.isArray(bkm.data) && bkm.data.length) {
        const mapped = bkm.data.map((x) => ({ id: x.id, label: x.label, sec: 0, frac: 0, locator: x.locator || "", ts: new Date(x.created_at).getTime() || Date.now() }));
        store.bookmarks = unionById(store.bookmarks, mapped.map((m) => ({ ...m, ...parseLocator(m.locator) })));
      }
      persist();
    } catch {
      /* offline — local store stands */
    }
  }
  state.bookView = { name: "reader", id: book.id };
  persist();
  renderReader();
  // restore position after paint
  setTimeout(() => restoreReaderPosition(), 60);
}
export function readerOpenId() {
  return R ? R.id : null;
}
export function repaintReader() {
  if (!R) return;
  renderReader();
  setTimeout(() => restoreReaderPosition(), 60);
}
function parseLocator(loc) {
  try {
    const m = String(loc || "").match(/sec=(\d+)\s+frac=([\d.]+)/);
    if (m) return { sec: Math.max(0, +m[1] || 0), frac: Math.min(1, Math.max(0, +m[2] || 0)) };
  } catch {
    /* ignore */
  }
  return { sec: 0, frac: 0 };
}
function readerRoot() {
  return $("#tab-books");
}
export function renderReader() {
  const t = readerRoot();
  if (!t || !R) return;
  const { book, settings: s } = R;
  const pct = Math.round(bookProgressOf(book.id) * 100);
  const themeCls = s.theme === "auto" ? "" : ` reader-${s.theme}`;
  const widthPx = s.width === "narrow" ? 560 : s.width === "wide" ? 860 : 700;
  t.innerHTML = `<div class="reader${themeCls}" data-reader>
    <div class="reader-top"><button class="ghost" data-r-back>← Library</button>
      <div class="reader-title"><strong>${esc(book.title)}</strong><small>${esc(book.author || "")} · <span data-r-pct>${pct}%</span></small></div>
      <div class="reader-top-actions">
        <button class="icon-btn" data-r-panel="toc" title="Contents">${sicon("list")}</button>
        <button class="icon-btn" data-r-panel="search" title="Search in book">${sicon("search")}</button>
        <button class="icon-btn" data-r-panel="marks" title="Bookmarks">${sicon("bookmark")}</button>
        <button class="icon-btn" data-r-panel="notes" title="Notes & highlights">${sicon("doc")}</button>
        <button class="icon-btn" data-r-panel="companion" title="Study companion">${sicon("robot")}</button>
        <button class="icon-btn" data-r-panel="settings" title="Reading settings">${sicon("gear")}</button>
        <button class="icon-btn" data-r-full title="Fullscreen">${sicon("expand")}</button>
      </div></div>
    <div class="reader-main">
      <div class="reader-bodywrap"><div class="reader-progress"><i data-r-bar style="width:${pct}%"></i></div>
        <div class="reader-body" data-r-body style="--read-fs:${s.fontSize}px;--read-lh:${s.lineHeight};--read-w:${widthPx}px;text-align:${s.align === "justify" ? "justify" : "left"}"></div>
        <div class="reader-foot"><button class="ghost" data-r-prev>‹ Prev</button><span class="muted" data-r-page></span><button class="ghost" data-r-next>Next ›</button></div>
      </div>
      <aside class="reader-side" data-r-side hidden></aside>
    </div>
    <div class="reader-selectbar" data-r-selbar hidden></div>
  </div>`;
  renderReaderBody();
  bindReader(t);
  applyReaderPanel();
}
function renderReaderBody() {
  const body = document.querySelector("[data-r-body]");
  if (!body || !R) return;
  if (R.kind === "pdf") {
    body.innerHTML = `<p class="muted">PDFs open in your browser's viewer below. Highlights, bookmarks, and tracked progress are available for text books in this version.</p><div data-r-pdfwrap class="muted">Loading PDF…</div>`;
    getBookBlobLazy().then((url) => {
      const wrap = document.querySelector("[data-r-pdfwrap]");
      if (!wrap || !url) {
        if (wrap) wrap.textContent = "Could not load the PDF file.";
        return;
      }
      wrap.innerHTML = `<embed class="reader-pdf" src="${url}" type="application/pdf">`;
    });
    updateReaderFoot();
    return;
  }
  body.innerHTML = R.sections.map((sec, i) =>
    `<section class="reader-sec" data-sec="${i}">${sec.title ? `<h3>${esc(sec.title)}</h3>` : `<h3 class="reader-sec-auto">Section ${i + 1}</h3>`}${sec.paras.map((p) => `<p>${esc(p)}</p>`).join("")}</section>`,
  ).join("");
  applyHighlights();
  applySearchMarks();
  updateReaderFoot();
}
async function getBookBlobLazy() {
  const { getBookBlob } = await import("./books.js");
  if (!R) return null;
  const blob = await getBookBlob(R.book);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
function readerBodyEl() {
  return document.querySelector("[data-r-body]");
}
function updateReaderFoot() {
  const body = readerBodyEl();
  const page = document.querySelector("[data-r-page]");
  if (!body || !page || !R) return;
  if (R.kind !== "text") {
    page.textContent = R.book.pageCount ? `${R.book.pageCount} pages` : "PDF";
    return;
  }
  const secs = R.sections.length;
  const y = body.scrollTop;
  let cur = 0;
  const nodes = body.querySelectorAll("[data-sec]");
  nodes.forEach((n, i) => {
    if (n.offsetTop <= y + 8) cur = i;
  });
  page.textContent = `Section ${Math.min(cur + 1, secs)} of ${secs}`;
}
function currentFraction() {
  const body = readerBodyEl();
  if (!body || !R || R.kind !== "text") return bookProgressOf(R ? R.id : "");
  const max = body.scrollHeight - body.clientHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, body.scrollTop / max));
}
function saveReaderProgress(force) {
  if (!R || R.kind !== "text") return;
  const now = Date.now();
  if (!force && now - R.saveT < 1000) return;
  R.saveT = now;
  const pos = currentFraction();
  state.bookProgress = { ...(state.bookProgress || {}), [R.id]: pos };
  persist();
  const pct = Math.round(pos * 100);
  const bar = document.querySelector("[data-r-bar]");
  if (bar) bar.style.width = pct + "%";
  const label = document.querySelector("[data-r-pct]");
  if (label) label.textContent = pct + "%";
  if (force || now - R.cloudT > 10000) {
    R.cloudT = now;
    if (backendConfigured && state.user) {
      saveBookProgress(R.id, pos).catch(() => {});
    }
  }
}
function restoreReaderPosition() {
  const body = readerBodyEl();
  if (!body || !R || R.kind !== "text") return;
  const pos = bookProgressOf(R.id);
  if (pos > 0) {
    const max = body.scrollHeight - body.clientHeight;
    body.scrollTop = Math.round(max * pos);
  }
  updateReaderFoot();
}
function currentLocator() {
  const body = readerBodyEl();
  if (!body || !R) return { sec: 0, frac: 0 };
  const nodes = [...body.querySelectorAll("[data-sec]")];
  const y = body.scrollTop;
  let sec = 0;
  nodes.forEach((n, i) => {
    if (n.offsetTop <= y + 8) sec = i;
  });
  const node = nodes[sec];
  let frac = 0;
  if (node && node.offsetHeight > 0)
    frac = Math.min(1, Math.max(0, (y - node.offsetTop) / node.offsetHeight));
  return { sec, frac };
}
function jumpToLocator(sec, frac) {
  const body = readerBodyEl();
  if (!body) return;
  const nodes = body.querySelectorAll("[data-sec]");
  const node = nodes[Math.min(Math.max(0, sec), nodes.length - 1)];
  if (!node) return;
  body.scrollTop = Math.round(node.offsetTop + frac * node.offsetHeight);
  updateReaderFoot();
  saveReaderProgress(true);
}
function bindReader(t) {
  const body = t.querySelector("[data-r-body]");
  t.querySelector("[data-r-back]").onclick = () => {
    saveReaderProgress(true);
    R = null;
    state.bookView = { name: "home" };
    persist();
    renderLibrary();
  };
  t.querySelector("[data-r-full]").onclick = () => {
    const root = t.querySelector("[data-reader]");
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else root.requestFullscreen();
    } catch {
      notify("Fullscreen is not available here");
    }
  };
  t.querySelector("[data-r-prev]").onclick = () => stepSection(-1);
  t.querySelector("[data-r-next]").onclick = () => stepSection(1);
  $$("[data-r-panel]", t).forEach((b) => (b.onclick = () => {
    const next = R.panel === b.dataset.rPanel ? null : b.dataset.rPanel;
    if (next !== "companion") R.askCtx = null; // selection context only lives for the companion
    R.panel = next;
    applyReaderPanel();
  }));
  if (body && R.kind === "text") {
    let ticking = false;
    body.addEventListener("scroll", () => {
      if (R && R.kind === "text") {
        if (!ticking) {
          ticking = true;
          // rAF is throttled/paused for hidden documents (background tabs and
          // embedded previews). Fall back to a timeout so progress still saves.
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            ticking = false;
            updateReaderFoot();
            saveReaderProgress(false);
            refreshCompanionContext();
          };
          if (window.requestAnimationFrame) requestAnimationFrame(done);
          else setTimeout(done, 16);
          // Safety net: if rAF never fires (hidden document), run within 300ms.
          setTimeout(done, 300);
        }
      }
    }, { passive: true });
    body.addEventListener("mouseup", onReaderSelect);
  }
  if (!window.__sfReaderSelBound) {
    window.__sfReaderSelBound = true;
    document.addEventListener("pointerdown", (e) => {
      const bar = document.querySelector("[data-r-selbar]");
      if (bar && !bar.hidden && !(e.target.closest && e.target.closest("[data-r-selbar]"))) {
        bar.hidden = true;
        const sel = window.getSelection();
        try {
          if (sel && sel.rangeCount && !document.querySelector("[data-r-body]")?.contains(sel.anchorNode)) sel.removeAllRanges();
        } catch { /* ignore */ }
      }
    });
    // A reader closed by tab close / refresh must not lose the last positions.
    // (After a full wipe, nothing may write again — see haltPersist.)
    window.addEventListener("beforeunload", () => {
      try {
        if (isPersistHalted()) return;
        if (R && R.kind === "text") saveReaderProgress(true);
      } catch { /* ignore */ }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        try {
          if (R && R.kind === "text") saveReaderProgress(true);
        } catch { /* ignore */ }
      }
    });
  }
}
function stepSection(dir) {
  const body = readerBodyEl();
  if (!body || !R) return;
  const nodes = body.querySelectorAll("[data-sec]");
  const y = body.scrollTop;
  let target = dir > 0 ? nodes.length - 1 : 0;
  if (dir > 0) {
    for (const n of nodes) {
      if (n.offsetTop > y + 8) { target = n; break; }
    }
    body.scrollTop = typeof target === "number" ? body.scrollHeight : target.offsetTop;
  } else {
    let prev = null;
    for (const n of nodes) {
      if (n.offsetTop < y - 8) prev = n;
      else break;
    }
    body.scrollTop = prev ? prev.offsetTop : 0;
  }
  updateReaderFoot();
  saveReaderProgress(true);
}
function applyReaderPanel() {
  const side = document.querySelector("[data-r-side]");
  if (!side || !R) return;
  $$("[data-r-panel]").forEach((b) => b.classList.toggle("on", R.panel === b.dataset.rPanel));
  if (!R.panel) {
    side.hidden = true;
    side.innerHTML = "";
    return;
  }
  side.hidden = false;
  if (R.panel === "toc") renderTocPanel(side);
  else if (R.panel === "search") renderSearchPanel(side);
  else if (R.panel === "marks") renderMarksPanel(side);
  else if (R.panel === "notes") renderNotesPanel(side);
  else if (R.panel === "settings") renderSettingsPanel(side);
  else if (R.panel === "companion") {
    // The companion reads its book/context/highlights from side.__compMod;
    // rebuild it on every open so the context tracks the current section.
    side.__compMod = buildCompanionMod();
    paintCompanion(side);
  }
}
function companionContextFor() {
  if (!R) return { text: "", title: "this section" };
  if (R.askCtx) return { text: R.askCtx, title: "your selection" };
  const cur = currentLocator();
  const sec = R.sections[cur.sec] || { title: null, paras: [] };
  return { text: sec.paras.join(" "), title: sec.title || `Section ${cur.sec + 1}` };
}
function buildCompanionMod() {
  const { text, title } = companionContextFor();
  return {
    bookId: R.id,
    ctx: title,
    ctxShort: title,
    sectionTitle: title,
    contextText: text,
    highlights: (R.kind === "text" ? localStore(R.id).highlights : []) || [],
    onClose: () => {
      R.askCtx = null;
      R.panel = null;
      applyReaderPanel();
    },
  };
}
function refreshCompanionContext() {
  if (!R || R.panel !== "companion") return;
  const side = document.querySelector("[data-r-side]");
  if (!side || !side.__compMod) return;
  Object.assign(side.__compMod, buildCompanionMod());
}
function sideHead(title) {
  return `<div class="section-row"><h3>${esc(title)}</h3><button class="ghost" data-r-closepanel>Close</button></div>`;
}
function bindPanelClose(side) {
  const c = side.querySelector("[data-r-closepanel]");
  if (c) c.onclick = () => {
    R.panel = null;
    applyReaderPanel();
  };
}
function renderTocPanel(side) {
  side.innerHTML = `${sideHead("Contents")}${R.kind !== "text" ? '<p class="muted">Contents are available for text books.</p>' : `<div class="reader-list">${R.sections.map((s, i) => `<button class="reader-row" data-r-goto="${i}"><span>${esc(s.title || "Section " + (i + 1))}</span></button>`).join("")}</div>`}`;
  bindPanelClose(side);
  side.querySelectorAll("[data-r-goto]").forEach((b) => (b.onclick = () => {
    jumpToLocator(+b.dataset.rGoto, 0);
  }));
}
function renderSearchPanel(side) {
  side.innerHTML = `${sideHead("Search in book")}<div class="input-row"><input class="input" data-r-q placeholder="Find in this book…" aria-label="Search in book" value="${esc(R.search.q)}"><button class="primary" data-r-find>Find</button></div><div data-r-hits></div>`;
  bindPanelClose(side);
  const input = side.querySelector("[data-r-q]");
  const run = () => {
    R.search.q = input.value.trim();
    R.search.idx = -1;
    applySearchMarks();
    paintSearchHits(side);
  };
  side.querySelector("[data-r-find]").onclick = run;
  input.onkeydown = (e) => {
    if (e.key === "Enter") run();
  };
  paintSearchHits(side);
  setTimeout(() => input.focus(), 0);
}
function paintSearchHits(side) {
  const box = side.querySelector("[data-r-hits]");
  if (!box) return;
  const { hits, q } = R.search;
  if (!q) {
    box.innerHTML = '<p class="muted">Type a word or phrase above.</p>';
    return;
  }
  if (!hits.length) {
    box.innerHTML = '<p class="muted">No matches in this book.</p>';
    return;
  }
  box.innerHTML = `<div class="section-row"><span class="muted">${hits.length} match${hits.length === 1 ? "" : "es"}</span><span><button class="ghost" data-r-hitprev>‹</button> <button class="ghost" data-r-hitnext>›</button></span></div>`;
  box.querySelector("[data-r-hitprev]").onclick = () => stepSearchHit(-1);
  box.querySelector("[data-r-hitnext]").onclick = () => stepSearchHit(1);
}
function applySearchMarks() {
  document.querySelectorAll(".search-hit").forEach((m) => {
    m.replaceWith(document.createTextNode(m.textContent));
  });
  const body = readerBodyEl();
  R.search.hits = [];
  R.search.idx = -1;
  if (!body || !R || R.kind !== "text") return;
  const q = R.search.q.trim().toLowerCase();
  if (q.length < 2) return;
  body.querySelectorAll("[data-sec] p").forEach((p) => {
    if (p.querySelector("mark[data-hl]")) return;
    const text = p.textContent;
    const lower = text.toLowerCase();
    let at = 0;
    let found = false;
    const frag = document.createDocumentFragment();
    while (true) {
      const i = lower.indexOf(q, at);
      if (i < 0) break;
      found = true;
      frag.append(document.createTextNode(text.slice(at, i)));
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = text.slice(i, i + q.length);
      R.search.hits.push(mark);
      frag.append(mark);
      at = i + q.length;
    }
    if (found) {
      frag.append(document.createTextNode(text.slice(at)));
      p.replaceChildren(frag);
    }
  });
  applyHighlights();
}
function stepSearchHit(dir) {
  if (!R || !R.search.hits.length) return;
  R.search.idx = (R.search.idx + dir + R.search.hits.length) % R.search.hits.length;
  const m = R.search.hits[R.search.idx];
  document.querySelectorAll(".search-hit.current").forEach((x) => x.classList.remove("current"));
  m.classList.add("current");
  try {
    m.scrollIntoView({ block: "center", behavior: state.reduceMotion ? "auto" : "smooth" });
  } catch {
    /* ignore */
  }
  const side = document.querySelector("[data-r-side]");
  if (side && !side.hidden) paintSearchHits(side);
}
function selContext() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const body = readerBodyEl();
  const range = sel.getRangeAt(0);
  if (!body || !body.contains(range.commonAncestorContainer)) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 2000) return null;
  const full = body.textContent.replace(/\s+/g, " ");
  const at = full.indexOf(text);
  return {
    text,
    prefix: at > 0 ? full.slice(Math.max(0, at - 120), at) : "",
    suffix: at >= 0 ? full.slice(at + text.length, at + text.length + 120) : "",
    rect: range.getBoundingClientRect(),
  };
}
function onReaderSelect() {
  const bar = document.querySelector("[data-r-selbar]");
  if (!bar || !R || R.kind !== "text") return;
  setTimeout(() => {
    const ctx = selContext();
    if (!ctx || !R) {
      bar.hidden = true;
      return;
    }
    R.selCtx = ctx;
    bar.innerHTML = `<div class="selbar-row"><span class="muted">Highlight:</span>${BOOK_COLORS.map((c) => `<button class="hl-dot hl-${c}" data-sel-hl="${c}" title="Highlight ${c}" aria-label="Highlight ${c}"></button>`).join("")}<button class="ghost" data-sel-note>Note</button><button class="ghost" data-sel-ask>Ask</button></div><div class="selbar-note" data-sel-notebox hidden><textarea class="textarea autogrow" data-sel-notetext rows="2" placeholder="Attach a private note…"></textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button class="ghost" data-sel-notecancel>Cancel</button><button class="primary" data-sel-notesave>Save note</button></div></div>`;
    const r = ctx.rect;
    // The bar is positioned relative to the reader container (position:absolute
    // inside it), so it needs the CONTAINER's coordinates — window.scrollY would
    // double-count the page scroll and push the bar far below the selection.
    const anchor = document.querySelector("[data-reader]") || document.body;
    const anchorRect = anchor.getBoundingClientRect();
    bar.style.top = Math.max(8, r.top - anchorRect.top - 46) + "px";
    bar.hidden = false;
    bar.querySelectorAll("[data-sel-hl]").forEach((b) => (b.onclick = () => {
      addHighlight(b.dataset.selHl, "");
      bar.hidden = true;
    }));
    const noteBox = bar.querySelector("[data-sel-notebox]");
    bar.querySelector("[data-sel-note]").onclick = () => {
      noteBox.hidden = !noteBox.hidden;
      if (!noteBox.hidden) {
        const ta = noteBox.querySelector("[data-sel-notetext]");
        fitTextarea(ta);
        ta.focus();
      }
    };
    bar.querySelector("[data-sel-notecancel]").onclick = () => {
      noteBox.hidden = true;
    };
    bar.querySelector("[data-sel-notesave]").onclick = () => {
      const note = noteBox.querySelector("[data-sel-notetext]").value.trim().slice(0, 4000);
      addHighlight("yellow", note);
      bar.hidden = true;
    };
    bar.querySelector("[data-sel-ask]").onclick = () => {
      bar.hidden = true;
      R.panel = "companion";
      R.askCtx = ctx.text;
      applyReaderPanel();
    };
  }, 10);
}
async function addHighlight(color, note) {
  if (!R || !R.selCtx) return;
  const { text, prefix, suffix } = R.selCtx;
  const store = localStore(R.id);
  const entry = { id: uid(), color, excerpt: text, prefix, suffix, note: note || "", ts: Date.now() };
  store.highlights = [...store.highlights, entry];
  persist();
  if (backendConfigured && state.user) {
    try {
      const { data, error } = await addBookHighlight(R.id, entry);
      if (!error && data && data.id) {
        entry.id = data.id;
        persist();
      }
    } catch {
      /* local copy stands */
    }
  }
  applyHighlights();
  notify(note ? "Note saved" : "Highlighted");
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    /* ignore */
  }
}
function applyHighlights() {
  const body = readerBodyEl();
  if (!body || !R || R.kind !== "text") return;
  const store = localStore(R.id);
  if (!store.highlights.length) return;
  body.querySelectorAll("[data-sec]").forEach((sec) => {
    sec.querySelectorAll("p").forEach((p) => {
      if (p.querySelector("mark[data-hl]")) return;
      const text = p.textContent;
      for (const h of store.highlights) {
        if (!h.excerpt || !text.includes(h.excerpt)) continue;
        if (h.prefix && !text.includes(h.prefix.slice(-40))) continue;
        const i = text.indexOf(h.excerpt);
        if (i < 0) continue;
        const frag = document.createDocumentFragment();
        frag.append(document.createTextNode(text.slice(0, i)));
        const mark = document.createElement("mark");
        mark.className = `hl-${h.color || "yellow"}`;
        mark.dataset.hl = h.id;
        mark.textContent = text.slice(i, i + h.excerpt.length);
        mark.title = h.note ? "Has note — see Annotations" : "Highlighted";
        frag.append(mark);
        frag.append(document.createTextNode(text.slice(i + h.excerpt.length)));
        p.replaceChildren(frag);
        break;
      }
    });
  });
}
function scrollHlIntoView(id) {
  const m = document.querySelector(`mark[data-hl="${id}"]`);
  if (!m) {
    notify("That passage is not on screen — it may be in another section");
    return;
  }
  try {
    m.scrollIntoView({ block: "center", behavior: state.reduceMotion ? "auto" : "smooth" });
  } catch {
    /* ignore */
  }
  m.classList.add("hl-flash");
  setTimeout(() => m.classList.remove("hl-flash"), 1200);
}
function renderMarksPanel(side) {
  const store = localStore(R.id);
  side.innerHTML = `${sideHead("Bookmarks")}<button class="primary" data-r-addmark style="margin-bottom:12px">Bookmark this spot</button>${store.bookmarks.length ? `<div class="reader-list">${store.bookmarks.map((b) => `<div class="reader-row"><button class="reader-row-main" data-r-jumpmark="${b.id}"><span>${esc(b.label)}</span></button><button class="ghost" data-r-delmark="${b.id}">Remove</button></div>`).join("")}</div>` : '<p class="muted">No bookmarks yet. Use the button above — reopening the book offers them instantly.</p>'}`;
  bindPanelClose(side);
  side.querySelector("[data-r-addmark]").onclick = async () => {
    const loc = currentLocator();
    const pct = Math.round(bookProgressOf(R.id) * 100);
    const entry = { id: uid(), label: `Page ${pct}% · §${loc.sec + 1}`, sec: loc.sec, frac: loc.frac, ts: Date.now() };
    store.bookmarks = [...store.bookmarks, entry];
    persist();
    if (backendConfigured && state.user) {
      try {
        const { data, error } = await addBookBookmark(R.id, entry.label, `sec=${loc.sec} frac=${loc.frac.toFixed(3)}`);
        if (!error && data && data.id) {
          entry.id = data.id;
          persist();
        }
      } catch {
        /* local copy stands */
      }
    }
    notify("Bookmarked");
    renderMarksPanel(side);
  };
  side.querySelectorAll("[data-r-jumpmark]").forEach((b) => (b.onclick = () => {
    const m = store.bookmarks.find((x) => x.id === b.dataset.rJumpmark);
    if (m) jumpToLocator(m.sec || 0, m.frac || 0);
  }));
  side.querySelectorAll("[data-r-delmark]").forEach((b) => (b.onclick = async () => {
    const id = b.dataset.rDelmark;
    store.bookmarks = store.bookmarks.filter((x) => x.id !== id);
    persist();
    if (backendConfigured && state.user) {
      try {
        await removeBookBookmark(id);
      } catch {
        /* ignore */
      }
    }
    renderMarksPanel(side);
  }));
}
function renderNotesPanel(side) {
  const store = localStore(R.id);
  const items = [...store.highlights].reverse();
  side.innerHTML = `${sideHead("Notes & highlights")}${items.length ? `<div class="reader-list">${items.map((h) => `<div class="reader-note"><button class="reader-note-excerpt hl-${h.color || "yellow"}" data-r-jumphl="${h.id}">${esc(h.excerpt.slice(0, 140))}${h.excerpt.length > 140 ? "…" : ""}</button>${h.note ? `<p>${esc(h.note)}</p>` : '<p class="muted">No note attached.</p>'}<div class="reader-note-actions"><button class="ghost" data-r-editnote="${h.id}">${h.note ? "Edit note" : "Add note"}</button><button class="ghost" data-r-delhl="${h.id}">Delete</button></div><div data-r-noteform="${h.id}" hidden><textarea class="textarea autogrow" data-r-notetext rows="2">${esc(h.note || "")}</textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button class="ghost" data-r-notecancel="${h.id}">Cancel</button><button class="primary" data-r-notesave="${h.id}">Save</button></div></div></div>`).join("")}</div>` : '<p class="muted">Select any passage to highlight it or attach a private note. Everything here is yours alone.</p>'}`;
  bindPanelClose(side);
  side.querySelectorAll("[data-r-jumphl]").forEach((b) => (b.onclick = () => scrollHlIntoView(b.dataset.rJumphl)));
  side.querySelectorAll("[data-r-editnote]").forEach((b) => (b.onclick = () => {
    const form = side.querySelector(`[data-r-noteform="${b.dataset.rEditnote}"]`);
    if (form) {
      form.hidden = !form.hidden;
      if (!form.hidden) fitTextarea(form.querySelector("[data-r-notetext]"));
    }
  }));
  side.querySelectorAll("[data-r-notecancel]").forEach((b) => (b.onclick = () => {
    side.querySelector(`[data-r-noteform="${b.dataset.rNotecancel}"]`).hidden = true;
  }));
  side.querySelectorAll("[data-r-notesave]").forEach((b) => (b.onclick = async () => {
    const id = b.dataset.rNotesave;
    const h = store.highlights.find((x) => x.id === id);
    if (!h) return;
    h.note = side.querySelector(`[data-r-noteform="${id}"] [data-r-notetext]`).value.trim().slice(0, 4000);
    persist();
    if (backendConfigured && state.user) {
      try {
        await updateBookHighlight(id, { note: h.note });
      } catch {
        /* local copy stands */
      }
    }
    notify("Note saved");
    renderNotesPanel(side);
    applyHighlights();
  }));
  side.querySelectorAll("[data-r-delhl]").forEach((b) => (b.onclick = async () => {
    const id = b.dataset.rDelhl;
    store.highlights = store.highlights.filter((x) => x.id !== id);
    persist();
    if (backendConfigured && state.user) {
      try {
        await removeBookHighlight(id);
      } catch {
        /* ignore */
      }
    }
    renderReaderBody();
    renderNotesPanel(side);
  }));
}
function renderSettingsPanel(side) {
  const s = R.settings;
  side.innerHTML = `${sideHead("Reading settings")}
  <label class="field-label">Font size (${s.fontSize}px)<input type="range" min="14" max="24" step="1" value="${s.fontSize}" data-r-set-font aria-label="Font size"></label>
  <label class="field-label">Line spacing<input type="range" min="1.4" max="2.2" step="0.1" value="${s.lineHeight}" data-r-set-lh aria-label="Line spacing"></label>
  <label class="field-label">Reading width<select class="select" data-r-set-width><option value="narrow"${s.width === "narrow" ? " selected" : ""}>Narrow</option><option value="medium"${s.width === "medium" ? " selected" : ""}>Medium</option><option value="wide"${s.width === "wide" ? " selected" : ""}>Wide</option></select></label>
  <label class="field-label">Theme<select class="select" data-r-set-theme><option value="auto"${s.theme === "auto" ? " selected" : ""}>Match app theme</option><option value="light"${s.theme === "light" ? " selected" : ""}>Light</option><option value="dark"${s.theme === "dark" ? " selected" : ""}>Dark</option><option value="sepia"${s.theme === "sepia" ? " selected" : ""}>Sepia</option></select></label>
  <label class="field-label">Alignment<select class="select" data-r-set-align><option value="left"${s.align !== "justify" ? " selected" : ""}>Left</option><option value="justify"${s.align === "justify" ? " selected" : ""}>Justified</option></select></label>`;
  bindPanelClose(side);
  const restyle = () => {
    saveReaderSettings(R.settings);
    renderReader();
    R.panel = "settings";
    applyReaderPanel();
  };
  const fontInput = side.querySelector("[data-r-set-font]");
  fontInput.oninput = (e) => {
    R.settings.fontSize = +e.target.value || 18;
    const body = readerBodyEl();
    if (body) body.style.setProperty("--read-fs", R.settings.fontSize + "px");
    fontInput.closest("label").firstChild.textContent = `Font size (${R.settings.fontSize}px)`;
  };
  fontInput.onchange = () => restyle();
  const lhInput = side.querySelector("[data-r-set-lh]");
  lhInput.oninput = (e) => {
    R.settings.lineHeight = +e.target.value || 1.7;
    const body = readerBodyEl();
    if (body) body.style.setProperty("--read-lh", R.settings.lineHeight);
  };
  lhInput.onchange = () => restyle();
  side.querySelector("[data-r-set-width]").onchange = (e) => {
    R.settings.width = e.target.value;
    restyle();
  };
  side.querySelector("[data-r-set-theme]").onchange = (e) => {
    R.settings.theme = e.target.value;
    restyle();
  };
  side.querySelector("[data-r-set-align]").onchange = (e) => {
    R.settings.align = e.target.value;
    restyle();
  };
}
