/* books-format.js — document pipeline for uploaded books.
 *
 * Every upload is normalized into a clean, structured Markdown document
 * (title page → chapters → paragraphs) that the reader renders beautifully
 * and that highlights stick to. From that same canonical document we can
 * export:
 *   · .md  — plain Markdown, opens anywhere
 *   · .docx — a real Word document (Office Open XML built by hand: the app
 *     ships zero heavyweight dependencies on purpose, and DOCX is just a
 *     ZIP of XML parts — we already have a ZIP reader/writer core in
 *     books-epub.js, so a lightweight writer is ~80 lines)
 *
 * Deterministic, offline, and formatting never mutates the original file —
 * the canonical .md is stored alongside it.
 */

// --- ZIP writer (store-only; DOCX readers accept stored entries) ------------

function crc32(bytes) {
  let c = crc32.table
  if (!c) {
    c = crc32.table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let v = n
      for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1
      c[n] = v >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++)
    crc = c[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function u16(arr, v) {
  arr.push(v & 0xff, (v >>> 8) & 0xff)
}
function u32(arr, v) {
  arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
}

// files: [{ name, data:Uint8Array }]
export function zipStore(files) {
  const enc = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const nameB = enc.encode(f.name)
    const data = f.data
    const crc = crc32(data)
    const lh = []
    u32(lh, 0x04034b50)
    u16(lh, 20)
    u16(lh, 0)
    u16(lh, 0)
    u16(lh, 0)
    u16(lh, 0)
    u32(lh, crc)
    u32(lh, data.length)
    u32(lh, data.length)
    u16(lh, nameB.length)
    u16(lh, 0)
    parts.push(new Uint8Array(lh), nameB, data)
    const ch = []
    u32(ch, 0x02014b50)
    u16(ch, 20)
    u16(ch, 20)
    u16(ch, 0)
    u16(ch, 0)
    u16(ch, 0)
    u16(ch, 0)
    u32(ch, crc)
    u32(ch, data.length)
    u32(ch, data.length)
    u16(ch, nameB.length)
    u16(ch, 0)
    u16(ch, 0)
    u16(ch, 0)
    u16(ch, 0)
    u32(ch, 0)
    u32(ch, offset)
    central.push(new Uint8Array(ch), nameB)
    offset += lh.length + nameB.length + data.length
  }
  const cdStart = offset
  let cdSize = 0
  for (const p of central) cdSize += p.length
  const eocd = []
  u32(eocd, 0x06054b50)
  u16(eocd, 0)
  u16(eocd, 0)
  u16(eocd, files.length)
  u16(eocd, files.length)
  u32(eocd, cdSize)
  u32(eocd, cdStart)
  u16(eocd, 0)
  const all = [...parts, ...central, new Uint8Array(eocd)]
  return new Blob(all, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  })
}

function xmlEscape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// --- Markdown → DOCX ---------------------------------------------------------

const W_NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`

// Named palette — sage headings, gold accents, warm ink (matches the app).
const DOCX_INK = "26301F"
const DOCX_SAGE = "3F6B52"
const DOCX_GOLD = "B8862A"
const DOCX_MUTED = "5C6B60"

function docxRPr(opts = {}) {
  const bits = []
  if (opts.bold) bits.push("<w:b/>")
  if (opts.italic) bits.push("<w:i/>")
  if (opts.color) bits.push(`<w:color w:val="${opts.color}"/>`)
  if (opts.size)
    bits.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`)
  if (opts.caps) bits.push("<w:caps/>")
  if (opts.spacing) bits.push(`<w:spacing w:val="${opts.spacing}"/>`)
  if (!bits.length) return ""
  return `<w:rPr>${bits.join("")}</w:rPr>`
}

function docxRun(text, opts = {}) {
  return `<w:r>${docxRPr(opts)}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
}

function docxPara(runs, pPr = "") {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs}</w:p>`
}

// Inline **bold**, *italic*, `code` support.
function inlineRuns(text, base = {}) {
  const out = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(docxRun(text.slice(last, m.index), base))
    const tok = m[0]
    if (tok.startsWith("**"))
      out.push(docxRun(tok.slice(2, -2), { ...base, bold: true }))
    else if (tok.startsWith("`"))
      out.push(docxRun(tok.slice(1, -1), { ...base, color: DOCX_SAGE }))
    else out.push(docxRun(tok.slice(1, -1), { ...base, italic: true }))
    last = m.index + tok.length
  }
  if (last < text.length) out.push(docxRun(text.slice(last), base))
  return out.join("")
}

// Named Word styles: Title page, chapter page-breaks, sage headings, gold
// quotes — so the export opens looking designed, not like plain text.
function docxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
<w:docDefaults>
  <w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>
    <w:sz w:val="23"/><w:szCs w:val="23"/>
    <w:color w:val="${DOCX_INK}"/>
    <w:lang w:val="en-US"/>
  </w:rPr></w:rPrDefault>
  <w:pPrDefault><w:pPr>
    <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
  </w:pPr></w:pPrDefault>
</w:docDefaults>

<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
  <w:name w:val="Normal"/><w:qFormat/>
</w:style>

<w:style w:type="paragraph" w:styleId="Title">
  <w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Subtitle"/><w:qFormat/>
  <w:pPr><w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/></w:pPr>
  <w:rPr><w:b/><w:color w:val="${DOCX_SAGE}"/><w:sz w:val="56"/><w:szCs w:val="56"/><w:spacing w:val="10"/></w:rPr>
</w:style>

<w:style w:type="paragraph" w:styleId="Subtitle">
  <w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
  <w:pPr><w:spacing w:after="80"/><w:jc w:val="center"/></w:pPr>
  <w:rPr><w:i/><w:color w:val="${DOCX_MUTED}"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>
</w:style>

<w:style w:type="paragraph" w:styleId="Heading1">
  <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="0" w:after="240"/><w:outlineLvl w:val="0"/><w:jc w:val="left"/></w:pPr>
  <w:rPr><w:b/><w:color w:val="${DOCX_SAGE}"/><w:sz w:val="40"/><w:szCs w:val="40"/><w:spacing w:val="8"/></w:rPr>
</w:style>

<w:style w:type="paragraph" w:styleId="Heading2">
  <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160"/><w:outlineLvl w:val="1"/></w:pPr>
  <w:rPr><w:b/><w:color w:val="${DOCX_SAGE}"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr>
</w:style>

<w:style w:type="paragraph" w:styleId="Heading3">
  <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="2"/></w:pPr>
  <w:rPr><w:b/><w:color w:val="${DOCX_INK}"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>
</w:style>

<w:style w:type="paragraph" w:styleId="Quote">
  <w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
  <w:pPr>
    <w:spacing w:before="120" w:after="160"/>
    <w:ind w:left="567" w:right="567"/>
    <w:jc w:val="left"/>
    <w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="${DOCX_GOLD}"/></w:pBdr>
  </w:pPr>
  <w:rPr><w:i/><w:color w:val="${DOCX_MUTED}"/></w:rPr>
</w:style>

<w:style w:type="paragraph" w:styleId="Ornament">
  <w:name w:val="Ornament"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
  <w:pPr><w:spacing w:before="200" w:after="200"/><w:jc w:val="center"/></w:pPr>
  <w:rPr><w:color w:val="${DOCX_GOLD}"/><w:sz w:val="24"/></w:rPr>
</w:style>

<w:style w:type="paragraph" w:styleId="ListParagraph">
  <w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:spacing w:after="80"/><w:ind w:left="720" w:hanging="360"/></w:pPr>
</w:style>
</w:styles>`
}

function docxStyleP(styleId, runs) {
  return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>${runs}</w:p>`
}

// md: canonical markdown string, meta: { title, author }
export function markdownToDocxBlob(md, meta = {}) {
  const title = String(meta.title || "Book").slice(0, 200)
  const author = String(meta.author || "Unknown author").slice(0, 200)
  const src = String(md || "")
  const srcLines = src.split("\n")

  // Detect a leading `# Title` (+ optional *author*) so we don't double-title;
  // those lines become the styled title page instead of a body heading.
  let i = 0
  const skipBlank = () => {
    while (i < srcLines.length && !srcLines[i].trim()) i++
  }
  skipBlank()
  let bodyTitle = title
  let bodyAuthor = author
  if (i < srcLines.length && /^#\s+/.test(srcLines[i])) {
    bodyTitle = srcLines[i].replace(/^#\s+/, "").trim() || title
    i++
    skipBlank()
    if (i < srcLines.length && /^\*[^*]+\*$/.test(srcLines[i].trim())) {
      const a = srcLines[i].trim().slice(1, -1).trim()
      if (a && a !== "Unknown author") bodyAuthor = a
      i++
      skipBlank()
    }
    if (i < srcLines.length && /^\s*(---|___|\*\*\*)\s*$/.test(srcLines[i])) i++
  }

  // Title page: sage title, muted author, gold ornament, then a page break
  // (Heading1's pageBreakBefore lands body content on page 2).
  const titlePage =
    docxStyleP(
      "Title",
      docxRun(bodyTitle, {
        bold: true,
        color: DOCX_SAGE,
        size: 56,
        spacing: 10,
      }),
    ) +
    docxStyleP(
      "Subtitle",
      docxRun(bodyAuthor, { italic: true, color: DOCX_MUTED, size: 26 }),
    ) +
    docxStyleP("Ornament", docxRun("◆  ◆  ◆", { color: DOCX_GOLD, size: 24 })) +
    docxStyleP(
      "Normal",
      docxRun("Exported from StudyFlow", {
        italic: true,
        color: DOCX_MUTED,
        size: 20,
      }),
    )

  const paras = []
  for (let j = i; j < srcLines.length; j++) {
    const line = srcLines[j].replace(/\s+$/, "")
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const text = h[2].trim()
      if (!text) continue
      // Body chapters start at ## (title page ate the #), map into Word styles.
      const style =
        level <= 2 ? "Heading1" : level === 3 ? "Heading2" : "Heading3"
      paras.push(
        docxStyleP(
          style,
          inlineRuns(text, {
            bold: true,
            size: level <= 2 ? 40 : level === 3 ? 30 : 26,
          }),
        ),
      )
    } else if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) {
      paras.push(
        docxStyleP(
          "Ornament",
          docxRun("·  ·  ·", { color: DOCX_GOLD, size: 24 }),
        ),
      )
    } else if (/^>\s?/.test(line)) {
      paras.push(
        docxStyleP(
          "Quote",
          inlineRuns(line.replace(/^>\s?/, ""), {
            italic: true,
            color: DOCX_MUTED,
          }),
        ),
      )
    } else if (/^\s*[-*+]\s+/.test(line)) {
      const text = line.replace(/^\s*[-*+]\s+/, "")
      paras.push(
        docxPara(
          docxRun("•  ", { color: DOCX_GOLD, bold: true }) + inlineRuns(text),
          `<w:pStyle w:val="ListParagraph"/>`,
        ),
      )
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const m = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
      paras.push(
        docxPara(
          docxRun(`${m[1]}.  `, { bold: true, color: DOCX_SAGE }) +
            inlineRuns(m[2]),
          `<w:pStyle w:val="ListParagraph"/>`,
        ),
      )
    } else if (!line.trim()) {
      // spacing is style-driven — skip doubled blanks
    } else {
      paras.push(
        docxPara(
          inlineRuns(line),
          `<w:spacing w:after="160"/><w:jc w:val="both"/>`,
        ),
      )
    }
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>
${titlePage}
${paras.join("\n")}
<w:sectPr>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
  <w:cols w:space="720"/>
  <w:docGrid w:linePitch="360"/>
</w:sectPr>
</w:body></w:document>`

  const stylesXml = docxStylesXml()

  const enc = new TextEncoder()
  const t = (s) => enc.encode(s)
  return zipStore([
    {
      name: "[Content_Types].xml",
      data: t(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: t(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`),
    },
    {
      name: "word/_rels/document.xml.rels",
      data: t(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    },
    { name: "word/styles.xml", data: t(stylesXml) },
    { name: "word/document.xml", data: t(docXml) },
    {
      name: "docProps/core.xml",
      data: t(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEscape(bodyTitle)}</dc:title>
<dc:creator>${xmlEscape(bodyAuthor)}</dc:creator>
<cp:lastModifiedBy>StudyFlow</cp:lastModifiedBy>
</cp:coreProperties>`),
    },
  ])
}

// --- Raw uploads → canonical Markdown ----------------------------------------

// TXT → Markdown internals
const CHAPTER_WORD_MIN = 2

function titleCase(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/(^|[\s"'(])([a-z])/g, (_, a, b) => a + b.toUpperCase())
}

function cleanLineNoise(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
}

// TXT → Markdown: detect ALL-CAPS / numbered / "Chapter N" headings, drop page
// artifacts, wrap orphan hard-wrapped lines into flowing paragraphs.
export function txtToMarkdown(text, meta = {}) {
  const src = cleanLineNoise(text)
    .split("\n")
    .map((l) => l.trim())
  const out = [
    `# ${meta.title || "Untitled"}`,
    meta.author ? `*${meta.author}*` : "",
    "---",
    "",
  ]
  let para = []
  let prevBlank = true
  let chapterNo = 0
  const flush = () => {
    if (!para.length) return
    out.push(para.join(" "), "")
    para = []
  }
  const headingLike = (t, next) => {
    if (!t || t.length > 90) return null
    if (
      /^(chapter|part|book)\s+([0-9ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
        t,
      )
    )
      return t
    if (
      /^(prologue|epilogue|foreword|preface|introduction|afterword|appendix)\b/i.test(
        t,
      )
    )
      return t
    if (/^chapter\s*\d+/i.test(t)) return t
    if (
      t === t.toUpperCase() &&
      /[A-Z]/.test(t) &&
      t.split(/\s+/).length >= CHAPTER_WORD_MIN &&
      t.length <= 60
    )
      return titleCase(t)
    if (/^\d{1,3}[.:)]\s+\S/.test(t) && next !== undefined) return t
    return null
  }
  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    // Page artifacts
    if (/^(page\s*)?\d{1,4}$/i.test(line) && para.length + out.length > 4)
      continue
    if (/^-{3,}|_{3,}|={3,}$/.test(line) && line.length <= 12) continue
    const h = headingLike(line, src[i + 1])
    if (h && prevBlank) {
      flush()
      chapterNo++
      out.push(`## ${h}`, "")
      prevBlank = true
      continue
    }
    if (!line) {
      flush()
      prevBlank = true
      continue
    }
    // A short line after a blank that ends without punctuation is likely a
    // hard-wrapped heading remainder — keep in same paragraph.
    para.push(line)
    prevBlank = false
  }
  flush()
  return (
    out
      .filter((l, idx, a) => !(l === "" && a[idx - 1] === ""))
      .join("\n")
      .trim() + "\n"
  )
}

// MD → canonical MD: normalize headings to at most ## for chapters, keep the
// rest as-is. The reader already parses #/##/### so this mostly preserves.
export function mdToMarkdown(text, meta = {}) {
  const body = cleanLineNoise(text)
  const head = [
    `# ${meta.title || "Untitled"}`,
    meta.author ? `*${meta.author}*` : "",
    "",
  ]
  // If the source already starts with an H1, don't double-title it.
  if (/^#\s+/.test(body.trim())) return body.trim() + "\n"
  return [...head, body.trim(), ""].join("\n")
}

// EPUB chapter sections (already parsed by books-epub.js) → Markdown.
export function epubSectionsToMarkdown(chapters, meta = {}) {
  const out = [
    `# ${meta.title || "Untitled"}`,
    meta.author ? `*${meta.author}*` : "",
    "---",
    "",
  ]
  let lastChapter = null
  for (const ch of chapters || []) {
    for (const s of ch.sections || []) {
      if (ch.title && ch.title !== lastChapter) {
        out.push(`## ${ch.title}`, "")
        lastChapter = ch.title
      }
      if (s.title) {
        out.push(`### ${s.title}`, "")
      }
      for (const p of s.paras || []) {
        if (p && typeof p === "object" && p.img) {
          out.push("*[illustration]*", "")
          continue
        }
        if (typeof p === "string" && p.trim()) out.push(p.trim(), "")
      }
    }
  }
  return (
    out
      .filter((l, idx, a) => !(l === "" && a[idx - 1] === ""))
      .join("\n")
      .trim() + "\n"
  )
}

// Reader sections → Markdown (used for the export flow on any open book).
export function sectionsToMarkdown(sections, meta = {}) {
  const out = [
    `# ${meta.title || "Untitled"}`,
    meta.author ? `*${meta.author}*` : "",
    "---",
    "",
  ]
  let lastChapter = null
  ;(sections || []).forEach((s, i) => {
    if (s.chapter && s.chapter !== lastChapter) {
      out.push(`## ${s.chapter}`, "")
      lastChapter = s.chapter
    }
    out.push(s.title ? `### ${s.title}` : `### § ${i + 1}`, "")
    for (const p of s.paras || []) {
      if (p && typeof p === "object" && p.img) {
        out.push("*[illustration]*", "")
        continue
      }
      if (typeof p === "string" && p.trim()) out.push(p.trim(), "")
    }
  })
  return (
    out
      .filter((l, idx, a) => !(l === "" && a[idx - 1] === ""))
      .join("\n")
      .trim() + "\n"
  )
}

export { cleanLineNoise }
