// Build StudyFlow_Presentation.pdf (+ .html) — a 12-slide, 16:9 deck that
// reuses the real screenshots and diagrams from docs/img/. Slides are
// 1280x720 CSS px; printed via chrome-headless-shell at exactly 13.333in x
// 7.5in. Layout is checked in-page (overflow + image load) before printing.
//
// Run: node tools/make-deck.mjs
import { spawn } from "node:child_process"
import puppeteer from "puppeteer-core"
import { readFileSync, writeFileSync, mkdtempSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const IMG = join(root, "docs", "img")
const OUT_PDF = join(root, "StudyFlow_Presentation.pdf")
const OUT_HTML = join(root, "StudyFlow_Presentation.html")
const CHROME = join(
  root,
  ".freebuff",
  "browsers",
  "chrome-headless-shell",
  "win64-154.0.8037.57",
  "chrome-headless-shell-win64",
  "chrome-headless-shell.exe",
)
const PORT = 9228
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (file) => readFileSync(join(IMG, file)).toString("base64")
const img = (file, alt) =>
  `data:image/png;base64,${b64(file)}" alt="${alt}" data-check="img"`

// ---------------------------------------------------------------- palette --
const ACCENT = "#47765A"
const ACCENT_DARK = "#2C5641"
const INK = "#1F2A24"
const MUTED = "#5A6B60"
const PAPER = "#FFFFFF"
const TINT = "#F2F5F2"

const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Times New Roman", Times, "Liberation Serif", serif; color: ${INK}; background: #E8ECE9; }
  .slide {
    width: 1280px; height: 720px; background: ${PAPER};
    position: relative; overflow: hidden;
    padding: 52px 64px 64px;
    page-break-after: always;
    display: flex; flex-direction: column;
  }
  .slide:last-child { page-break-after: auto; }
  .kicker {
    font-size: 15px; letter-spacing: 2.5px; text-transform: uppercase;
    color: ${ACCENT}; font-weight: 700; margin-bottom: 10px;
  }
  h2 { font-size: 40px; line-height: 1.15; color: ${ACCENT_DARK}; margin-bottom: 8px; }
  .rule { width: 64px; height: 4px; background: ${ACCENT}; margin: 12px 0 22px; }
  .body { flex: 1; display: flex; min-height: 0; }
  .foot {
    position: absolute; left: 64px; right: 64px; bottom: 26px;
    display: flex; justify-content: space-between;
    font-size: 13px; color: ${MUTED};
    border-top: 1px solid #DDE6DE; padding-top: 8px;
  }
  ul.points { list-style: none; }
  ul.points li {
    font-size: 21px; line-height: 1.45; margin-bottom: 14px;
    padding-left: 26px; position: relative;
  }
  ul.points li::before {
    content: ""; position: absolute; left: 0; top: 11px;
    width: 10px; height: 10px; background: ${ACCENT}; border-radius: 2px;
  }
  ul.points b { color: ${ACCENT_DARK}; }
  .shot {
    border: 1px solid #C9D6CC; border-radius: 6px; overflow: hidden;
    background: ${TINT};
  }
  .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .diagram { border: 1px solid #C9D6CC; border-radius: 6px; background: #fff; }
  .diagram img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .cap { font-size: 13px; color: ${MUTED}; margin-top: 6px; text-align: center; }
  .col { display: flex; flex-direction: column; min-width: 0; }
  .row { display: flex; gap: 20px; min-height: 0; }
  .grow { flex: 1; min-width: 0; min-height: 0; }

  /* title slide */
  .cover { justify-content: center; align-items: center; text-align: center; }
  .cover .brand-bar { width: 90px; height: 7px; background: ${ACCENT}; margin-bottom: 34px; }
  .cover h1 { font-size: 92px; letter-spacing: 10px; color: ${ACCENT_DARK}; }
  .cover .sub { font-size: 30px; color: ${ACCENT}; margin-top: 14px; }
  .cover .tag { font-size: 23px; font-weight: 700; margin-top: 60px; }
  .cover .meta { font-size: 18px; color: ${MUTED}; margin-top: 26px; line-height: 1.6; }

  /* closing slide */
  .closing { background: ${ACCENT_DARK}; color: #fff; justify-content: center; }
  .closing h2 { color: #fff; font-size: 46px; }
  .closing .rule { background: #9DBFAA; }
  .closing ul.points li { color: #E9F0EB; }
  .closing ul.points b { color: #BFD8C9; }
  .closing .foot { color: #AFC7BA; border-top-color: #47765A; }

  .num { font-size: 15px; color: ${MUTED}; }
`

// ------------------------------------------------------------------ slides --
const slide = (kicker, title, body, opts = {}) => `
<section class="slide${opts.cls ? ` ${opts.cls}` : ""}" data-slide>
  ${opts.num !== false ? `<div class="kicker">${kicker}</div><h2>${title}</h2><div class="rule"></div>` : ""}
  ${body}
  <div class="foot"><span>StudyFlow — Research and Technical Documentation</span><span class="num">${
    opts.foot ?? kicker
  }</span></div>
</section>`

const points = (items) =>
  `<ul class="points">${items.map((t) => `<li>${t}</li>`).join("")}</ul>`

const slides = [
  // 1 — title
  slide(
    "",
    "",
    `
    <div class="brand-bar"></div>
    <h1>STUDYFLOW</h1>
    <div class="sub">A Learning, Productivity and Collaboration Platform</div>
    <div class="tag">Research &amp; Technical Overview — 12 slides</div>
    <div class="meta">Blay-Miezah Lemuel Ackah · September 2026 · v1.0<br>
    Companion to the full documentation (85 pp.)</div>`,
    { cls: "cover", num: false, foot: "Overview" },
  ),

  // 2 — problem
  slide(
    "The Problem",
    "Long hours, little retained",
    `<div class="body"><div class="grow">${points([
      "Students default to <b>passive rereading, cramming and marathon sessions</b> — habits poorly matched to how memory works.",
      "Decades of cognitive research point the other way: <b>retrieval practice, spacing, interleaving and focused work with real breaks</b>.",
      "The techniques are known — but they are <b>hard to organise and sustain</b> with paper timetables and willpower alone.",
      "StudyFlow's premise: <b>turn the evidence into a workspace</b> students actually use every day.",
    ])}</div></div>`,
    { foot: "Slide 2" },
  ),

  // 3 — what it is
  slide(
    "The Product",
    "One connected study workspace",
    `<div class="body"><div class="col grow" style="padding-right:28px;">${points([
      "A <b>Pomodoro-style Focus Desk</b> with tasks, streaks and sessions.",
      "A <b>guided library of study techniques</b> with a personal fit assessment.",
      "A <b>book library with an in-browser EPUB reader</b> and companion prompts.",
      "<b>Ambient sound studios</b> for focused work.",
      "A <b>social layer</b>: groups, messaging, voice/video calls, expiring statuses.",
      "A <b>reward economy</b>: coins, achievements and a store.",
    ])}</div>
    <div class="col" style="width:520px;"><div class="shot grow"><img src="${img(
      "fig-landing.png",
      "StudyFlow landing page",
    )}"></div><div class="cap">The StudyFlow landing page</div></div></div>`,
    { foot: "Slide 3" },
  ),

  // 4 — focus desk
  slide(
    "Feature — Focus Desk",
    "The timer at the centre",
    `<div class="body"><div class="col" style="width:640px;"><div class="shot grow"><img src="${img(
      "fig-timer.png",
      "Focus Desk timer tab",
    )}"></div><div class="cap">Focus Desk on desktop</div></div>
    <div class="col" style="flex:1; padding-left:24px;">
      <div class="row" style="flex:1;">
        <div class="col" style="width:190px;"><div class="shot grow"><img src="${img(
          "fig-mobile-timer.png",
          "Timer on mobile",
        )}"></div></div>
        <div class="col grow"><div class="shot grow"><img src="${img(
          "fig-night-timer.png",
          "Timer in night mode",
        )}"></div></div>
      </div>
      <div class="cap">Responsive on mobile · night mode built in</div>
      <div style="margin-top:14px;">${points([
        "Presets, sessions and <b>streak tracking</b> keep the routine honest.",
      ])}</div>
    </div></div>`,
    { foot: "Slide 4" },
  ),

  // 5 — learning science
  slide(
    "Learning Science",
    "A session cycle designed from the evidence",
    `<div class="body"><div class="col grow" style="justify-content:center;">
      <div class="diagram" style="height:200px;"><img src="${img(
        "dia-cycle.png",
        "Pomodoro session cycle diagram",
      )}"></div>
      <div class="cap">Focus → short break → repeat → long break</div>
      <div style="margin-top:26px;">${points([
        "Work in <b>focused intervals</b> separated by restorative breaks.",
        "Breaks and limits counter <b>attention residue</b> from task switching.",
        "The desk nudges the cycle; the student stays in control.",
      ])}</div>
    </div></div>`,
    { foot: "Slide 5" },
  ),

  // 6 — techniques
  slide(
    "Feature — Techniques",
    "Guided methods, matched to the student",
    `<div class="body"><div class="col" style="width:560px;"><div class="shot grow"><img src="${img(
      "fig-techniques.png",
      "Techniques tab",
    )}"></div><div class="cap">The Techniques library</div></div>
    <div class="col grow" style="padding-left:26px;">
      <div class="diagram" style="height:170px;"><img src="${img(
        "dia-techniques.png",
        "Technique assessment flow diagram",
      )}"></div>
      <div class="cap">Orientation assessment → personal fit</div>
      <div style="margin-top:16px;">${points([
        "Each method explains <b>what to do and why it works</b>.",
        "The check <b>orients, it does not diagnose</b> — honest by design.",
      ])}</div>
    </div></div>`,
    { foot: "Slide 6" },
  ),

  // 7 — library/sounds/community
  slide(
    "Feature — Study Life",
    "Library, sound and community in one place",
    `<div class="body"><div class="row grow">
      <div class="col grow"><div class="shot grow"><img src="${img(
        "fig-books.png",
        "Book library",
      )}"></div><div class="cap">EPUB reader &amp; prompts</div></div>
      <div class="col grow"><div class="shot grow"><img src="${img(
        "fig-sounds.png",
        "Sound studio",
      )}"></div><div class="cap">Synthesised ambience</div></div>
      <div class="col grow"><div class="shot grow"><img src="${img(
        "fig-community.png",
        "Community tab",
      )}"></div><div class="cap">Groups &amp; messaging</div></div>
    </div></div>`,
    { foot: "Slide 7" },
  ),

  // 8 — rewards
  slide(
    "Feature — Motivation",
    "Coins, achievements and a store",
    `<div class="body"><div class="col" style="width:600px;"><div class="shot grow"><img src="${img(
      "fig-store.png",
      "Store tab",
    )}"></div><div class="cap">The reward store</div></div>
    <div class="col grow" style="padding-left:26px;">${points([
      "Focus sessions and streaks earn <b>coins</b>.",
      "Achievements mark <b>real milestones</b>, not busywork.",
      "The store turns consistency into <b>visible progress</b>.",
      "Gamification follows the research on <b>careful extrinsic rewards</b> — supporting, not replacing, intrinsic motivation.",
    ])}</div></div>`,
    { foot: "Slide 8" },
  ),

  // 9 — architecture
  slide(
    "Under the Hood",
    "A disciplined vanilla-JS architecture",
    `<div class="body"><div class="col grow" style="align-items:center; justify-content:center;">
      <div class="diagram" style="width:1000px; height:380px;"><img src="${img(
        "dia-architecture.png",
        "System architecture diagram",
      )}"></div>
      <div style="margin-top:22px; width:1000px;">${points([
        "<b>Single static shell</b>; routes lazy-load as ES-module chunks.",
        "Main bundle ≈ <b>288 kB</b>; everything else fetched on demand.",
        "A <b>service worker</b> precaches the shell — the app works fully offline.",
      ])}</div>
    </div></div>`,
    { foot: "Slide 9" },
  ),

  // 10 — data & security
  slide(
    "Under the Hood",
    "Supabase: PostgreSQL, auth and enforced privacy",
    `<div class="body"><div class="col" style="width:640px;"><div class="diagram grow"><img src="${img(
      "dia-database.png",
      "Database entity map",
    )}"></div><div class="cap">Entity map (simplified)</div></div>
    <div class="col grow" style="padding-left:26px;">${points([
      "<b>41 PostgreSQL tables</b> across 24 migrations.",
      "<b>136 Row Level Security policies</b> — privacy enforced by the database, not the client.",
      "Auth, Storage and <b>Realtime</b> channels from one managed platform.",
      "No self-hosted servers; <b>no secrets in the client</b>.",
    ])}</div></div>`,
    { foot: "Slide 10" },
  ),

  // 11 — realtime
  slide(
    "Under the Hood",
    "Real-time presence, statuses and calls",
    `<div class="body"><div class="col grow" style="justify-content:center;">
      <div class="diagram" style="height:150px;"><img src="${img(
        "dia-auth.png",
        "Authentication flow diagram",
      )}"></div>
      <div class="cap">JWT sessions through Supabase Auth</div>
      <div class="diagram" style="height:150px; margin-top:14px;"><img src="${img(
        "dia-call.png",
        "Call flow diagram",
      )}"></div>
      <div class="cap">WebRTC peer-to-peer voice &amp; video, optional TURN</div>
      <div style="margin-top:16px;">${points([
        "Expiring <b>status updates</b> (24-hour lifetime, server-enforced).",
      ])}</div>
    </div></div>`,
    { foot: "Slide 11" },
  ),

  // 12 — closing
  slide(
    "Closing",
    "What is real, and what comes next",
    `<div class="body"><div class="col grow">${points([
      "<b>Built and verified:</b> the full platform documented feature-by-feature against the codebase.",
      "<b>Honest limits:</b> no experimental evaluation of learning outcomes yet; React/Tailwind scaffolding unused.",
      "<b>Next:</b> a controlled study of StudyFlow's effect on retention, plus social and content expansion.",
    ])}</div></div>
    <div style="font-size:22px; color:#BFD8C9; margin-bottom:30px;">
      Full details: <i>StudyFlow_Documentation</i> — 21 chapters, 41 references, 8 appendices.
    </div>`,
    { cls: "closing", foot: "Slide 12" },
  ),
]

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>StudyFlow — Presentation</title>
<style>${css}</style>
</head>
<body>
${slides.join("\n")}
</body>
</html>`

writeFileSync(OUT_HTML, html)
console.log(`wrote ${basename(OUT_HTML)} (${(html.length / 1e6).toFixed(1)} MB)`)

// --------------------------------------------------------- print with checks --
const tmp = mkdtempSync(join(tmpdir(), "sfdeck-"))
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

let failures = 0
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  await page.setContent(html, { waitUntil: "load", timeout: 120000 })
  await sleep(1200)

  const audit = await page.evaluate(() => {
    const out = { slides: 0, images: 0, imagesBroken: 0, overflows: [] }
    const deck = [...document.querySelectorAll("[data-slide]")]
    out.slides = deck.length
    for (const s of deck) {
      const sr = s.getBoundingClientRect()
      for (const el of s.querySelectorAll("*")) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const over =
          r.right - sr.right > 1 || r.bottom - sr.bottom > 1 ||
          sr.left - r.left > 1 || sr.top - r.top > 1
        if (over) {
          out.overflows.push(
            `${out.slides ? deck.indexOf(s) + 1 : "?"}:${el.tagName}.${el.className || ""}`.slice(0, 60),
          )
        }
      }
    }
    for (const im of document.images) {
      out.images++
      if (!im.complete || im.naturalWidth === 0) out.imagesBroken++
    }
    return out
  })

  console.log(
    `slides=${audit.slides} images=${audit.images} broken=${audit.imagesBroken} overflows=${audit.overflows.length}`,
  )
  if (audit.overflows.length) {
    console.log("overflow details:", [...new Set(audit.overflows)].slice(0, 12))
  }
  if (audit.slides !== 12 || audit.imagesBroken > 0 || audit.overflows.length > 0) {
    failures++
  }

  await page.pdf({
    path: OUT_PDF,
    width: "13.333in",
    height: "7.5in",
    printBackground: true,
    pageRanges: "1-12",
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    timeout: 120000,
  })
  const size = statSync(OUT_PDF).size
  console.log(
    `wrote ${basename(OUT_PDF)} — ${(size / 1e6).toFixed(2)} MB${failures ? " (WITH WARNINGS)" : ""}`,
  )
} finally {
  await browser.disconnect().catch(() => {})
  proc.kill()
}

console.log(failures ? "deck built with warnings" : "ok")
process.exitCode = failures ? 1 : 0
