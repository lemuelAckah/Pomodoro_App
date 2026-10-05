// Generates the two brand images the landing page and social cards need:
//   public/og-cover.png    — 1200×630 Open Graph / Twitter share card
//   public/app-preview.png — 1440×900 Focus desk screenshot (landing showcase)
// Uses the local chrome-headless-shell via puppeteer-core (same pattern as
// tools/capture.mjs). Run: node tools/make-og.mjs  (dev server on :50303)
import { spawn } from "node:child_process"
import puppeteer from "puppeteer-core"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(root, "public")
mkdirSync(out, { recursive: true })

const CHROME = join(
  root,
  ".freebuff",
  "browsers",
  "chrome-headless-shell",
  "win64-154.0.8037.57",
  "chrome-headless-shell-win64",
  "chrome-headless-shell.exe",
)
const APP = process.env.SF_APP_URL || "http://localhost:50303/"
const PORT = 9225

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const proc = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${join(root, ".freebuff", "og-profile")}`,
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: false },
)

let browser = null
for (let i = 0; i < 30; i++) {
  await sleep(500)
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORT}`,
      defaultViewport: { width: 1200, height: 630 },
    })
    break
  } catch {
    /* not up yet */
  }
}
if (!browser) {
  console.error("could not attach to chrome-headless-shell")
  proc.kill()
  process.exit(1)
}

/* ---- 1. Open Graph share card (1200×630) ------------------------------ */
{
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
  const html = OG_HTML()
  await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 })
  await page.evaluate(() => document.fonts.ready)
  await sleep(700)
  writeFileSync(join(out, "og-preview.html"), html)
  await page.screenshot({ path: join(out, "og-cover.png") })
  console.log("OK og-cover.png")
  await page.close()
}

/* ---- 2. Focus desk screenshot (1440×900) ------------------------------ */
try {
  const page = await browser.newPage()

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

  // Seed a clean pre-boot state: light mode, no tour/whats-new modals,
  // landing visible so we enter like a real visitor.
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("sf-night", "false")
      localStorage.setItem("sf-toured", "true")
      localStorage.setItem("sf-whatsnew", "8")
      localStorage.removeItem("sf-entered")
    } catch {}
  })

  await page.goto(APP, { waitUntil: "networkidle2", timeout: 45000 })
  await sleep(1600)

  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Open Focus Desk/i.test(x.textContent),
    )
    if (b) b.click()
  })
  await sleep(1400)

  await page.evaluate(() => {
    const s = [...document.querySelectorAll("button")].find(
      (x) => x.textContent.trim() === "Skip for now",
    )
    if (s) s.click()
  })
  await sleep(900)

  await page.evaluate(() => {
    const s = [...document.querySelectorAll("button")].find(
      (x) => x.textContent.trim() === "Skip",
    )
    if (s) s.click()
  })
  await sleep(1600)

  await page.screenshot({ path: join(out, "app-preview.png") })
  console.log("OK app-preview.png")
  await page.close()
} catch (err) {
  console.error("app-preview failed:", err.message)
}

await browser.disconnect()
proc.kill()
console.log("done")

/* ---- Share-card markup ------------------------------------------------ */
function OG_HTML() {
  const chips = [
    "10 study techniques",
    "Live sprint rooms",
    "MoMo top-ups",
    "Works offline",
  ]
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: "Fraunces", Georgia, serif;
    background:
      radial-gradient(700px 420px at 88% 4%, rgba(184,215,124,.22), transparent 60%),
      radial-gradient(560px 380px at 6% 96%, rgba(233,174,63,.14), transparent 62%),
      linear-gradient(135deg, #1d3a2b 0%, #0c1310 100%);
    color: #f4f3ea;
  }
  .frame { position: absolute; inset: 26px; border: 2px solid rgba(242,240,228,.22); border-radius: 30px; pointer-events: none; }
  .wrap { position: absolute; inset: 26px; border-radius: 30px; padding: 44px 52px 40px; display: flex; flex-direction: column; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .mark {
    width: 54px; height: 54px; border-radius: 17px; display: grid; place-items: center;
    background: linear-gradient(140deg, rgba(242,240,228,.16), rgba(242,240,228,.06));
    border: 1px solid rgba(242,240,228,.26); font-size: 28px; color: #f4f3ea;
  }
  .word { font-family: "Space Mono", monospace; font-weight: 700; font-size: 18px; letter-spacing: 8px; color: rgba(238,240,230,.8); }
  .mid { max-width: 760px; }
  h1 { font-size: 72px; font-weight: 700; letter-spacing: -2px; line-height: 1.06; text-shadow: 0 4px 40px rgba(5,10,7,.55); }
  h1 em { font-style: normal; color: #b8d77c; }
  .sub { margin-top: 20px; font-family: system-ui, sans-serif; font-size: 24px; font-weight: 500; color: rgba(238,240,230,.78); line-height: 1.45; }
  .chips { margin-top: 30px; display: flex; gap: 12px; flex-wrap: wrap; }
  .chip {
    font-family: system-ui, sans-serif; font-size: 16px; font-weight: 600; color: rgba(238,240,230,.85);
    border: 1px solid rgba(242,240,228,.28); background: rgba(242,240,228,.08); border-radius: 999px; padding: 8px 18px;
  }
  .bottom { display: flex; align-items: flex-end; justify-content: space-between; }
  .foot { font-family: "Space Mono", monospace; font-size: 14px; color: rgba(238,240,230,.5); letter-spacing: 2px; padding-bottom: 18px; }
  .ringbox { display: flex; align-items: flex-end; gap: 26px; }
  .ring {
    width: 216px; height: 216px; border-radius: 50%;
    background: conic-gradient(#b8d77c 292deg, rgba(242,240,228,.14) 0);
    display: grid; place-items: center;
    filter: drop-shadow(0 0 30px rgba(184,215,124,.35));
    position: relative;
  }
  .ring:after { content: ""; position: absolute; inset: 11px; border-radius: 50%; background: #10190f; }
  .ring b { position: relative; z-index: 1; font-family: "Space Mono", monospace; font-size: 40px; font-weight: 700; letter-spacing: -2px; }
  .ring i { position: relative; z-index: 1; display: block; text-align: center; font-family: system-ui, sans-serif; font-style: normal; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #b8d77c; font-weight: 700; margin-top: 5px; }
</style></head><body>
  <div class="frame"></div>
  <div class="wrap">
    <div class="brand"><div class="mark">◷</div><div class="word">STUDYFLOW</div></div>
    <div class="mid">
      <h1>Focus with <em>intention.</em></h1>
      <p class="sub">Pomodoro sessions, streaks, study buddies and rewards — one calm workspace for deep work.</p>
      <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join("")}</div>
    </div>
    <div class="bottom">
      <div class="foot">STUDYFLOW · FREE FOREVER</div>
      <div class="ringbox"><div class="ring"><div><b>25:00</b><i>Focus</i></div></div></div>
    </div>
  </div>
</body></html>`
}
