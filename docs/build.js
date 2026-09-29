// Builds StudyFlow_Documentation.docx from the chapter modules.
// Run: node docs/build.js
import {
  Document,
  Footer,
  Header,
  PageNumber,
  Paragraph,
  TextRun,
  AlignmentType,
  writeDocx,
  registry,
  ACCENT,
} from "./lib.js"

import { frontMatter } from "./chapters/front.js"
import { ch1, ch2, ch3, ch4, ch5 } from "./chapters/c01-05.js"
import { ch6, ch7, ch8, ch9, ch10 } from "./chapters/c06-10.js"
import { ch11, ch12, ch13, ch14, ch15, ch16 } from "./chapters/c11-16.js"
import { ch17, ch18, ch19, ch20, ch21 } from "./chapters/c17-21.js"
import { references, glossary, appendices } from "./chapters/back.js"

// Run chapters FIRST so figure/table registries are populated before the
// List of Figures / List of Tables pages are built.
const ch = {
  ch1: ch1(),
  ch2: ch2(),
  ch3: ch3(),
  ch4: ch4(),
  ch5: ch5(),
  ch6: ch6(),
  ch7: ch7(),
  ch8: ch8(),
  ch9: ch9(),
  ch10: ch10(),
  ch11: ch11(),
  ch12: ch12(),
  ch13: ch13(),
  ch14: ch14(),
  ch15: ch15(),
  ch16: ch16(),
  ch17: ch17(),
  ch18: ch18(),
  ch19: ch19(),
  ch20: ch20(),
  ch21: ch21(),
  refs: references(),
  glossary: glossary(),
  appendices: appendices(),
}

const children = [
  ...frontMatter(),
  ...ch.ch1,
  ...ch.ch2,
  ...ch.ch3,
  ...ch.ch4,
  ...ch.ch5,
  ...ch.ch6,
  ...ch.ch7,
  ...ch.ch8,
  ...ch.ch9,
  ...ch.ch10,
  ...ch.ch11,
  ...ch.ch12,
  ...ch.ch13,
  ...ch.ch14,
  ...ch.ch15,
  ...ch.ch16,
  ...ch.ch17,
  ...ch.ch18,
  ...ch.ch19,
  ...ch.ch20,
  ...ch.ch21,
  ...ch.refs,
  ...ch.glossary,
  ...ch.appendices,
]

const doc = new Document({
  creator: "Blay-Miezah Lemuel Ackah",
  title: "StudyFlow — A Comprehensive Research and Technical Documentation",
  description:
    "Research and technical documentation of the StudyFlow learning, productivity and collaboration platform.",
  styles: {
    default: {
      document: {
        run: { font: "Aptos", size: 22, color: "1F2A24" },
        paragraph: { spacing: { line: 300, after: 160 } },
      },
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 40, bold: true, color: "2C5641", font: "Aptos" },
        paragraph: {
          spacing: { before: 240, after: 240 },
          outlineLevel: 0,
        },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 30, bold: true, color: "2C5641", font: "Aptos" },
        paragraph: {
          spacing: { before: 300, after: 140 },
          outlineLevel: 1,
        },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 25, bold: true, color: "1F2A24", font: "Aptos" },
        paragraph: {
          spacing: { before: 220, after: 110 },
          outlineLevel: 2,
        },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "doc-num",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 460, hanging: 260 } } },
          },
        ],
      },
    ],
  },
  features: { updateFields: true },
  sections: [
    {
      properties: { page: { margin: { top: 1130, bottom: 1130, left: 1240, right: 1240 } } },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 0 },
              children: [
                new TextRun({
                  text: "StudyFlow — Research and Technical Documentation",
                  size: 17,
                  color: "5A6B60",
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 0 },
              children: [
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: ACCENT }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
})

const out = "StudyFlow_Documentation.docx"
await writeDocx(doc, out)
console.log(
  `Wrote ${out} — ${registry.figures.length} figures, ${registry.tables.length} tables`,
)
