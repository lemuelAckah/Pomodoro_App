// Export StudyFlow_Documentation.docx to StudyFlow_Documentation.pdf.
//
// Why not Word COM? Word 16 starts via COM on this machine but
// Documents.Open fails (0x800A1066) and Documents.Add hangs, leaving an
// orphaned WINWORD.EXE behind — so this converter takes the Chromium route:
//   1. mammoth converts docx -> HTML (images inlined as base64 data URIs;
//      Word's TOC *field* is empty, so we build a real contents page from
//      the converted headings instead) — shared logic lives in pdf-parts.mjs.
//   2. chrome-headless-shell (same binary used by tools/capture.mjs) prints
//      the styled HTML via puppeteer-core: body PDF with running header and
//      "Page N of N" footer, plus a separate cover PDF with no header/footer.
//   3. pdf-lib merges cover + body (cover unnumbered, body numbered from 1 —
//      the usual book convention).
//
// Run: node tools/docx-to-pdf.mjs
import { spawn } from "node:child_process"
import puppeteer from "puppeteer-core"
import { PDFDocument } from "pdf-lib"
import { mkdtempSync, statSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"
import { convertDocx, contentsHtml, COVER_HTML, shell, markLeads } from "./pdf-parts.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const DOCX = join(root, "StudyFlow_Documentation.docx")
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
console.log("[1/5] converting docx -> HTML (mammoth)…")
const { bodyClean, contents, messages } = await convertDocx(await readFile(DOCX))
for (const m of messages) {
  if (m.type === "warning") console.log(`  mammoth: ${m.message}`)
}
console.log(
  `  contents: ${contents.filter((i) => i.level === "h1").length} sections, ${contents.filter((i) => i.level === "h2").length} subsections`,
)

const bodyHtml = shell(contentsHtml(contents) + markLeads(bodyClean))
const coverHtmlDoc = shell(COVER_HTML)

// ------------------------------------------------------------- print to PDF --
console.log("[2/5] launching chrome-headless-shell…")
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

const header = `
  <div style="width:100%;font-size:8pt;color:#5A6B60;padding:0 14mm;display:flex;justify-content:space-between;font-family:'Times New Roman',Times,serif;">
    <span>StudyFlow — Research and Technical Documentation</span>
    <span>Blay-Miezah Lemuel Ackah</span>
  </div>`
const footer = `
  <div style="width:100%;font-size:8pt;color:#5A6B60;padding:0 14mm;display:flex;justify-content:space-between;">
    <span>September 2026 · v1.0</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`
const margins = { top: "18mm", bottom: "16mm", left: "14mm", right: "14mm" }

try {
  // --- body: contents + chapters, with running header + page numbers ------
  const page = await browser.newPage()
  console.log("[3/5] printing body (contents + chapters)…")
  await page.setContent(bodyHtml, { waitUntil: "load", timeout: 120000 })
  await sleep(1500) // let data-URI images decode
  const bodyPdfPath = join(tmp, "body.pdf")
  await page.pdf({
    path: bodyPdfPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: header,
    footerTemplate: footer,
    margin: margins,
    timeout: 240000,
  })
  await page.close()

  // --- cover: no header/footer --------------------------------------------
  const cpage = await browser.newPage()
  console.log("[4/5] printing cover sheet…")
  await cpage.setContent(coverHtmlDoc, { waitUntil: "load", timeout: 60000 })
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

  const bodyDoc = await PDFDocument.load(await readFile(bodyPdfPath))
  const bodyPages = await out.copyPages(bodyDoc, bodyDoc.getPageIndices())
  for (const p of bodyPages) out.addPage(p)

  const bytes = await out.save()
  await writeFile(OUT_PDF, bytes)
  const size = statSync(OUT_PDF).size
  console.log(
    `[5/5] wrote ${basename(OUT_PDF)} — ${(size / 1e6).toFixed(2)} MB, ${out.getPageCount()} pages (${bodyDoc.getPageCount()} numbered + cover)`,
  )
} finally {
  await browser.disconnect().catch(() => {})
  proc.kill()
}

console.log("ok")
