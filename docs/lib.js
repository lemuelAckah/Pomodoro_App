// Shared docx styling + building blocks for the StudyFlow documentation.
// Fonts: Times New Roman (body), Consolas (code). Accent: sage green #47765A.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
export const IMG = join(here, "img")

export const ACCENT = "47765A"
export const ACCENT_DARK = "2C5641"
export const INK = "1F2A24"
export const MUTED = "5A6B60"

// PNG pixel dimensions from the IHDR chunk (bytes 16..23).
function pngSize(file) {
  const buf = readFileSync(file)
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

// ---------------------------------------------------------------- state ---
export const registry = { figures: [], tables: [] }
let chapter = ""
let figN = 0
let tblN = 0

export function setChapter(label) {
  chapter = label
  figN = 0
  tblN = 0
}

// ------------------------------------------------------------- headings ---
export function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 240, after: 240 },
    children: [new TextRun({ text, color: ACCENT_DARK })],
  })
}

export function h1Flow(text) {
  // Chapter opener without a preceding page break (for the first chapter
  // after front matter, where the TOC already ends a page).
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 240 },
    children: [new TextRun({ text, color: ACCENT_DARK })],
  })
}

export function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 140 },
    children: [new TextRun({ text, color: ACCENT_DARK })],
  })
}

export function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 110 },
    children: [new TextRun({ text, color: INK })],
  })
}

// ---------------------------------------------------------------- body ----
// runs("plain **bold** *italic* `code`") -> plain tokens (NOT TextRuns):
//   { text, bold?, italics?, code? }[]
// Consumers turn tokens into TextRun[] with runFrom() at their own size and
// colour — docx TextRun objects do not expose their .options, so rebuilding
// from runs must never read them (that bug produced empty table cells).
function runs(text) {
  const out = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith("**")) out.push({ text: tok.slice(2, -2), bold: true })
    else if (tok.startsWith("`"))
      out.push({ text: tok.slice(1, -1), code: true })
    else out.push({ text: tok.slice(1, -1), italics: true })
    last = m.index + tok.length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

// token -> TextRun, with per-context size/colour overrides.
function runFrom(tok, opts = {}) {
  return new TextRun({
    text: tok.text,
    bold: tok.bold || opts.bold || undefined,
    italics: tok.italics || opts.italics || undefined,
    size: opts.size,
    color: opts.color || (tok.code ? ACCENT_DARK : undefined),
    font: tok.code ? "Consolas" : undefined,
  })
}

export function para(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 300 },
    children: runs(text).map((t) => runFrom(t)),
    ...opts,
  })
}

export function lead(text) {
  // Chapter lead-in paragraph: slightly larger, muted.
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 220, line: 310 },
    children: runs(text).map((t) => runFrom(t, { size: 23, color: MUTED })),
  })
}

export function bullets(items) {
  return items.map(
    (t) =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 90, line: 290 },
        children: runs(t).map((tok) => runFrom(tok)),
      }),
  )
}

export function numbered(items) {
  return items.map(
    (t) =>
      new Paragraph({
        numbering: { reference: "doc-num", level: 0 },
        spacing: { after: 90, line: 290 },
        children: runs(t).map((tok) => runFrom(tok)),
      }),
  )
}

export function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] })
}

// --------------------------------------------------------------- figure ---
export function figure(file, caption, widthPx = 600) {
  const path = join(IMG, file)
  const { w, h } = pngSize(path)
  const width = Math.min(widthPx, 620)
  const height = Math.round((h / w) * width)
  figN += 1
  const label = `Figure ${chapter}.${figN}`
  registry.figures.push([label, caption])
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 60 },
      children: [
        new ImageRun({
          type: "png",
          data: readFileSync(path),
          transformation: { width, height },
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: 19, color: MUTED }),
        new TextRun({ text: caption, size: 19, color: MUTED }),
      ],
    }),
  ]
}

// ---------------------------------------------------------------- table ---
export function table(caption, headers, rows, widths) {
  tblN += 1
  const label = `Table ${chapter}.${tblN}`
  registry.tables.push([label, caption])

  const total = widths ? widths.reduce((a, b) => a + b, 0) : headers.length
  const mk = (text, isHead, i) =>
    new TableCell({
      shading: isHead
        ? { type: ShadingType.CLEAR, fill: ACCENT, color: "auto" }
        : undefined,
      width: widths
        ? {
            size: Math.round((widths[i] / total) * 100),
            type: WidthType.PERCENTAGE,
          }
        : undefined,
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      children: [
        new Paragraph({
          spacing: { after: 0, line: 250 },
          children: runs(String(text)).map((tok) =>
            runFrom(
              tok,
              isHead ? { bold: true, color: "FFFFFF", size: 19 } : { size: 19 },
            ),
          ),
        }),
      ],
    })

  return [
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: 19, color: MUTED }),
        new TextRun({ text: caption, size: 19, color: MUTED }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "C9D6CC" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "C9D6CC" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "C9D6CC" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "C9D6CC" },
        insideHorizontal: {
          style: BorderStyle.SINGLE,
          size: 4,
          color: "DDE6DE",
        },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "DDE6DE" },
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map((t, i) => mk(t, true, i)),
        }),
        ...rows.map(
          (r) => new TableRow({ children: r.map((t, i) => mk(t, false, i)) }),
        ),
      ],
    }),
    new Paragraph({ spacing: { after: 140 }, children: [] }),
  ]
}

// ----------------------------------------------------------------- code ---
export function code(lines) {
  return lines.map(
    (line) =>
      new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: "F2F5F2" },
        spacing: { after: 0, line: 250 },
        indent: { left: 220, right: 220 },
        children: [
          new TextRun({
            text: line.length ? line : " ",
            font: "Consolas",
            size: 18,
            color: INK,
          }),
        ],
      }),
  )
}

export function codeCaption(caption, lines) {
  return [
    ...code(lines),
    new Paragraph({
      spacing: { before: 60, after: 200 },
      children: [
        new TextRun({
          text: `${caption} `,
          italics: true,
          size: 19,
          color: MUTED,
        }),
      ],
    }),
  ]
}

// ----------------------------------------------------------------- toc ----
export function toc() {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "Table of Contents", color: ACCENT_DARK }),
      ],
    }),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
  ]
}

// -------------------------------------------------------------- closing ---
export async function writeDocx(doc, outPath) {
  const buffer = await Packer.toBuffer(doc)
  writeFileSync(outPath, buffer)
  return outPath
}

export {
  Document,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  TextRun,
  Paragraph,
}
