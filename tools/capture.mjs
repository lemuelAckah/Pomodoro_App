// Captures real StudyFlow screens from the production preview server
// (http://localhost:4173) into docs/img/. Launches the locally installed
// Edge with a CDP debugging port and attaches puppeteer-core to it.
// Run: node tools/capture.mjs
import { spawn } from "node:child_process"
import puppeteer from "puppeteer-core"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(root, "docs", "img")
mkdirSync(out, { recursive: true })

const EDGE = join(
  root,
  ".freebuff",
  "browsers",
  "chrome-headless-shell",
  "win64-154.0.8037.57",
  "chrome-headless-shell-win64",
  "chrome-headless-shell.exe",
)
const APP = "http://localhost:4173/"
const PORT = 9223

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- launch Edge headless with a debugging port -------------------------
const profile = join(root, ".freebuff", "edge-profile")
const proc = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: false },
)

// Wait for the CDP endpoint.
let browser = null
for (let i = 0; i < 30; i++) {
  await sleep(500)
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${PORT}`,
      defaultViewport: { width: 1280, height: 800 },
    })
    break
  } catch {
    /* not up yet */
  }
}
if (!browser) {
  console.error("could not attach to Edge")
  proc.kill()
  process.exit(1)
}

const page = await browser.newPage()

// --- helper: navigate, enter app, settle --------------------------------
await page.goto(APP, { waitUntil: "networkidle2", timeout: 30000 })
await sleep(1500)

// Skip the onboarding Technique Check if it shows.
await page.evaluate(() => {
  const skip = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Skip for now",
  )
  if (skip) skip.click()
})
await sleep(800)

// Enter the workspace from the landing screen.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent.includes("Open Focus Desk"),
  )
  if (btn) btn.click()
})
await sleep(1800)

// Dismiss the feature tour if it appeared.
await page.evaluate(() => {
  const skip = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Skip",
  )
  if (skip) skip.click()
})
await sleep(500)

// --- captures ------------------------------------------------------------
async function shot(name) {
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log(`OK ${name}`)
}

async function goTab(tab) {
  const ok = await page.evaluate((t) => {
    const b = document.querySelector(`[data-tab="${t}"]`)
    if (!b) return false
    b.click()
    return true
  }, tab)
  await sleep(900)
  return ok
}

// Landing screen (guest mode).
await page.goto(APP, { waitUntil: "networkidle2" })
await sleep(1200)
await shot("fig-landing")

// Back into the workspace.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent.includes("Open Focus Desk"),
  )
  if (btn) btn.click()
})
await sleep(1800)
await page.evaluate(() => {
  const skip = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Skip",
  )
  if (skip) skip.click()
})
await sleep(500)

for (const tab of [
  "timer",
  "techniques",
  "sounds",
  "community",
  "books",
  "store",
  "favorites",
  "account",
  "settings",
]) {
  if (await goTab(tab)) await shot(`fig-${tab}`)
  else console.log(`SKIP ${tab}`)
}

// Mobile viewport (responsive-design chapter).
await page.setViewport({ width: 390, height: 844 })
await sleep(700)
await goTab("timer")
await shot("fig-mobile-timer")

// Night mode (theme chapter).
await page.setViewport({ width: 1280, height: 800 })
await sleep(600)
await page.evaluate(() => {
  const t = document.querySelector(
    '[aria-label*="night" i], [data-night-toggle], [role="switch"]',
  )
  if (t) t.click()
})
await sleep(900)
await shot("fig-night-timer")

await browser.disconnect()
proc.kill()
console.log("done")
