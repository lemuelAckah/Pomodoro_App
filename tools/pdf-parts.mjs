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

export async function convertDocx(buffer) {
  const { value: raw, messages } = await mammoth.convertToHtml(
    { buffer },
    {
      transformDocument: markCodeRuns,
      styleMap: ["highlight[color='studiocode'] => code.doccode"],
    },
  )
  const bodyClean = stripFrontMatter(raw)
  return { bodyClean, contents: collectContents(bodyClean), messages }
}

// ------------------------------------------------------------- HTML parts --
export function contentsHtml(items) {
  const rows = items
    .map(({ level, text }) =>
      level === "h1"
        ? `<li class="t1">${text}</li>`
        : `<li class="t2">${text}</li>`,
    )
    .join("\n")
  return `<section class="tocpage"><h1 class="plain">Contents</h1><ul class="toc">\n${rows}\n</ul><p class="fineprint">Section list for the PDF edition — page numbers omitted; use PDF search to navigate.</p></section>`
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
    font-family: Aptos, "Segoe UI", Calibri, sans-serif;
    font-size: 10.5pt; line-height: 1.55; color: ${INK}; margin: 0;
  }
  p { margin: 0 0 8pt; text-align: justify; }
  h1 {
    color: ${ACCENT_DARK}; font-size: 19pt; line-height: 1.25;
    margin: 0 0 12pt; padding-bottom: 5pt;
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
  th {
    background: ${ACCENT}; color: #fff; text-align: left;
    padding: 4pt 6pt; border: 0.5pt solid ${RULE_LIGHT}; font-weight: 600;
  }
  td { padding: 4pt 6pt; border: 0.5pt solid ${RULE_LIGHT}; vertical-align: top; }
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
  /* generated contents page */
  .tocpage { break-before: page; }
  h1.plain { border-bottom: 2pt solid ${ACCENT}; }
  ul.toc { list-style: none; margin: 10pt 0 0; padding: 0; columns: 2; column-gap: 10mm; }
  ul.toc li { margin: 0 0 3.5pt; text-align: left; break-inside: avoid; }
  ul.toc li.t1 { font-weight: 600; color: ${ACCENT_DARK}; margin-top: 7pt; }
  ul.toc li.t1:first-child { margin-top: 0; }
  ul.toc li.t2 { font-weight: 400; font-size: 9pt; padding-left: 10pt; }
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
