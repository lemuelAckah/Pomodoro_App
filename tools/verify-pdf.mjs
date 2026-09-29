// Sanity checks for StudyFlow_Documentation.pdf and the exact HTML that
// produced it (imports the converter's shared parts, so it verifies what
// ships). Run: node tools/verify-pdf.mjs
import puppeteer from "puppeteer-core"
import { PDFDocument } from "pdf-lib"
import { readFile, statSync, mkdtempSync } from "node:fs"
import { readFile as readFileP } from "node:fs/promises"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { convertDocx, contentsHtml, COVER_HTML, shell, markLeads } from "./pdf-parts.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const PDF_PATH = join(root, "StudyFlow_Documentation.pdf")
const CHROME = join(
  root,
  ".freebuff",
  "browsers",
  "chrome-headless-shell",
  "win64-154.0.8037.57",
  "chrome-headless-shell-win64",
  "chrome-headless-shell.exe",
)
const PORT = 9225
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`)
  if (!ok) failures++
}

// --------------------------------------------------------- PDF binary checks
const buf = await readFileP(PDF_PATH)
check("PDF magic header", buf.subarray(0, 5).toString() === "%PDF-")
const size = statSync(PDF_PATH).size
check("size in plausible range", size > 1e6 && size < 20e6, `${(size / 1e6).toFixed(2)} MB`)

const doc = await PDFDocument.load(buf)
const pages = doc.getPageCount()
check("page count plausible", pages >= 60 && pages <= 120, `${pages} pages`)
const { width, height } = doc.getPage(0).getSize()
check(
  "A4 page size",
  Math.abs(width - 595.28) < 2 && Math.abs(height - 841.89) < 2,
  `${width.toFixed(1)}x${height.toFixed(1)}pt`,
)

// ------------------------------------- re-render the exact printed HTML DOM --
const { bodyClean, contents } = await convertDocx(
  await readFileP(join(root, "StudyFlow_Documentation.docx")),
)
const html = shell(contentsHtml(contents) + COVER_HTML + markLeads(bodyClean))

const tmp = mkdtempSync(join(tmpdir(), "sfverify-"))
const proc = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--user-data-dir=${join(tmp, "profile")}`,
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: false },
)
let browser = null
for (let i = 0; i < 30; i++) {
  await sleep(500)
  try {
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}` })
    break
  } catch {}
}
if (!browser) {
  console.error("could not attach to chrome-headless-shell")
  proc.kill()
  process.exit(1)
}

try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: "load", timeout: 120000 })
  await sleep(1200)
  const facts = await page.evaluate(() => {
    const text = document.body.innerText
    const tocLis = [...document.querySelectorAll("ul.toc li")]
    const tables = [...document.querySelectorAll("table")]
    const cellStats = tables.map((t) => {
      const cells = [...t.querySelectorAll("th,td")]
      const empty = cells.filter((c) => c.innerText.trim() === "").length
      return { cells: cells.length, empty }
    })
    const bodyFont = getComputedStyle(document.body).fontFamily
    const firstTableHead = tables[0]
      ? [...tables[0].rows[0].cells].map((c) => c.innerText.trim())
      : []
    return {
      h1: document.querySelectorAll("h1").length, // 31 body + 1 "Contents"
      h2: document.querySelectorAll("h2").length,
      codeSpans: document.querySelectorAll("code.doccode").length,
      images: document.images.length,
      imagesOk: [...document.images].every((i) => i.complete && i.naturalWidth > 0),
      tables: tables.length,
      tableCells: cellStats.reduce((a, s) => a + s.cells, 0),
      tableEmptyCells: cellStats.reduce((a, s) => a + s.empty, 0),
      firstTableHead,
      figureLabels: [...document.querySelectorAll("p strong")].filter((s) =>
        /^Figure [A-Z]?\d*\.?\d+:$/.test(s.innerText.trim()),
      ).length,
      tableLabels: [...document.querySelectorAll("p strong")].filter((s) =>
        /^Table [A-Z]?\d*\.?\d+:$/.test(s.innerText.trim()),
      ).length,
      leads: document.querySelectorAll("p.lead").length,
      bodyFontIsTimes: /["']?times new roman["']?/i.test(bodyFont),
      hasCodeLine: text.includes('case "techniques":'),
      hasRenderSkeleton: text.includes("renderSkeleton(state.tab)"),
      hasBoldText: text.includes("Vite is a build tool"),
      noAsteriskMarkup: !text.includes("**"),
      noTocFieldSection: !text.includes("Table of Contents"),
      hasTitle: text.includes("STUDYFLOW"),
      hasAuthor: text.includes("Blay-Miezah Lemuel Ackah"),
      hasContentsPage: text.includes("Contents") && tocLis.length > 150,
      tocEntries: tocLis.length,
    }
  })
  check("h1 count (31 body + Contents)", facts.h1 === 32, `${facts.h1}`)
  check("h2 count", facts.h2 === 169, `${facts.h2}`)
  check("code spans styled", facts.codeSpans === 132, `${facts.codeSpans}`)
  check("all figures embedded", facts.images === 28 && facts.imagesOk, `${facts.images} images`)
  check("table count (docx registry)", facts.tables === 18, `${facts.tables}`)
  check(
    "no empty table cells (the blank-table bug)",
    facts.tableEmptyCells === 0,
    `${facts.tableCells} cells, ${facts.tableEmptyCells} empty`,
  )
  check(
    "first table has real headers",
    facts.firstTableHead.includes("User group") &&
      facts.firstTableHead.includes("Primary need"),
    facts.firstTableHead.slice(0, 3).join(" | "),
  )
  check("28 figure captions", facts.figureLabels === 28, `${facts.figureLabels}`)
  check("18 table captions", facts.tableLabels === 18, `${facts.tableLabels}`)
  check("drop-cap leads on every section", facts.leads === 31, `${facts.leads}`)
  check("body font is Times New Roman", facts.bodyFontIsTimes, "body computed font")
  check("code line preserved", facts.hasCodeLine)
  check("second code line preserved", facts.hasRenderSkeleton)
  check("bold runs converted (not literal)", facts.hasBoldText)
  check("no ** markup leaked", facts.noAsteriskMarkup)
  check("empty TOC field stripped", facts.noTocFieldSection)
  check("cover title present", facts.hasTitle)
  check("cover author present", facts.hasAuthor)
  check(
    "generated contents populated",
    facts.hasContentsPage,
    `${facts.tocEntries} entries`,
  )
} finally {
  await browser.disconnect().catch(() => {})
  proc.kill()
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall checks passed")
process.exit(failures ? 1 : 0)
