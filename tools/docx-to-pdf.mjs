// Export StudyFlow_Documentation.docx to StudyFlow_Documentation.pdf.
//
// Why not Word COM? Word 16 starts via COM on this machine but
// Documents.Open fails (0x800A1066) and Documents.Add hangs, leaving an
// orphaned WINWORD.EXE behind — so this converter takes the Chromium route:
//   1. mammoth converts docx -> HTML (images inlined as base64 data URIs;
//      Word's TOC *field* is empty, so we build a real contents page from
//      the converted headings instead) — shared logic lives in pdf-parts.mjs.
//   2. chrome-headless-shell (same binary used by tools/capture.mjs) prints
//      the styled HTML via puppeteer-core. TOC page numbers are REAL: a
//      first pass prints the body, Python (pypdf) maps every heading to its
//      printed page number, and a second pass prints with the numbers filled
//      in (the TOC's own length is fixed by reserving its pages up front).
//   3. pdf-lib merges a header/footer-free cover in front (cover unnumbered,
//      body numbered from 1 — the usual book convention).
//
// Run: node tools/docx-to-pdf.mjs
import { spawn } from "node:child_process"
import puppeteer from "puppeteer-core"
import { PDFDocument } from "pdf-lib"
import { mkdtempSync, statSync, writeFileSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { convertDocx, contentsHtml, COVER_HTML, shell, markLeads, TOC_SENTINEL } from "./pdf-parts.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
// Optional argv[2]: path to a source docx (default: the book at the root).
const DOCX = process.argv[2] ? join(root, process.argv[2]) : join(root, "StudyFlow_Documentation.docx")
const OUT_PDF = join(root, "StudyFlow_Documentation.pdf")
const CHROME = join(
  root,
  ".freebuff",
  "browsers",
  "chrome-headless-shell",
  "win64-154.0.8037.57",
  "chrome-headless-shell-win64",
  "chrome-headless-shell.exe",
)
const PORT = 9224
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------ mammoth conversion --
console.log("[1/6] converting docx -> HTML (mammoth)…")
const { bodyClean, contents, messages } = await convertDocx(await readFile(DOCX))
for (const m of messages) {
  if (m.type === "warning") console.log(`  mammoth: ${m.message}`)
}
console.log(
  `  contents: ${contents.filter((i) => i.level === "h1").length} sections, ${contents.filter((i) => i.level === "h2").length} subsections`,
)
const body = markLeads(bodyClean)

// ------------------------------------------------------------- print setup --
const header = `
  <div style="width:100%;font-size:8pt;color:#5A6B60;padding:0 14mm;display:flex;justify-content:space-between;font-family:'Times New Roman',Times,serif;">
    <span>StudyFlow — Research and Technical Documentation</span>
    <span>Blay-Miezah Lemuel Ackah</span>
  </div>`
const footer = `
  <div style="width:100%;font-size:8pt;color:#5A6B60;padding:0 14mm;display:flex;justify-content:space-between;font-family:'Times New Roman',Times,serif;">
    <span>September 2026 · v1.0</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`
const margins = { top: "18mm", bottom: "16mm", left: "14mm", right: "14mm" }

const tmp = mkdtempSync(join(tmpdir(), "sfpdf-"))
const proc = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${join(tmp, "profile")}`,
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: false },
)

async function attach() {
  for (let i = 0; i < 30; i++) {
    await sleep(500)
    try {
      return await puppeteer.connect({
        browserURL: `http://127.0.0.1:${PORT}`,
        defaultViewport: { width: 1280, height: 800 },
      })
    } catch {
      /* not up yet */
    }
  }
  return null
}
const browser = await attach()
if (!browser) {
  console.error("could not attach to chrome-headless-shell")
  proc.kill()
  process.exit(1)
}

// Stable page budget for the TOC: keep it fixed between passes so the body
// pagination never shifts. The pass-2 TOC only *adds* small page numbers to
// existing leader rows, so both passes paginate identically.
const TOC_PAGES = 7

async function printBody(tocHtml, outPath) {
  const page = await browser.newPage()
  await page.setContent(
    shell(tocHtml + body),
    { waitUntil: "load", timeout: 120000 },
  )
  await sleep(1500) // let data-URI images decode
  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: header,
    footerTemplate: footer,
    margin: margins,
    timeout: 240000,
  })
  await page.close()
}

// ------------------------------------------------ pass 1: measure page nums --
console.log("[2/6] pass 1 — printing body (measuring pass)…")
const bodyPdfPath = join(tmp, "body1.pdf")
const titles = contents.map((i) => i.text)
const titlesPath = join(tmp, "titles.json")
const pagesPath = join(tmp, "pages.json")
writeFileSync(titlesPath, JSON.stringify(titles))
await printBody(contentsHtml(contents, null), bodyPdfPath)

console.log("[3/6] mapping headings -> printed page numbers (pypdf)…")
execFileSync(
  "python",
  [join(root, "tools", "toc-pages.py"), bodyPdfPath, titlesPath, pagesPath, TOC_SENTINEL],
  { stdio: "inherit" },
)
const mapped = JSON.parse(await readFile(pagesPath, "utf8"))
const missing = mapped.filter((p) => p === null).length
if (missing) {
  console.error(`${missing} heading(s) could not be located — aborting so numbers stay honest`)
  await browser.disconnect().catch(() => {})
  proc.kill()
  process.exit(1)
}
// Body page numbers are what the footer prints: pass-1 PDF page N (after
// the skipped TOC pages) == footer page N. The mapper returns page numbers
// relative to the sliced pages, which is exactly the footer's numbering.
const tocHtml = contentsHtml(contents, mapped)
console.log(`  resolved all ${mapped.length} entries`)

// ------------------------------------------------ pass 2: final with numbers --
console.log("[4/6] pass 2 — printing final body with real page numbers…")
const bodyPdfPath2 = join(tmp, "body2.pdf")
await printBody(tocHtml, bodyPdfPath2)

// ------------------------------------------------------ cover + merge ------
try {
  const cpage = await browser.newPage()
  console.log("[5/6] printing cover sheet…")
  await cpage.setContent(shell(COVER_HTML), { waitUntil: "load", timeout: 60000 })
  await sleep(400)
  const coverPdf = await cpage.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: false,
    margin: margins,
    timeout: 120000,
  })
  await cpage.close()
  console.log("[merge] merging cover + body…")

  const coverDoc = await PDFDocument.load(coverPdf)
  const out = await PDFDocument.create()
  const [coverPage] = await out.copyPages(coverDoc, [0])
  out.addPage(coverPage)

  const bodyDoc = await PDFDocument.load(await readFile(bodyPdfPath2))
  const bodyPages = await out.copyPages(bodyDoc, bodyDoc.getPageIndices())
  for (const p of bodyPages) out.addPage(p)

  const bytes = await out.save()
  await writeFile(OUT_PDF, bytes)
  const size = statSync(OUT_PDF).size
  console.log(
    `[6/6] wrote ${basename(OUT_PDF)} — ${(size / 1e6).toFixed(2)} MB, ${out.getPageCount()} pages (${bodyDoc.getPageCount()} numbered + cover)`,
  )
} finally {
  await browser.disconnect().catch(() => {})
  proc.kill()
}

console.log("ok")
