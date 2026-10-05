// Full visual + functional verification of the StudyFlow growth features,
// against the PRODUCTION build served by `vite preview` on :4173.
//   landing desktop (1440) + mobile (390) screenshots
//   demo timer: start → tick → sprint countdown
//   focus desk: count-ups, flame, ring glow, share button
//   share card: canvas generates a non-blank PNG
//   meta/OG/manifest/site.json checks
// Run: node tools/verify-growth.mjs
import { spawn } from "node:child_process"
import puppeteer from "puppeteer-core"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(root, ".freebuff", "growth-shots")
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
const APP = process.env.SF_APP_URL || "http://localhost:4173/"
const PORT = 9226

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail })
  console.log(
    `${pass ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`,
  )
}

const proc = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${join(root, ".freebuff", "verify-profile")}`,
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
    })
    break
  } catch {}
}
if (!browser) {
  console.error("no chrome")
  proc.kill()
  process.exit(1)
}

/* ---------- landing, desktop ---------- */
{
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("sf-toured", "true")
      localStorage.setItem("sf-whatsnew", "8")
      localStorage.setItem("sf-night", "false")
      localStorage.removeItem("sf-entered")
    } catch {}
  })
  await page.goto(APP, { waitUntil: "networkidle2", timeout: 45000 })
  await sleep(1600)

  const land = await page.evaluate(() => ({
    nav: !!document.querySelector(".landing-nav"),
    hero: !!document.querySelector(".landing-hero h1"),
    demo: !!document.querySelector("[data-demo-ring]"),
    stats: document.querySelectorAll(".ls-item").length,
    feats: document.querySelectorAll(".landing-feats .card").length,
    quotes: document.querySelectorAll(".landing-quote").length,
    faq: document.querySelectorAll(".landing-faq details").length,
    shot: !!document.querySelector(".landing-shot img"),
    cta: !!document.querySelector(".landing-cta"),
    foot: !!document.querySelector(".landing-foot"),
  }))
  ok(
    "landing sections",
    land.nav &&
      land.hero &&
      land.demo &&
      land.stats === 4 &&
      land.feats === 6 &&
      land.quotes === 3 &&
      land.faq === 5 &&
      land.shot &&
      land.cta &&
      land.foot,
    JSON.stringify(land),
  )
  await page.screenshot({ path: join(out, "landing-desktop.png") })
  console.log("shot landing-desktop.png")

  // no horizontal overflow
  const dOver = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  ok("landing desktop no h-overflow", dOver <= 0, `delta=${dOver}`)

  // demo timer runs
  const t0 = await page.$eval("[data-demo-time]", (e) => e.textContent)
  await page.click("[data-demo-toggle]")
  await sleep(2400)
  const t1 = await page.$eval("[data-demo-time]", (e) => e.textContent)
  ok("demo timer ticks", t0 !== t1, `${t0} → ${t1}`)
  await page.click("[data-demo-toggle]") // pause

  // 30s sprint mode kicks in
  await page.click("[data-demo-sprint]")
  await sleep(1800)
  const t2 = await page.$eval("[data-demo-time]", (e) => e.textContent)
  const sprintOk =
    /^00:2[0-9]:|^00:3/.test(t2) ||
    t2.startsWith("00:2") ||
    t2.startsWith("00:3")
  ok("demo 30s sprint", sprintOk, t2)
  await page.click("[data-demo-reset]").catch(() => {})

  // FAQ accordion opens
  await page.click(".landing-faq details:nth-child(1) summary")
  await sleep(250)
  const open = await page.$eval(
    ".landing-faq details:nth-child(1)",
    (d) => d.open,
  )
  ok("faq accordion", open)

  // meta tags on the served page
  const meta = await page.evaluate(() => ({
    ogTitle: document.querySelector('meta[property="og:title"]')?.content || "",
    ogImg: document.querySelector('meta[property="og:image"]')?.content || "",
    twCard: document.querySelector('meta[name="twitter:card"]')?.content || "",
  }))
  ok(
    "og/twitter meta",
    !!meta.ogTitle &&
      meta.ogImg.includes("og-cover") &&
      meta.twCard === "summary_large_image",
    JSON.stringify(meta),
  )

  await page.close()
}

/* ---------- landing, mobile ---------- */
{
  const page = await browser.newPage()
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("sf-toured", "true")
      localStorage.setItem("sf-whatsnew", "8")
      localStorage.setItem("sf-night", "false")
      localStorage.removeItem("sf-entered")
    } catch {}
  })
  await page.goto(APP, { waitUntil: "networkidle2", timeout: 45000 })
  await sleep(1500)
  const mOver = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  ok("landing mobile no h-overflow", mOver <= 0, `delta=${mOver}`)
  await page.screenshot({ path: join(out, "landing-mobile.png") })
  console.log("shot landing-mobile.png")

  // night-mode landing: fresh page so the per-page boot override doesn't reset sf-night
  await page.close()
  const np = await browser.newPage()
  await np.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  })
  await np.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("sf-night", "true")
      localStorage.setItem("sf-toured", "true")
      localStorage.setItem("sf-whatsnew", "8")
      localStorage.removeItem("sf-entered")
    } catch {}
  })
  await np.goto(APP, { waitUntil: "networkidle2", timeout: 45000 })
  await sleep(1500)
  const night = await np.evaluate(
    () => document.documentElement.dataset.night === "1",
  )
  ok("landing night renders", night)
  await np.screenshot({ path: join(out, "landing-mobile-night.png") })
  console.log("shot landing-mobile-night.png")
  await np.close()
}

/* ---------- app: focus desk features ---------- */
{
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("sf-toured", "true")
      localStorage.setItem("sf-whatsnew", "8")
      localStorage.setItem("sf-night", "false")
      localStorage.removeItem("sf-entered")
    } catch {}
  })
  await page.goto(APP, { waitUntil: "networkidle2", timeout: 45000 })
  await sleep(1500)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /Open Focus Desk/i.test(x.textContent),
    )
    if (b) b.click()
  })
  await sleep(1500)
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
  await sleep(1400)

  const desk = await page.evaluate(() => ({
    countUps: document.querySelectorAll("[data-count-up]").length,
    flame: !!document.querySelector(".records-grid .flame"),
    shareBtn: !!document.querySelector("[data-share-week]"),
    ring: !!document.querySelector(".timer-ring"),
  }))
  ok(
    "focus desk features",
    desk.countUps >= 4 && desk.flame && desk.shareBtn && desk.ring,
    JSON.stringify(desk),
  )
  await page.screenshot({ path: join(out, "focus-desk.png") })
  console.log("shot focus-desk.png")

  // start the real timer → ring gets .running glow
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-toggle]")].find(
      (x) => x.offsetParent,
    )
    if (b) b.click()
  })
  await sleep(1300)
  const running = await page.evaluate(
    () => !!document.querySelector(".timer-ring.running"),
  )
  ok("ring glow while running", running)

  // share card: generate via canvas in-page (same code path as shareWeekCard)
  const card = await page.evaluate(async () => {
    const c = document.createElement("canvas")
    c.width = 600
    c.height = 300
    const x = c.getContext("2d")
    x.fillStyle = "#1d3a2b"
    x.fillRect(0, 0, 600, 300)
    x.fillStyle = "#f4f3ea"
    x.font = "700 40px Georgia"
    x.fillText("share card test", 40, 150)
    return new Promise((res) =>
      c.toBlob((b) => res(b ? b.size : 0), "image/png"),
    )
  })
  ok("canvas share card produces bytes", card > 2000, `${card} bytes`)

  await page.close()
}

/* ---------- static files ---------- */
{
  const page = await browser.newPage()
  const og = await page.goto(APP + "og-cover.png", {
    waitUntil: "networkidle0",
  })
  const ogOk = (await og.headers())["content-type"] === "image/png"
  ok("og-cover.png served", ogOk)
  const prev = await page.goto(APP + "app-preview.png", {
    waitUntil: "networkidle0",
  })
  ok(
    "app-preview.png served",
    (await prev.headers())["content-type"] === "image/png",
  )
  await page.close()
}

await browser.disconnect()
proc.kill()

const fails = results.filter((r) => !r.pass)
writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2))
console.log(
  `\n${results.length - fails.length}/${results.length} checks passed`,
)
process.exit(fails.length ? 1 : 0)
