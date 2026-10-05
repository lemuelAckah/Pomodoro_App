// Validates StudyFlow_Documentation.docx structure: headings, TOC field,
// figures, tables and media presence. Run: node tools/validate-docx.mjs
import { unzipSync, readFileSync } from "node:fs"
import { writeFileSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

const file = "StudyFlow_Documentation.docx"
const zip = unzipSync(readFileSync(file))
const xml = zip["word/document.xml"].toString("utf8")

const checks = {
  "H1 count": (xml.match(/w:val="Heading1"/g) || []).length,
  "H2 count": (xml.match(/w:val="Heading2"/g) || []).length,
  "H3 count": (xml.match(/w:val="Heading3"/g) || []).length,
  "TOC field": xml.includes("TOC \\o") ? 1 : 0,
  "Images (draw)": (xml.match(/<w:drawing>/g) || []).length,
  Tables: (xml.match(/<w:tbl>/g) || []).length,
  "Page breaks": (xml.match(/w:type="page"/g) || []).length,
  "Update-fields on open": xml.includes("updateFields") ? 1 : 0,
}

console.log("== document.xml checks ==")
for (const [k, v] of Object.entries(checks)) console.log(`${k}: ${v}`)

const media = Object.keys(zip).filter((n) => n.startsWith("word/media/"))
console.log(`Media files: ${media.length}`)

const h1Texts = [
  ...xml.matchAll(
    /<w:pStyle w:val="Heading1"\/>[\s\S]{0,600}?<w:t(?: [^>]*)?>([^<]+)<\/w:t>/g,
  ),
]
  .map((m) => m[1])
  .slice(0, 40)
console.log("== H1 headings ==")
h1Texts.forEach((t) => console.log("  " + t))

// Check all figure captions exist in order (sample)
const figs = (xml.match(/Figure \d+\.\d+:/g) || []).length
const tbls = (xml.match(/Table \d+\.\d+:/g) || []).length
console.log(`Figure captions: ${figs}, Table captions: ${tbls}`)

// Validate footer page numbers exist
console.log(
  "Footer has PAGE field:",
  (zip["word/footer1.xml"] || Buffer.from("")).toString().includes("PAGE"),
)
