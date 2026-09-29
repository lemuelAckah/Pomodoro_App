// Single source of truth for the StudyFlow presentation deck. Consumed by
// tools/make-deck.mjs (HTML + PDF) and tools/make-pptx.mjs (PowerPoint), so
// the three formats can never drift apart. All facts come from the verified
// documentation; all images are the real captures in docs/img/.
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

export const DECK = {
  title: "StudyFlow — Presentation",
  subtitle: "A Learning, Productivity and Collaboration Platform",
  tag: "Research & Technical Overview — 12 slides",
  author: "Blay-Miezah Lemuel Ackah",
  meta1: "September 2026 · v1.0",
  meta2: "Companion to the full documentation (85 pp.)",
  footer: "StudyFlow — Research and Technical Documentation",
}

// Palette (no leading # — pptxgenjs wants bare hex; HTML renderers add it).
export const ACCENT = "47765A"
export const ACCENT_DARK = "2C5641"
export const INK = "1F2A24"
export const MUTED = "5A6B60"
export const RULE = "DDE6DE"
export const TINT = "F2F5F2"

const IMG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "img")
export function imgData(file) {
  return `data:image/png;base64,${readFileSync(join(IMG_DIR, file)).toString("base64")}`
}

// media role: "shot" = screenshot (cropped to fill its frame), "diagram" =
// drawn diagram (contained inside its frame, never cropped).
export const slides = [
  {
    layout: "cover",
    foot: "Overview",
    notes:
      "Introduce yourself and the project: StudyFlow is a web platform that turns learning-science into a daily workspace. This deck summarises an 85-page, 21-chapter documentation built directly from the source code.",
  },
  {
    layout: "bullets",
    kicker: "The Problem",
    title: "Long hours, little retained",
    bullets: [
      "Students default to <b>passive rereading, cramming and marathon sessions</b> — habits poorly matched to how memory works.",
      "Decades of cognitive research point the other way: <b>retrieval practice, spacing, interleaving and focused work with real breaks</b>.",
      "The techniques are known — but they are <b>hard to organise and sustain</b> with paper timetables and willpower alone.",
      "StudyFlow's premise: <b>turn the evidence into a workspace</b> students actually use every day.",
    ],
    foot: "Slide 2",
    notes:
      "Cite the mismatch: students reread and cram despite the evidence for retrieval practice, spacing and interleaving. The gap is not knowledge but organisation — that is the product's premise.",
  },
  {
    layout: "text-left-media-right",
    kicker: "The Product",
    title: "One connected study workspace",
    bullets: [
      "A <b>Pomodoro-style Focus Desk</b> with tasks, streaks and sessions.",
      "A <b>guided library of study techniques</b> with a personal fit assessment.",
      "A <b>book library with an in-browser EPUB reader</b> and companion prompts.",
      "<b>Ambient sound studios</b> for focused work.",
      "A <b>social layer</b>: groups, messaging, voice/video calls, expiring statuses.",
      "A <b>reward economy</b>: coins, achievements and a store.",
    ],
    media: [{ file: "fig-landing.png", alt: "StudyFlow landing page", role: "shot", cap: "The StudyFlow landing page" }],
    foot: "Slide 3",
    notes:
      "Walk the six pillars left to right, then point at the screenshot: everything shown is a real screen capture of the running app.",
  },
  {
    layout: "focus-desk",
    kicker: "Feature — Focus Desk",
    title: "The timer at the centre",
    media: [
      { file: "fig-timer.png", alt: "Focus Desk timer tab", role: "shot", cap: "Focus Desk on desktop" },
      { file: "fig-mobile-timer.png", alt: "Timer on mobile", role: "shot" },
      { file: "fig-night-timer.png", alt: "Timer in night mode", role: "shot" },
    ],
    cap: "Responsive on mobile · night mode built in",
    bullets: ["Presets, sessions and <b>streak tracking</b> keep the routine honest."],
    foot: "Slide 4",
    notes:
      "The Focus Desk is the daily anchor: presets, session history and streaks. Responsive layout and night mode are built in — all three captures are live screens, not mock-ups.",
  },
  {
    layout: "diagram-top",
    kicker: "Learning Science",
    title: "A session cycle designed from the evidence",
    media: [{ file: "dia-cycle.png", alt: "Pomodoro session cycle diagram", role: "diagram", cap: "Focus → short break → repeat → long break" }],
    bullets: [
      "Work in <b>focused intervals</b> separated by restorative breaks.",
      "Breaks and limits counter <b>attention residue</b> from task switching.",
      "The desk nudges the cycle; the student stays in control.",
    ],
    foot: "Slide 5",
    notes:
      "The cycle operationalises Pomodoro research; breaks counter attention residue (Leroy, 2009). Emphasise nudging, not forcing — student control is deliberate.",
  },
  {
    layout: "media-left-stack-right",
    kicker: "Feature — Techniques",
    title: "Guided methods, matched to the student",
    media: [
      { file: "fig-techniques.png", alt: "Techniques tab", role: "shot", cap: "The Techniques library" },
      { file: "dia-techniques.png", alt: "Technique assessment flow diagram", role: "diagram", cap: "Orientation assessment → personal fit" },
    ],
    bullets: [
      "Each method explains <b>what to do and why it works</b>.",
      "The check <b>orients, it does not diagnose</b> — honest by design.",
    ],
    foot: "Slide 6",
    notes:
      "Every technique pairs instructions with its evidence base. The fit assessment is explicitly an orientation tool, not a diagnosis — one of the document's honesty commitments.",
  },
  {
    layout: "triptych",
    kicker: "Feature — Study Life",
    title: "Library, sound and community in one place",
    media: [
      { file: "fig-books.png", alt: "Book library", role: "shot", cap: "EPUB reader & prompts" },
      { file: "fig-sounds.png", alt: "Sound studio", role: "shot", cap: "Synthesised ambience" },
      { file: "fig-community.png", alt: "Community tab", role: "shot", cap: "Groups & messaging" },
    ],
    foot: "Slide 7",
    notes:
      "Three supporting features: an EPUB reader built on DecompressionStream (no zip dependencies), ambience synthesised with the Web Audio API, and a realtime community layer.",
  },
  {
    layout: "text-right-media-left",
    kicker: "Feature — Motivation",
    title: "Coins, achievements and a store",
    media: [{ file: "fig-store.png", alt: "Store tab", role: "shot", cap: "The reward store" }],
    bullets: [
      "Focus sessions and streaks earn <b>coins</b>.",
      "Achievements mark <b>real milestones</b>, not busywork.",
      "The store turns consistency into <b>visible progress</b>.",
      "Gamification follows the research on <b>careful extrinsic rewards</b> — supporting, not replacing, intrinsic motivation.",
    ],
    foot: "Slide 8",
    notes:
      "The reward economy is deliberately restrained: the design follows the Deci & Ryan line on extrinsic rewards — supporting intrinsic motivation, not crowding it out.",
  },
  {
    layout: "big-diagram",
    kicker: "Under the Hood",
    title: "A disciplined vanilla-JS architecture",
    media: [{ file: "dia-architecture.png", alt: "System architecture diagram", role: "diagram" }],
    bullets: [
      "<b>Single static shell</b>; routes lazy-load as ES-module chunks.",
      "Main bundle ≈ <b>288 kB</b>; everything else fetched on demand.",
      "A <b>service worker</b> precaches the shell — the app works fully offline.",
    ],
    foot: "Slide 9",
    notes:
      "Roughly sixty thousand lines of vanilla JavaScript served by Vite. The measured main bundle is about 288 kB; the service worker precaches the shell so every tab works offline — verified by test.",
  },
  {
    layout: "text-right-media-left",
    kicker: "Under the Hood",
    title: "Supabase: PostgreSQL, auth and enforced privacy",
    media: [{ file: "dia-database.png", alt: "Database entity map", role: "diagram", cap: "Entity map (simplified)" }],
    bullets: [
      "<b>41 PostgreSQL tables</b> across 24 migrations.",
      "<b>136 Row Level Security policies</b> — privacy enforced by the database, not the client.",
      "Auth, Storage and <b>Realtime</b> channels from one managed platform.",
      "No self-hosted servers; <b>no secrets in the client</b>.",
    ],
    foot: "Slide 10",
    notes:
      "Everything persists in PostgreSQL across 41 tables and 24 migrations; privacy is enforced by 136 Row Level Security policies in the database itself. No self-hosted servers, no secrets shipped to the client.",
  },
  {
    layout: "stacked-diagrams",
    kicker: "Under the Hood",
    title: "Real-time presence, statuses and calls",
    media: [
      { file: "dia-auth.png", alt: "Authentication flow diagram", role: "diagram", cap: "JWT sessions through Supabase Auth" },
      { file: "dia-call.png", alt: "Call flow diagram", role: "diagram", cap: "WebRTC peer-to-peer voice & video, optional TURN" },
    ],
    bullets: ["Expiring <b>status updates</b> (24-hour lifetime, server-enforced)."],
    foot: "Slide 11",
    notes:
      "JWT sessions through Supabase Auth; calls are WebRTC peer-to-peer with optional TURN fallback; statuses expire after 24 hours, enforced server-side.",
  },
  {
    layout: "closing",
    kicker: "Closing",
    title: "What is real, and what comes next",
    bullets: [
      "<b>Built and verified:</b> the full platform documented feature-by-feature against the codebase.",
      "<b>Honest limits:</b> no experimental evaluation of learning outcomes yet; React/Tailwind scaffolding unused.",
      "<b>Next:</b> a controlled study of StudyFlow's effect on retention, plus social and content expansion.",
    ],
    afterword: "Full details: StudyFlow_Documentation — 21 chapters, 41 references, 8 appendices.",
    foot: "Slide 12",
    notes:
      "Close on honesty: everything documented is verified against the codebase; no outcome evaluation exists yet, and a controlled study is the proposed next step. Point the audience to the full documentation.",
  },
]
