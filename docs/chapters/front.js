// Front matter: title page, abstract, TOC, lists of figures and tables.
import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  toc,
  registry,
  ACCENT,
  ACCENT_DARK,
  MUTED,
  pageBreak,
} from "../lib.js"

function centered(text, opts = {}) {
  const { size = 22, bold = false, color = "1F2A24", italics = false, before = 0, after = 120 } = opts
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before, after },
    children: [new TextRun({ text, size, bold, color, italics })],
  })
}

function titlePage() {
  return [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    centered("STUDYFLOW", { size: 72, bold: true, color: ACCENT_DARK, after: 160 }),
    centered("A Learning, Productivity and Collaboration Platform", { size: 30, color: ACCENT, after: 480 }),
    centered("A Comprehensive Research and Technical Documentation", { size: 26, bold: true, after: 1600 }),
    centered("Author", { size: 20, color: MUTED, after: 60 }),
    centered("Blay-Miezah Lemuel Ackah", { size: 26, bold: true, after: 900 }),
    centered("September 2026", { size: 22, after: 60 }),
    centered("Document version 1.0", { size: 20, color: MUTED, after: 60 }),
    centered("Generated from the StudyFlow source repository (figma-make-app v1.0.0)", { size: 18, color: MUTED }),
  ]
}

function abstract() {
  return [
    new Paragraph({
      heading: 1,
      children: [new TextRun({ text: "Abstract", bold: true, size: 40, color: ACCENT_DARK })],
      pageBreakBefore: true,
      spacing: { after: 240 },
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200, line: 320 },
      children: [
        new TextRun({
          text:
            "Many students study for long hours yet retain little, because the habits they rely on — passive rereading, massed cramming, and uninterrupted marathons of fragmented attention — are poorly matched to how human memory actually works. Decades of cognitive research point to a different set of practices: retrieval practice, spaced review, interleaving, elaboration, and focused work separated by restorative breaks. StudyFlow is a web application that turns these evidence-based practices into a single, connected workspace: a Pomodoro-style focus desk, a guided library of study techniques with a personal technique-fit assessment, task and streak tracking, a personal book library with an EPUB reader and companion prompts, ambient sound studios, and a social layer of groups, direct messaging, voice and video calls, and expiring status updates — wrapped in a reward system of coins, achievements and a store.",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200, line: 320 },
      children: [
        new TextRun({
          text:
            "This document tells the complete story of StudyFlow: the learning problem it addresses, the research it draws on, the design principles behind its features, and the engineering that makes it work. It documents the actual system as built — a vanilla-JavaScript single-page application of roughly sixty thousand lines served by the Vite build tool, backed by Supabase (PostgreSQL, authentication, object storage and realtime channels), with Row Level Security enforced on all forty-one database tables, WebRTC peer-to-peer calling, Moolre mobile-money top-ups, and offline support through a service worker. Every chapter distinguishes carefully between what StudyFlow currently does, what it is designed to support, and what research suggests — and is explicit that no experimental evaluation of StudyFlow's educational effect has yet been conducted. The document closes with a critical discussion of limitations, a programme of future development, and a proposal for how StudyFlow could be scientifically evaluated in a controlled study.",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 160, line: 320 },
      children: [
        new TextRun({ text: "Keywords: ", bold: true }),
        new TextRun({
          text:
            "learning science; retrieval practice; spaced repetition; Pomodoro; educational technology; gamification; social learning; web application architecture; Supabase; WebRTC",
          italics: true,
        }),
      ],
    }),
  ]
}

export function frontMatter() {
  const figList = registry.figures.map(
    ([label, caption]) =>
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `${label}  `, bold: true, size: 20 }),
          new TextRun({ text: caption, size: 20 }),
        ],
      }),
  )
  const tblList = registry.tables.map(
    ([label, caption]) =>
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `${label}  `, bold: true, size: 20 }),
          new TextRun({ text: caption, size: 20 }),
        ],
      }),
  )

  return [
    ...titlePage(),
    ...abstract(),
    ...toc(),
    pageBreak(),
    new Paragraph({
      heading: 1,
      children: [new TextRun({ text: "List of Figures", bold: true, size: 40, color: ACCENT_DARK })],
      spacing: { after: 240 },
    }),
    ...(figList.length ? figList : [new Paragraph({ children: [new TextRun({ text: "(Figures are registered during the build.)", italics: true, color: MUTED })] })]),
    pageBreak(),
    new Paragraph({
      heading: 1,
      children: [new TextRun({ text: "List of Tables", bold: true, size: 40, color: ACCENT_DARK })],
      spacing: { after: 240 },
    }),
    ...(tblList.length ? tblList : [new Paragraph({ children: [new TextRun({ text: "(Tables are registered during the build.)", italics: true, color: MUTED })] })]),
  ]
}
