// Shared parts for the docx -> PDF export (tools/docx-to-pdf.mjs) and its
// verifier (tools/verify-pdf.mjs): docx conversion, front-matter stripping,
// generated contents page, cover page and print CSS. One source of truth so
// verification checks exactly what the converter prints.
import mammoth from "mammoth"

// Book palette (docs/lib.js).
export const ACCENT = "#47765A"
export const ACCENT_DARK = "#2C5641"
export const INK = "#1F2A24"
export const MUTED = "#5A6B60"
export const RULE_LIGHT = "#DDE6DE"
export const CODE_BG = "#F2F5F2"

// ------------------------------------------------------ docx -> clean HTML --
// Consolas runs get a sentinel highlight so the style map can wrap them in
// <code> (mammoth has no font matcher; runs DO carry font/fontSize).
function markCodeRuns(document) {
  const visit = (el) => {
    if (el.children) el.children.forEach(visit)
    if (el.type === "run" && el.font === "Consolas") {
      el.highlight = "studiocode"
    }
  }
  visit(document)
  return document
}

// Strip the docx's own title page (replaced by the printed cover) and the
// empty "Table of Contents" field section (replaced by a generated one).
export function stripFrontMatter(html) {
  let out = html
  const first = out.indexOf("<h1>")
  if (first > 0) out = out.slice(first)
  const tocStart = out.indexOf("<h1>Table of Contents</h1>")
  if (tocStart !== -1) {
    const tocEnd = out.indexOf("<h1>", tocStart + 1)
    if (tocEnd !== -1) out = out.slice(0, tocStart) + out.slice(tocEnd)
  }
  return out
}

export function collectContents(html) {
  const items = []
  const re = /<(h1|h2)>([\s\S]*?)<\/\1>/g
  let m
  while ((m = re.exec(html)))
    items.push({ level: m[1], text: m[2].replace(/<[^>]+>/g, "") })
  return items
}

// Tag the opening paragraph after each h1 with class="lead" so CSS can give
// it a drop cap — except figure/table captions and image paragraphs.
export function markLeads(bodyHtml) {
  return bodyHtml.replace(
    /(<h1>[\s\S]*?<\/h1>\s*)<p>(?!\s*<strong>(?:Figure|Table) )(?!\s*<img)/g,
    '$1<p class="lead">',
  )
}

export async function convertDocx(buffer) {
  const { value: raw, messages } = await mammoth.convertToHtml({ buffer }, {
    transformDocument: markCodeRuns,
    styleMap: ["highlight[color='studiocode'] => code.doccode"],
  })
  const bodyClean = stripFrontMatter(raw)
  return { bodyClean, contents: collectContents(bodyClean), messages }
}

// ------------------------------------------------------------- HTML parts --
// items: [{ level, text }]; pages: aligned array of page numbers, or null
// for the measuring pass (which appends a white sentinel so the page mapper
// can find exactly where the contents end).
// h1 rows are chapters/sections; h2 rows already carry their own numbers in
// the source text ("1.1 Background"), so nothing is prefixed here.
export const TOC_SENTINEL = "TOC-END-MARKER-9F3A"
export function contentsHtml(items, pages) {
  const rows = items
    .map(({ level, text }, i) => {
      const pg = pages ? pages[i] : null
      const pgHtml =
        pg != null
          ? `<span class="dots"></span><span class="pg">${pg}</span>`
          : '<span class="dots"></span>'
      return `<li class="${
        level === "h1" ? "t1" : "t2"
      }"><span class="tx">${text}</span>${pgHtml}</li>`
    })
    .join("\n")
  const sentinel =
    pages == null
      ? `<p style="color:#fff;font-size:1pt;margin:0">${TOC_SENTINEL}</p>`
      : ""
  return `<section class="tocpage"><h1 class="plain">Contents</h1><ul class="toc">\n${rows}\n</ul>${sentinel}</section>`
}

export const COVER_HTML = `
<section class="cover">
  <div class="cover-rule"></div>
  <div class="cover-title">STUDYFLOW</div>
  <div class="cover-sub">A Learning, Productivity and Collaboration Platform</div>
  <div class="cover-tag">A Comprehensive Research and Technical Documentation</div>
  <div class="cover-meta">
    <div class="cover-author-label">Author</div>
    <div class="cover-author">Blay-Miezah Lemuel Ackah</div>
    <div class="cover-date">September 2026</div>
    <div class="cover-ver">Document version 1.0</div>
    <div class="cover-src">Generated from the StudyFlow source repository (figma-make-app v1.0.0)</div>
  </div>
</section>`

export const CSS = `
  @page { size: A4; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Times New Roman", Times, "Liberation Serif", serif;
    font-size: 11pt; line-height: 1.5; color: ${INK}; margin: 0;
  }
  p { margin: 0 0 8pt; text-align: justify; orphans: 3; widows: 3; }
  /* Drop cap on the opening paragraph of every section */
  p.lead::first-letter {
    font-size: 2.7em; line-height: 0.82;
    font-weight: 600; color: ${ACCENT_DARK};
    float: left; padding: 3pt 6pt 0 0;
  }
  h1 {
    color: ${ACCENT_DARK}; font-size: 20pt; line-height: 1.25;
    margin: 0 0 12pt; padding-bottom: 5pt; letter-spacing: 0.2pt;
    border-bottom: 2pt solid ${ACCENT};
    break-before: page; break-after: avoid;
  }
  h2 {
    color: ${ACCENT_DARK}; font-size: 13.5pt; line-height: 1.3;
    margin: 15pt 0 6pt; break-after: avoid;
  }
  h3 {
    color: ${INK}; font-size: 11.5pt; margin: 12pt 0 5pt; break-after: avoid;
  }
  ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
  li { margin-bottom: 3pt; text-align: justify; }
  a { color: ${ACCENT}; text-decoration: none; }
  img { max-width: 100%; height: auto; display: block; margin: 8pt auto 4pt; }
  table {
    width: 100%; border-collapse: collapse; margin: 6pt 0 10pt;
    font-size: 9.5pt; line-height: 1.4;
  }
  /* Booktabs-style rules: strong top and bottom, light row separators,
     no vertical lines. */
  th {
    background: ${ACCENT}; color: #fff; text-align: left;
    padding: 4.5pt 7pt;
    border-top: 1.5pt solid ${ACCENT_DARK};
    border-bottom: 0.9pt solid ${ACCENT_DARK};
    font-weight: 600; font-size: 9pt;
  }
  td {
    padding: 3.5pt 7pt; vertical-align: top;
    border-bottom: 0.4pt solid ${RULE_LIGHT};
  }
  tr:last-child td { border-bottom: 1.2pt solid ${ACCENT}; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  code.doccode {
    font-family: Consolas, "Cascadia Mono", monospace;
    font-size: 9pt; color: ${ACCENT_DARK};
  }
  /* Code lines: mammoth maps Consolas paragraphs to p > code.doccode; the
     :has() rule styles the paragraph as a shaded code-line box. */
  p:has(> code.doccode) {
    font-family: Consolas, "Cascadia Mono", monospace;
    font-size: 8.5pt; line-height: 1.45;
    background: ${CODE_BG}; margin: 0; padding: 0.5pt 8pt;
    text-align: left; white-space: pre-wrap;
  }
  /* figure + caption pairing */
  p:has(> img) { text-align: center; margin: 10pt 0 2pt; }
  p:has(> img) + p { text-align: center; }
  /* cover page */
  .cover {
    height: 250mm; display: flex; flex-direction: column;
    align-items: center; padding-top: 60mm; text-align: center;
  }
  .cover-rule { width: 26mm; height: 2.5mm; background: ${ACCENT}; margin-bottom: 14mm; }
  .cover-title { font-size: 42pt; font-weight: 700; letter-spacing: 3pt; color: ${ACCENT_DARK}; }
  .cover-sub { font-size: 15.5pt; color: ${ACCENT}; margin-top: 5mm; }
  .cover-tag { font-size: 13pt; font-weight: 600; margin-top: 24mm; }
  .cover-meta { margin-top: 32mm; }
  .cover-author-label { font-size: 10pt; color: ${MUTED}; }
  .cover-author { font-size: 13.5pt; font-weight: 600; margin-top: 2mm; }
  .cover-date { font-size: 11.5pt; margin-top: 12mm; }
  .cover-ver, .cover-src { font-size: 10pt; color: ${MUTED}; margin-top: 2mm; }
  /* generated contents page — classic book TOC with dotted leaders */
  .tocpage { break-before: page; }
  h1.plain { border-bottom: 2pt solid ${ACCENT}; }
  ul.toc { list-style: none; margin: 14pt 0 0; padding: 0; }
  ul.toc li {
    display: flex; align-items: baseline;
    margin: 0; padding: 1.5pt 0; break-inside: avoid;
  }
  ul.toc li .tx { flex: none; max-width: 88%; }
  ul.toc .dots {
    flex: 1; margin: 0 5pt;
    border-bottom: 0.7pt dotted #9DB3A5;
    transform: translateY(-2.5pt);
  }
  ul.toc .pg {
    flex: none; font-family: "Space Mono", Consolas, monospace;
    font-size: 9pt; color: ${MUTED};
    font-variant-numeric: tabular-nums;
  }
  ul.toc li.t1 {
    font-weight: 700; color: ${ACCENT_DARK}; font-size: 10.5pt;
    margin-top: 9pt; break-after: avoid;
  }
  ul.toc li.t1:first-child { margin-top: 0; }
  ul.toc li.t2 { font-weight: 400; font-size: 9.5pt; padding-left: 16pt; }
  .fineprint { font-size: 8.5pt; color: ${MUTED}; text-align: center; margin-top: 14mm; }
`

export const shell = (content) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>StudyFlow — Research and Technical Documentation</title>
<style>${CSS}</style>
</head>
<body>
${content}
</body>
</html>`
