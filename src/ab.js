/* ab.js — landing hero A/B test engine.
   Two arms (A control, B outcome-led), 50/50 split, sticky per visitor:
     A — "Focus with intention."      / "Open Focus Desk →"
     B — "Study deeper, not longer."  / "Start free — no signup"
   Events land in the Supabase `landing_events` table (insert-only for anon);
   aggregated results come back through the landing_ab_results() RPC. Events
   are buffered locally and flushed on boot so nothing is lost offline, and a
   failure never breaks the page — the worst case is a missed data point. */

import { supabase } from "./services/backend.js"
import { get, save } from "./core.js"

const VARIANT_KEY = "sf-ab-landing"
const QUEUE_KEY = "sf-ab-queue"
const VIEWED_KEY = "sf-ab-viewed"

export const AB_ARMS = {
  A: {
    headline: "Focus with intention.",
    cta: "Open Focus Desk →",
    note: "control — the current brand line",
  },
  B: {
    headline: "Study deeper, not longer.",
    cta: "Start free — no signup",
    note: "outcome-led — leads with the result, lowers the commitment",
  },
}

/* Copy for a variant, with a safe fallback so an unknown stored value
   (e.g. a removed arm) can never blank the hero. */
export function variantCopy(v) {
  return AB_ARMS[v] || AB_ARMS.A
}

/* Sticky 50/50 assignment. Kept in localStorage so the same visitor always
   sees the same arm across visits (mixed experiences poison the data). */
export function pickVariant() {
  let v = get(VARIANT_KEY, "")

  if (v !== "A" && v !== "B") {
    v = Math.random() < 0.5 ? "A" : "B"

    save(VARIANT_KEY, v)
  }

  return v
}

/* Queue one event. Best-effort: storage failures are swallowed. */
function enqueue(event, variant) {
  try {
    const q = get(QUEUE_KEY, [])

    q.push({
      variant,
      event,
      path: location.pathname,
      ref: document.referrer ? new URL(document.referrer).host : "",
      vw: innerWidth < 640 ? 0 : 1,
    })

    // Cap the offline queue — if flushing keeps failing we drop the oldest
    // rather than growing forever.
    save(QUEUE_KEY, q.slice(-50))
  } catch {
    /* ignore */
  }
}

/* Flush the buffered events to Supabase. Returns the number of rows the
   server accepted (0 when the backend isn't configured or it failed). */
export async function flushAbEvents() {
  const q = get(QUEUE_KEY, [])

  if (!q.length) return 0

  if (!supabase) return 0

  try {
    const { error } = await supabase.from("landing_events").insert(q)

    if (error) throw error

    save(QUEUE_KEY, [])

    return q.length
  } catch {
    return 0 // kept in the queue — retried on the next boot
  }
}

/* Called from mountLanding: dedupes the view event per browser session. */
export function trackLandingView(variant) {
  try {
    if (sessionStorage.getItem(VIEWED_KEY)) return

    sessionStorage.setItem(VIEWED_KEY, "1")
  } catch {
    /* private mode etc. — still count the view */
  }

  enqueue("view", variant)
}

export function trackLandingCta(variant) {
  enqueue("cta_click", variant)
}

export function trackLandingDemo(variant) {
  enqueue("demo_start", variant)
}

/* ---- Results ----------------------------------------------------------- */

/* Two-proportion z-test: is arm B's conversion genuinely different from A's?
   Returns { crA, crB, z, p, significant } — p < 0.05 means the gap is very
   unlikely to be luck. */
export function twoPropZTest(viewsA, clicksA, viewsB, clicksB) {
  const crA = viewsA ? clicksA / viewsA : 0
  const crB = viewsB ? clicksB / viewsB : 0

  const pooled = viewsA + viewsB ? (clicksA + clicksB) / (viewsA + viewsB) : 0

  const se = Math.sqrt(
    pooled * (1 - pooled) * (1 / Math.max(1, viewsA) + 1 / Math.max(1, viewsB)),
  )

  const z = se > 0 ? (crB - crA) / se : 0

  // Two-sided p from the standard normal curve ( Abramowitz–Stegun 7.1.26 ).
  const t = 1 / (1 + 0.2316419 * Math.abs(z))

  const d =
    0.3989423 *
    Math.exp((-z * z) / 2) *
    (0.3193815 * t -
      0.3565638 * t ** 2 +
      1.781478 * t ** 3 -
      1.821256 * t ** 4 +
      1.330274 * t ** 5)

  const p = Math.min(1, 2 * d)

  return {
    crA,
    crB,
    z,
    p,
    significant: viewsA >= 100 && viewsB >= 100 && p < 0.05,
  }
}

/* Pull aggregates and turn them into a readable verdict. Safe to call from
   the console: window.__sfAbSummary(). Returns null when unconfigured. */
export async function abSummary() {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.rpc("landing_ab_results")

    if (error) throw error

    const row = (v) => data.find((r) => r.variant === v) || { views: 0, cta_clicks: 0, demo_starts: 0 }

    const A = row("A")
    const B = row("B")
    const stat = twoPropZTest(A.views, A.cta_clicks, B.views, B.cta_clicks)

    const winner =
      !stat.significant
        ? "no significant winner yet — keep collecting"
        : stat.crB > stat.crA
          ? "B wins — switch the default to B"
          : "A wins — keep A as the default"

    return { A, B, ...stat, winner, rows: data }
  } catch {
    return null
  }
}
