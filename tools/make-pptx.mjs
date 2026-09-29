// Build StudyFlow_Presentation.pptx — the editable PowerPoint twin of the
// HTML/PDF deck, generated from the same tools/deck-data.mjs so all formats
// stay in sync. Real text boxes and embedded PNGs (fully editable in
// PowerPoint), 13.333 x 7.5 in (16:9) slides, book palette, Times New Roman.
//
// Run: node tools/make-pptx.mjs
import PptxGenJS from "pptxgenjs"
import { statSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DECK,
  slides,
  imgData,
  ACCENT,
  ACCENT_DARK,
  INK,
  MUTED,
  RULE,
} from "./deck-data.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = join(root, "StudyFlow_Presentation.pptx")

// --------------------------------------------------------------- geometry --
const W = 13.333333
const H = 7.5
const PAD_X = 0.5
const FOOT_Y = 6.95
const FONT = "Times New Roman"

// "<b>x</b> y" -> pptxgenjs rich-text runs.
function runs(text) {
  const out = []
  let bold = false
  for (const seg of String(text).split(/(<b>|<\/b>)/)) {
    if (seg === "<b>") bold = true
    else if (seg === "</b>") bold = false
    else if (seg) out.push({ text: seg, options: { bold: bold || undefined } })
  }
  return out
}

function bulletsBox(slide, items, box) {
  const all = []
  items.forEach((t) => {
    const rr = runs(t)
    rr.forEach((r, j) => {
      const o = { ...r.options }
      if (j === 0) {
        o.bullet = { code: "25AA", indent: 12 }
        o.paraSpaceAfter = 8
      }
      if (j === rr.length - 1) o.breakLine = true
      all.push({ text: r.text, options: o })
    })
  })
  slide.addText(all, {
    ...box,
    fontSize: 15,
    color: INK,
    fontFace: FONT,
    valign: "top",
  })
}

function caption(slide, text, box) {
  slide.addText(text, {
    x: box.x,
    y: box.y + box.h + 0.02,
    w: box.w,
    h: 0.26,
    fontSize: 9.5,
    color: MUTED,
    fontFace: FONT,
    align: "center",
  })
}

function picture(slide, m, box, opts = {}) {
  slide.addImage({
    data: imgData(m.file),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    sizing: { type: m.role === "shot" ? "cover" : "contain", w: box.w, h: box.h },
  })
  const cap = opts.cap !== undefined ? opts.cap : m.cap
  if (cap) caption(slide, cap, box)
}

function header(slide, s, dark = false) {
  slide.addText(s.kicker.toUpperCase(), {
    x: PAD_X, y: 0.38, w: W - 2 * PAD_X, h: 0.3,
    fontSize: 12, charSpacing: 2, bold: true,
    color: dark ? "9DBFAA" : ACCENT, fontFace: FONT,
  })
  slide.addText(s.title, {
    x: PAD_X, y: 0.68, w: W - 2 * PAD_X, h: 0.6,
    fontSize: 28, bold: true,
    color: dark ? "FFFFFF" : ACCENT_DARK, fontFace: FONT,
  })
  slide.addShape(pptx.ShapeType.rect, {
    x: PAD_X, y: 1.34, w: 0.64, h: 0.05,
    fill: { color: dark ? "9DBFAA" : ACCENT },
    line: { type: "none" },
  })
}

function footer(slide, foot, dark = false) {
  const col = dark ? "AFC7BA" : MUTED
  slide.addShape(pptx.ShapeType.line, {
    x: PAD_X, y: FOOT_Y, w: W - 2 * PAD_X, h: 0,
    line: { color: dark ? ACCENT : RULE, width: 1 },
  })
  slide.addText(DECK.footer, {
    x: PAD_X, y: FOOT_Y + 0.05, w: 9, h: 0.3,
    fontSize: 10, color: col, fontFace: FONT,
  })
  slide.addText(foot, {
    x: W - PAD_X - 2, y: FOOT_Y + 0.05, w: 2, h: 0.3,
    fontSize: 10, color: col, fontFace: FONT, align: "right",
  })
}

// ------------------------------------------------------------ slide makers --
function coverSlide(s) {
  const slide = pptx.addSlide()
  slide.addShape(pptx.ShapeType.rect, {
    x: W / 2 - 0.45, y: 1.15, w: 0.9, h: 0.07,
    fill: { color: ACCENT }, line: { type: "none" },
  })
  slide.addText("STUDYFLOW", {
    x: 0, y: 1.5, w: W, h: 1.3, align: "center",
    fontSize: 64, charSpacing: 8, bold: true, color: ACCENT_DARK, fontFace: FONT,
  })
  slide.addText(DECK.subtitle, {
    x: 0, y: 2.85, w: W, h: 0.5, align: "center",
    fontSize: 22, color: ACCENT, fontFace: FONT,
  })
  slide.addText(DECK.tag, {
    x: 0, y: 4.15, w: W, h: 0.4, align: "center",
    fontSize: 17, bold: true, color: INK, fontFace: FONT,
  })
  slide.addText(`${DECK.author} · ${DECK.meta1}\n${DECK.meta2}`, {
    x: 0, y: 4.6, w: W, h: 0.75, align: "center",
    fontSize: 13, color: MUTED, fontFace: FONT,
  })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function bulletsSlide(s) {
  const slide = pptx.addSlide()
  header(slide, s)
  bulletsBox(slide, s.bullets, { x: PAD_X, y: 1.7, w: W - 2 * PAD_X, h: 4.9 })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function textLeftMediaRight(s) {
  const slide = pptx.addSlide()
  header(slide, s)
  bulletsBox(slide, s.bullets, { x: PAD_X, y: 1.7, w: 6.1, h: 4.6 })
  picture(slide, s.media[0], { x: 6.95, y: 1.7, w: 5.9, h: 4.35 })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function focusDesk(s) {
  const slide = pptx.addSlide()
  header(slide, s)
  picture(slide, s.media[0], { x: PAD_X, y: 1.7, w: 5.6, h: 4.35 })
  picture(slide, s.media[1], { x: 6.35, y: 1.7, w: 2.0, h: 3.5 }, { cap: null })
  picture(slide, s.media[2], { x: 8.5, y: 1.7, w: 4.33, h: 3.5 }, { cap: null })
  caption(slide, s.cap, { x: 6.35, y: 5.2, w: 6.48, h: 0.26 })
  bulletsBox(slide, s.bullets, { x: 6.35, y: 5.6, w: 6.48, h: 1.2 })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function diagramTop(s) {
  const slide = pptx.addSlide()
  header(slide, s)
  picture(slide, s.media[0], { x: 1.4, y: 1.65, w: 10.53, h: 2.0 })
  bulletsBox(slide, s.bullets, { x: 1.4, y: 4.0, w: 10.53, h: 2.4 })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function mediaLeftStackRight(s) {
  const slide = pptx.addSlide()
  header(slide, s)
  picture(slide, s.media[0], { x: PAD_X, y: 1.7, w: 5.2, h: 4.35 })
  picture(slide, s.media[1], { x: 6.1, y: 1.7, w: 6.73, h: 2.1 })
  bulletsBox(slide, s.bullets, { x: 6.1, y: 4.15, w: 6.73, h: 2.2 })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function triptych(s) {
  const slide = pptx.addSlide()
  header(slide, s)
  const gw = 3.91
  s.media.forEach((m, i) => {
    picture(slide, m, { x: PAD_X + i * (gw + 0.3), y: 1.7, w: gw, h: 4.3 })
  })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function textRightMediaLeft(s) {
  const slide = pptx.addSlide()
  header(slide, s)
  picture(slide, s.media[0], { x: PAD_X, y: 1.7, w: 6.0, h: 4.35 })
  bulletsBox(slide, s.bullets, { x: 6.9, y: 1.7, w: 5.93, h: 4.6 })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function bigDiagram(s) {
  const slide = pptx.addSlide()
  header(slide, s)
  picture(slide, s.media[0], { x: 1.2, y: 1.6, w: 10.93, h: 3.3 }, { cap: null })
  bulletsBox(slide, s.bullets, { x: 1.2, y: 5.05, w: 10.93, h: 1.6 })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function stackedDiagrams(s) {
  const slide = pptx.addSlide()
  header(slide, s)
  picture(slide, s.media[0], { x: 1.2, y: 1.6, w: 10.93, h: 1.45 })
  picture(slide, s.media[1], { x: 1.2, y: 3.5, w: 10.93, h: 1.45 })
  bulletsBox(slide, s.bullets, { x: 1.2, y: 5.35, w: 10.93, h: 1.3 })
  footer(slide, s.foot)
  slide.addNotes(s.notes)
}

function closingSlide(s) {
  const slide = pptx.addSlide()
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: W, h: H,
    fill: { color: ACCENT_DARK }, line: { type: "none" },
  })
  header(slide, s, true)
  bulletsBox(slide, s.bullets, { x: PAD_X, y: 2.1, w: W - 2 * PAD_X, h: 2.9 })
  slide.addText(s.afterword, {
    x: PAD_X, y: 5.25, w: W - 2 * PAD_X, h: 0.5,
    fontSize: 15, italic: true, color: "BFD8C9", fontFace: FONT,
  })
  footer(slide, s.foot, true)
  slide.addNotes(s.notes)
}

// --------------------------------------------------------------- dispatch --
const makers = {
  cover: coverSlide,
  bullets: bulletsSlide,
  "text-left-media-right": textLeftMediaRight,
  "focus-desk": focusDesk,
  "diagram-top": diagramTop,
  "media-left-stack-right": mediaLeftStackRight,
  triptych,
  "text-right-media-left": textRightMediaLeft,
  "big-diagram": bigDiagram,
  "stacked-diagrams": stackedDiagrams,
  closing: closingSlide,
}

const pptx = new PptxGenJS()
pptx.defineLayout({ name: "WIDE", width: W, height: H })
pptx.layout = "WIDE"
pptx.author = DECK.author
pptx.company = "StudyFlow"
pptx.subject = DECK.subtitle
pptx.title = DECK.title

for (const s of slides) {
  const mk = makers[s.layout]
  if (!mk) throw new Error(`no maker for layout: ${s.layout}`)
  mk(s)
}

await pptx.writeFile({ fileName: OUT })
const size = statSync(OUT).size
console.log(
  `wrote ${basename(OUT)} — ${(size / 1e6).toFixed(2)} MB, ${slides.length} slides, speaker notes on all`,
)
