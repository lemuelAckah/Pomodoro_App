// Renders documentation diagrams to docs/img/*.png using
// chrome-headless-shell + puppeteer-core. Each diagram is authored as a
// small HTML page (sage accent #47765a) and screenshotted at 2x scale.
// Run: node tools/diagrams.mjs
import { spawn } from "node:child_process"
import puppeteer from "puppeteer-core"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(root, "docs", "img")
const tmp = join(root, ".freebuff", "diagrams")
mkdirSync(out, { recursive: true })
mkdirSync(tmp, { recursive: true })

const BROWSER = join(
  root,
  ".freebuff",
  "browsers",
  "chrome-headless-shell",
  "win64-154.0.8037.57",
  "chrome-headless-shell-win64",
  "chrome-headless-shell.exe",
)

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", "Aptos", Calibri, sans-serif;
    background: #ffffff; color: #1f2a24; padding: 28px;
  }
  .wrap { background: #fff; }
  .flow { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: nowrap; }
  .flow.col { flex-direction: column; }
  .node {
    border: 1.6px solid #47765a; border-radius: 10px; background: #f4f8f5;
    padding: 10px 16px; text-align: center; min-width: 96px;
  }
  .node b { display: block; font-size: 15px; color: #2c5641; }
  .node span { font-size: 11.5px; color: #5a6b60; }
  .node.dark { background: #47765a; }
  .node.dark b { color: #fff; }
  .node.dark span { color: #dcebe1; }
  .node.dashed { border-style: dashed; background: #fff; }
  .arrow { color: #47765a; font-size: 20px; font-weight: 700; }
  .lane { display: flex; gap: 14px; align-items: stretch; justify-content: center; }
  .lane .node { flex: 0 1 auto; }
  .group {
    border: 1.6px dashed #9db8a7; border-radius: 12px; padding: 12px;
    display: flex; gap: 10px; align-items: center; justify-content: center;
  }
  .group > .label {
    font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
    color: #47765a; font-weight: 700; writing-mode: vertical-rl; transform: rotate(180deg);
  }
  .caption { text-align: center; font-size: 11px; color: #7a877f; margin-top: 14px; }
  h1 { font-size: 15px; color: #2c5641; text-align: center; margin-bottom: 18px; font-weight: 600; }
`

const diagrams = {
  // Fig 3.1 — the learning cycle
  "dia-cycle": () => `
    <h1>The StudyFlow Learning Cycle</h1>
    <div class="flow">
      <div class="node"><b>Plan</b><span>tasks &amp; intention</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Focus</b><span>timed session</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Learn</b><span>technique guides</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Practice</b><span>recall &amp; notes</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Review</b><span>spaced returns</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Track</b><span>progress data</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Reflect</b><span>wins &amp; gaps</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Improve</b><span>next plan</span></div>
    </div>
    <div class="caption">Each stage feeds the next; the cycle repeats across sessions.</div>
  `,

  // Fig 5.1 — system architecture
  "dia-architecture": () => `
    <h1>StudyFlow System Architecture</h1>
    <div class="flow col">
      <div class="node"><b>User</b><span>browser · phone · desktop</span></div>
      <div class="arrow">↓</div>
      <div class="node"><b>StudyFlow frontend</b><span>vanilla JavaScript ES modules · Vite build · service worker</span></div>
      <div class="arrow">↓</div>
      <div class="node"><b>src/services/backend.js</b><span>single gateway · offline fallback to localStorage</span></div>
      <div class="arrow">↓</div>
      <div class="group">
        <span class="label">Supabase</span>
        <div class="node dark"><b>Auth</b><span>email · OAuth · sessions</span></div>
        <div class="node dark"><b>PostgreSQL</b><span>41 tables · RLS on all</span></div>
        <div class="node dark"><b>Storage</b><span>avatars · books · stories · files</span></div>
        <div class="node dark"><b>Realtime</b><span>chat · presence · signals</span></div>
      </div>
    </div>
    <div class="caption">The page talks to exactly one gateway; Supabase provides the four backend services.</div>
  `,

  // Fig 5.2 — authentication sequence
  "dia-auth": () => `
    <h1>Authentication Flow (Sign-in)</h1>
    <div class="flow">
      <div class="node"><b>Student</b><span>enters email + password</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>StudyFlow</b><span>signInWithPassword()</span></div>
      <div class="arrow">→</div>
      <div class="node dark"><b>Supabase Auth</b><span>verifies credentials</span></div>
      <div class="arrow">→</div>
      <div class="node dark"><b>JWT session</b><span>signed token stored by client</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Authorized app</b><span>queries now carry the user's identity</span></div>
    </div>
    <div class="caption">Every later database request is checked against this identity by Row Level Security.</div>
  `,

  // Fig 13.1 — status lifecycle
  "dia-status": () => `
    <h1>Status (Story) Lifecycle</h1>
    <div class="flow">
      <div class="node"><b>Create</b><span>text · photo · video</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Edit</b><span>caption · music · visibility</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Preview</b><span>before publish</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Upload</b><span>storage bucket</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Publish</b><span>stories row · expires_at</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>View</b><span>friends · 24 h window</span></div>
      <div class="arrow">→</div>
      <div class="node dashed"><b>Expire</b><span>filtered · cleanup</span></div>
    </div>
    <div class="caption">The 24-hour lifetime is enforced by a database constraint, not only by the interface.</div>
  `,

  // Fig 12.1 — call lifecycle
  "dia-call": () => `
    <h1>Voice / Video Call Lifecycle (WebRTC)</h1>
    <div class="flow">
      <div class="node"><b>Caller starts</b><span>mic/camera permission</span></div>
      <div class="arrow">→</div>
      <div class="node dark"><b>Invitation</b><span>call_events row · realtime</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Accept / Decline</b></div>
      <div class="arrow">→</div>
      <div class="node dark"><b>Signaling</b><span>broadcast channel</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Direct connection</b><span>encrypted audio/video</span></div>
      <div class="arrow">→</div>
      <div class="node"><b>Hang up</b><span>both ends cleaned up</span></div>
    </div>
    <div class="caption">Supabase Realtime carries only the connection setup; the conversation itself flows peer-to-peer.</div>
  `,

  // Fig 10.1 — database entity map
  "dia-database": () => `
    <h1>StudyFlow Database Entity Map (simplified)</h1>
    <div class="flow col" style="gap: 14px;">
      <div class="node dark" style="min-width: 420px;"><b>auth.users</b><span>Supabase-managed accounts (email, OAuth identities)</span></div>
      <div class="arrow">↓ one-to-one</div>
      <div class="node" style="min-width: 420px;"><b>profiles</b><span>display name · avatar · bio</span></div>
      <div class="arrow">↓ one-to-many</div>
      <div class="lane">
        <div class="node"><b>Productivity</b><span>tasks · user_state · user_notes · streaks</span></div>
        <div class="node"><b>Social</b><span>stories · messages · friendships · groups · memberships · calls</span></div>
      </div>
      <div class="arrow">↓</div>
      <div class="lane">
        <div class="node"><b>Library</b><span>books · bookmarks · highlights · notes · progress</span></div>
        <div class="node"><b>Rewards</b><span>rewards · user_balances · purchases · inventory · coin_transactions</span></div>
        <div class="node"><b>Growth</b><span>achievements · user_achievements · technique_assessments</span></div>
      </div>
    </div>
    <div class="caption">41 tables in total; every user-owned table carries a foreign key to the account and Row Level Security policies.</div>
  `,

  // Fig 8.1 — technique → feature mapping (replaces prose-only mapping)
  "dia-techniques": () => `
    <h1>From Learning Technique to StudyFlow Feature</h1>
    <div class="lane" style="align-items: flex-start;">
      <div class="flow col" style="gap: 8px; flex: 1;">
        <div class="node" style="min-width: 240px;"><b>Active recall</b><span>retrieve before re-reading</span></div>
        <div class="arrow">↓</div>
        <div class="node dashed" style="min-width: 240px;"><b>Technique guides · check-in prompts</b></div>
      </div>
      <div class="flow col" style="gap: 8px; flex: 1;">
        <div class="node" style="min-width: 240px;"><b>Spaced repetition</b><span>review at increasing intervals</span></div>
        <div class="arrow">↓</div>
        <div class="node dashed" style="min-width: 240px;"><b>Schedule builder · daily review plan</b></div>
      </div>
      <div class="flow col" style="gap: 8px; flex: 1;">
        <div class="node" style="min-width: 240px;"><b>Focused work &amp; breaks</b><span>attention restoration</span></div>
        <div class="arrow">↓</div>
        <div class="node dashed" style="min-width: 240px;"><b>Pomodoro focus desk · session tracking</b></div>
      </div>
      <div class="flow col" style="gap: 8px; flex: 1;">
        <div class="node" style="min-width: 240px;"><b>Elaboration &amp; teaching</b><span>explain in your own words</span></div>
        <div class="arrow">↓</div>
        <div class="node dashed" style="min-width: 240px;"><b>Feynman guide · Cornell notes · win journal</b></div>
      </div>
    </div>
    <div class="caption">Dashed boxes are features StudyFlow currently ships; solid boxes are the underlying research ideas.</div>
  `,
}

// --- render ---------------------------------------------------------------
const proc = spawn(BROWSER, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--user-data-dir=${join(root, ".freebuff", "diagram-profile")}`,
  "--remote-debugging-port=9224",
  "about:blank",
])

let browser = null
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 500))
  try {
    browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9224" })
    break
  } catch {
    /* retry */
  }
}
if (!browser) {
  console.error("no browser")
  process.exit(1)
}

const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 })

for (const [name, html] of Object.entries(diagrams)) {
  const file = join(tmp, `${name}.html`)
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html()}</body></html>`,
  )
  await page.goto(`file:///${file.replace(/\\/g, "/")}`, { waitUntil: "load" })
  const el = await page.$("body")
  await el.screenshot({ path: join(out, `${name}.png`) })
  console.log(`OK ${name}`)
}

await browser.disconnect()
proc.kill()
rmSync(tmp, { recursive: true, force: true })
console.log("done")
