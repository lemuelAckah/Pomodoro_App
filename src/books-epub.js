/* books-epub.js — dependency-free EPUB reader backend.
 *
 * Parses EPUB 2/3 with only platform APIs: manual ZIP central-directory
 * parsing, DecompressionStream for deflated entries, DOMParser for OPF/NCX/
 * XHTML. No jszip/epub.js (keeps the bundle lean and the free plan intact).
 *
 * Output chapters convert to the reader's { title, paras[] } section shape
 * (paras are strings, or { img } blocks rendered separately), so the whole
 * existing pipeline — paint engine, highlights, bookmarks, search, progress,
 * companion — works unchanged. Chapter images resolve to object URLs owned
 * by the parse result (caller revokes via releaseEpub()).
 */

const ZIP_EOCD_SIG = 0x06050b50;
const ZIP_CENTRAL_SIG = 0x02014b50;

export function epubSupported() {
  return typeof DOMParser !== "undefined" && typeof DecompressionStream !== "undefined";
}

function readU16(view, off) { return view.getUint16(off, true); }
function readU32(view, off) { return view.getUint32(off, true); }

function textDecoder() {
  return new TextDecoder("utf-8", { fatal: false });
}

// Exported for headless tests: pure ZIP central-directory parsing.
export function parseZipCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = bytes.length;
  // EOCD lives in the last 64KB (+22 bytes).
  const scanStart = Math.max(0, len - 65558);
  let eocd = -1;
  for (let i = len - 22; i >= scanStart; i--) {
    if (readU32(view, i) === ZIP_EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a ZIP archive");
  const count = readU16(view, eocd + 10);
  let off = readU32(view, eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (readU32(view, off) !== ZIP_CENTRAL_SIG) throw new Error("Corrupt ZIP directory");
    const method = readU16(view, off + 10);
    const compSize = readU32(view, off + 20);
    const nameLen = readU16(view, off + 28);
    const extraLen = readU16(view, off + 30);
    const commentLen = readU16(view, off + 32);
    const headerOff = readU32(view, off + 42);
    const nameBytes = bytes.subarray(off + 46, off + 46 + nameLen);
    entries.push({
      name: textDecoder().decode(nameBytes),
      method, compSize, headerOff,
    });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function localDataOffset(bytes, headerOff) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLen = readU16(view, headerOff + 26);
  const extraLen = readU16(view, headerOff + 28);
  return headerOff + 30 + nameLen + extraLen;
}

export async function inflateZipEntry(bytes, entry) {
  const start = localDataOffset(bytes, entry.headerOff);
  const slice = bytes.subarray(start, start + entry.compSize);
  if (entry.method === 0) return slice;
  if (entry.method !== 8) throw new Error(`Unsupported ZIP method ${entry.method}`);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress EPUB files");
  }
  const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function resolveZipPath(base, href) {
  const h = String(href || "").split("#")[0];
  if (!h) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return ""; // remote URL — never fetch
  const baseParts = String(base || "").split("/").slice(0, -1);
  const out = [];
  for (const part of [...baseParts, ...h.split("/")]) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function domParse(xml, type) {
  const doc = new DOMParser().parseFromString(xml, type || "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Unparseable EPUB metadata");
  return doc;
}

function opfNs(doc) {
  const root = doc.documentElement;
  const ns = root.namespaceURI || "http://www.idpf.org/2007/opf";
  return ns;
}

export async function parseEpub(blob) {
  if (!blob) throw new Error("No file to read");
  if (typeof DOMParser === "undefined" || typeof DecompressionStream === "undefined") {
    throw new Error("EPUB reading needs a modern browser (DOMParser + DecompressionStream)");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("Not an EPUB file (bad ZIP signature)");
  }
  const entries = parseZipCentralDirectory(bytes);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const readText = async (name) => {
    const e = byName.get(name);
    if (!e) return null;
    return textDecoder().decode(await inflateZipEntry(bytes, e));
  };
  const readBlob = async (name, mime) => {
    const e = byName.get(name);
    if (!e) return null;
    const data = await inflateZipEntry(bytes, e);
    return new Blob([data], { type: mime || "application/octet-stream" });
  };
  // META-INF/container.xml → OPF
  const containerXml = await readText("META-INF/container.xml");
  if (!containerXml) throw new Error("Not an EPUB file (missing container)");
  const container = domParse(containerXml);
  const rootfile = container.querySelector("rootfile");
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) throw new Error("Corrupt EPUB (no package document)");
  const opfXml = await readText(opfPath);
  if (!opfXml) throw new Error("Corrupt EPUB (package document unreadable)");
  const opf = domParse(opfXml);
  const NS = opfNs(opf);
  const pick = (parent, tag) => {
    const list = parent.getElementsByTagNameNS(NS, tag);
    return list.length ? list[0] : parent.getElementsByTagName(tag)[0] || null;
  };
  const pickAll = (parent, tag) => {
    const list = parent.getElementsByTagNameNS(NS, tag);
    return list.length ? [...list] : [...parent.getElementsByTagName(tag)];
  };
  const metadata = pick(opf, "metadata");
  const text = (el, tag) => pick(el, tag)?.textContent?.trim() || "";
  const title = text(metadata, "title") || "";
  const author = text(metadata, "creator") || "";
  const manifest = pick(opf, "manifest");
  const items = {};
  if (manifest) {
    for (const it of pickAll(manifest, "item")) {
      const id = it.getAttribute("id");
      if (id) items[id] = { href: it.getAttribute("href") || "", type: it.getAttribute("media-type") || "", props: it.getAttribute("properties") || "" };
    }
  }
  const spine = pick(opf, "spine");
  const spineRefs = spine ? pickAll(spine, "itemref").map((r) => r.getAttribute("idref")).filter((id) => id && items[id]) : [];
  if (!spineRefs.length) throw new Error("Corrupt EPUB (empty spine)");
  // Chapter labels: EPUB3 nav doc, else NCX, else filenames.
  const labels = {};
  try {
    const navItem = Object.values(items).find((it) => (it.props || "").split(/\s+/).includes("nav"));
    if (navItem) {
      const navPath = resolveZipPath(opfPath, navItem.href);
      const navXml = await readText(navPath);
      if (navXml) {
        const navDoc = new DOMParser().parseFromString(navXml, "application/xhtml+xml");
        const navs = [...navDoc.getElementsByTagName("nav")];
        const toc = navs.find((n) => n.getAttribute("epub:type") === "toc" || (n.getAttribute("type") || "").includes("toc")) || navs[0];
        if (toc) {
          for (const a of toc.getElementsByTagName("a")) {
            const href = a.getAttribute("href") || "";
            const key = resolveZipPath(navPath, href);
            if (key && !(key in labels)) labels[key] = (a.textContent || "").trim().slice(0, 120);
          }
        }
      }
    } else {
      const tocId = spine.getAttribute("toc");
      const ncxItem = tocId && items[tocId];
      if (ncxItem) {
        const ncxPath = resolveZipPath(opfPath, ncxItem.href);
        const ncxXml = await readText(ncxPath);
        if (ncxXml) {
          const ncx = domParse(ncxXml);
          for (const np of ncx.getElementsByTagName("navPoint")) {
            const t = np.getElementsByTagName("text")[0]?.textContent?.trim().slice(0, 120) || "";
            const src = np.getElementsByTagName("content")[0]?.getAttribute("src") || "";
            const key = resolveZipPath(ncxPath, src);
            if (t && key && !(key in labels)) labels[key] = t;
          }
        }
      }
    }
  } catch {
    /* labels are best-effort */
  }
  const chapters = [];
  let coverBlob = null;
  try {
    const coverItem = Object.values(items).find((it) => (it.props || "").split(/\s+/).includes("cover-image"))
      || Object.values(items).find((it) => /cover[^/]*\.(jpe?g|png|webp|gif)$/i.test(it.href));
    if (coverItem) {
      const cp = resolveZipPath(opfPath, coverItem.href);
      coverBlob = await readBlob(cp, coverItem.type);
    }
  } catch {
    /* no cover — fine */
  }
  for (const ref of spineRefs) {
    const item = items[ref];
    const path = resolveZipPath(opfPath, item.href);
    let html = "";
    try {
      html = textDecoder().decode(await inflateZipEntry(bytes, byName.get(path)));
    } catch {
      continue; // unreadable chapter: skip, keep the rest of the book
    }
    const { title: chTitle, sections, imageHrefs } = chapterToSections(html, path);
    chapters.push({
      id: ref,
      path,
      title: labels[path] || chTitle || item.href.split("/").pop(),
      sections,
      imageHrefs,
    });
  }
  if (!chapters.some((c) => c.sections.length)) throw new Error("No readable chapters found in this EPUB");
  // Lazily-resolved chapter images (object URLs minted on demand, released
  // together — the reader resolves only chapters inside its render window).
  const mintedUrls = new Set();
  const resolveImages = async (chapter) => {
    const map = new Map();
    for (const href of chapter.imageHrefs || []) {
      try {
        const p = resolveZipPath(chapter.path, href);
        const blob = await readBlob(p, guessImageMime(href));
        if (blob) {
          const url = URL.createObjectURL(blob);
          mintedUrls.add(url);
          map.set(href, url);
        }
      } catch {
        /* single broken image never breaks the chapter */
      }
    }
    return map;
  };
  const release = () => {
    for (const u of mintedUrls) {
      try { URL.revokeObjectURL(u); } catch { /* ignore */ }
    }
    mintedUrls.clear();
  };
  return { title, author, chapters, coverBlob, resolveImages, release };
}

function guessImageMime(href) {
  const h = String(href || "").toLowerCase();
  if (h.endsWith(".png")) return "image/png";
  if (h.endsWith(".gif")) return "image/gif";
  if (h.endsWith(".webp")) return "image/webp";
  if (h.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

const PARA_CAP = 4000;

// Convert one chapter document into reader sections. Text lands in the same
// { title, paras[] } shape as text books (paras are strings, or { img }
// blocks rendered separately and skipped by the paint engine).
function chapterToSections(html, path) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc || !doc.body) return { title: "", sections: [], images: [] };
  for (const bad of doc.body.querySelectorAll("script, style, noscript, template")) bad.remove();
  for (const el of doc.body.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    }
    if ((el.tagName === "A") && /^\s*javascript:/i.test(el.getAttribute("href") || "")) {
      el.removeAttribute("href");
    }
  }
  const docTitle = (doc.querySelector("title")?.textContent || "").trim().slice(0, 120);
  const sections = [];
  let cur = { title: null, paras: [] };
  const imageHrefs = [];
  const pushParas = (text) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    for (let i = 0; i < clean.length; i += PARA_CAP) {
      cur.paras.push(clean.slice(i, i + PARA_CAP));
    }
  };
  const pushImg = (src) => {
    if (!src) return;
    if (/^https?:/i.test(src)) return; // remote art is never fetched (offline-first + private)
    if (/^data:/i.test(src) && !/^data:image\//i.test(src)) return;
    cur.paras.push({ img: src });
    if (!imageHrefs.includes(src)) imageHrefs.push(src);
  };
  const flushSec = () => {
    if (cur.paras.length || cur.title) sections.push(cur);
  };
  const kids = [...doc.body.children];
  if (!kids.length && doc.body.textContent.trim()) {
    // No block structure at all — treat the whole chapter as flowing text.
    cur.paras.push(...chunkText(doc.body.textContent));
    flushSec();
  } else {
    for (const el of kids) {
      const tag = el.tagName;
      if (/^H[1-3]$/.test(tag)) {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
        flushSec();
        cur = { title: t || null, paras: [] };
      } else if (tag === "IMG") {
        pushImg(el.getAttribute("src") || "");
      } else if (tag === "HR" || tag === "BR") {
        continue;
      } else {
        // Paragraph-ish block: harvest text, plus any nested images.
        for (const img of el.querySelectorAll("img")) {
          pushImg(img.getAttribute("src") || "");
          img.remove();
        }
        pushParas(el.textContent);
      }
    }
    flushSec();
  }
  return { title: docTitle, path, sections, imageHrefs };
}

function chunkText(text) {
  const out = [];
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < clean.length; i += PARA_CAP) {
    const part = clean.slice(i, i + PARA_CAP);
    if (part) out.push(part);
  }
  return out;
}
