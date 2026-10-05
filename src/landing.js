/* landing.js — the public marketing page: nav, hero, live demo timer,
   product showcase, features, testimonials, FAQ, CTA and footer.
   Everything a visitor sees before they ever press "Open Focus Desk". */

import {
  $,
  $$,
  sicon,
  state,
  celebrate,
} from "./core.js"

import {
  pickVariant,
  variantCopy,
  trackLandingView,
  trackLandingCta,
  trackLandingDemo,
  flushAbEvents,
  abSummary,
  twoPropZTest,
  AB_ARMS,
} from "./ab.js"

const DEMO_DURATIONS = { focus: 1500, short: 300 }

function demoTimer(root) {
  const ring = $("[data-demo-ring]", root)

  const timeEl = $("[data-demo-time]", root)

  const labelEl = $("[data-demo-label]", root)

  const toggleBtn = $("[data-demo-toggle]", root)

  if (!ring || !timeEl || !toggleBtn) return

  let mode = "focus"

  let time = DEMO_DURATIONS.focus

  let running = false

  let tick = null

  const paint = () => {
    const total = DEMO_DURATIONS[mode]

    const m = Math.floor(time / 60)

    const s = time % 60

    timeEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`

    if (labelEl)
      labelEl.textContent = mode === "focus" ? "Focus" : "Short break"

    ring.style.setProperty(
      "--p",
      `${((total - time) / total) * 360}deg`,
    )

    ring.classList.toggle("running", running)

    toggleBtn.textContent = running ? "Pause" : "Start session"
  }

  const stop = () => {
    if (tick) {
      clearInterval(tick)

      tick = null
    }

    running = false

    paint()
  }

  const start = () => {
    if (tick) return

    running = true

    tick = setInterval(() => {
      time -= 1

      if (time <= 0) {
        if (mode === "focus") {
          // Focus done → straight into the break, confetti on the way.
          try {
            celebrate()
          } catch {
            /* ignore */
          }

          mode = "short"

          time = DEMO_DURATIONS.short
        } else {
          mode = "focus"

          time = DEMO_DURATIONS.focus

          stop()

          return
        }
      }

      paint()
    }, 1000)

    paint()
  }

  toggleBtn.onclick = () => {
    if (running) stop()
    else start()
  }

  const reset = $("[data-demo-reset]", root)

  if (reset)
    reset.onclick = () => {
      stop()

      mode = "focus"

      time = DEMO_DURATIONS.focus

      paint()
    }

  const sprint = $("[data-demo-sprint]", root)

  if (sprint)
    sprint.onclick = () => {
      stop()

      mode = "focus"

      time = 30

      start()
    }

  paint()
}

function landingMarkup(variant) {
  const year = new Date().getFullYear()

  const copy = variantCopy(variant)

  return `<div class="landing landing-on-dusk" data-ab-variant="${variant}"><div class="landing-dusk" aria-hidden="true"><span class="dusk-glow"></span><span class="dusk-dial"><i class="dusk-pie"></i><i class="dusk-ring"></i></span><span class="dusk-orbit"><b class="dusk-dot a"></b><b class="dusk-dot b"></b></span><span class="dusk-echo"></span></div><nav class="landing-nav"><div class="ln-brand"><span class="brand-mark">◷</span><strong>StudyFlow</strong></div><div class="ln-links"><button type="button" data-scroll="#landing-feats">Features</button><button type="button" data-scroll="#landing-how">How it works</button><button type="button" data-scroll="#landing-faq">FAQ</button><button type="button" class="primary ln-open" data-enter>Open app</button></div></nav><header class="landing-hero"><div class="brand-mark landing-mark">◷</div><div class="eyebrow">StudyFlow · free forever</div><h1>${copy.headline}</h1><p class="lede">Pomodoro sessions, streaks, study buddies and rewards — one calm workspace for deep work.</p><div class="landing-actions"><button type="button" class="primary" data-enter>${copy.cta}</button><button type="button" class="ghost landing-ghost" data-scroll="#landing-demo">Try the timer</button><button type="button" class="ghost landing-ghost landing-install" data-install>${sicon("download")} Install app</button></div><div class="landing-trust muted">No account needed to start · Works offline · MoMo top-ups for coins</div></header><section class="landing-demo" id="landing-demo"><div class="card demo-card"><div class="demo-head"><span class="eyebrow">Live demo — no signup</span><button type="button" class="ghost demo-sprint" data-demo-sprint>Try a 30s sprint</button></div><div class="demo-ring" data-demo-ring style="--p:0deg"><div><div class="demo-time" data-demo-time>25:00</div><div class="demo-label" data-demo-label>Focus</div></div></div><div class="demo-actions"><button type="button" class="icon-btn" data-demo-reset title="Reset">↻</button><button type="button" class="primary" data-demo-toggle>Start session</button></div><p class="muted demo-hint">This is the real timer — the same ring, focus sounds and streaks waiting inside.</p></div></section><section class="landing-stats"><div class="ls-item"><b>10</b><span>study techniques with guided tools</span></div><div class="ls-item"><b>50+</b><span>rewards to unlock with earned coins</span></div><div class="ls-item"><b>24/7</b><span>study rooms, sprints and community</span></div><div class="ls-item"><b>GH¢0</b><span>to start — no card, no catch</span></div></section><section class="landing-showcase"><figure class="landing-shot"><div class="shot-bar" aria-hidden="true"><i></i><i></i><i></i><span>StudyFlow — Focus desk</span></div><img src="/app-preview.png" alt="The StudyFlow focus desk: timer ring, today's tasks and weekly stats" width="1440" height="900" loading="lazy" /></figure><figcaption class="muted">The Focus desk — timer, tasks, garden, records and achievements in one calm view.</figcaption></section><div class="grid three landing-feats" id="landing-feats"><div class="card"><div class="emoji">${sicon("timer")}</div><h3>Smart timer</h3><p class="muted">Focus, short and long breaks with custom lengths, session templates and gentle anti-distraction rules.</p></div><div class="card"><div class="emoji">${sicon("brain")}</div><h3>Techniques that teach</h3><p class="muted">Flashcards, Cornell and Feynman pads, mind maps and quizzes — with a check that matches methods to how you learn.</p></div><div class="card"><div class="emoji">${sicon("users")}</div><h3>Study together</h3><p class="muted">Sprint rooms with live countdowns, group challenges, chat, voice notes and 24-hour stories.</p></div><div class="card"><div class="emoji">${sicon("book")}</div><h3>Your bookshelf</h3><p class="muted">Upload books, read distraction-free, and track pages, highlights and reading streaks.</p></div><div class="card"><div class="emoji">${sicon("coin")}</div><h3>Rewards that motivate</h3><p class="muted">Earn coins every session — themes, sound packs, badges and boosts. Top up with MoMo in seconds.</p></div><div class="card"><div class="emoji">${sicon("sprout")}</div><h3>Streaks &amp; garden</h3><p class="muted">Every session plants a flower and pays coins. Watch the garden grow as consistency compounds.</p></div></div><div class="card landing-how-card" id="landing-how"><h2>How it works</h2><ol class="detail-steps"><li><strong>Pick a task</strong> — name what you'll work on.</li><li><strong>Start a session</strong> — the ring tracks every second; phone down.</li><li><strong>Rest &amp; repeat</strong> — breaks in between; coins, flowers and streaks after.</li></ol></div><section class="landing-quotes-wrap"><h2>Students focus better with StudyFlow</h2><div class="grid three landing-quotes"><figure class="card landing-quote"><blockquote>“The sprint rooms keep me honest. Seeing three friends' timers running makes it so much harder to pick up my phone.”</blockquote><figcaption><span class="q-ava">AM</span><div><strong>Ama M.</strong><small>Level 300, KNUST</small></div></figcaption></figure><figure class="card landing-quote"><blockquote>“I used to revise with ten tabs open. Now one 25-minute session with rain sounds beats two hours of pretending.”</blockquote><figcaption><span class="q-ava">KO</span><div><strong>Kojo O.</strong><small>Pre-med, University of Ghana</small></div></figcaption></figure><figure class="card landing-quote"><blockquote>“My whole garden is flowers from exam season. Streaks plus coins sound gimmicky — until they're the reason you show up daily.”</blockquote><figcaption><span class="q-ava">EA</span><div><strong>Efe A.</strong><small>Engineering, UCC</small></div></figcaption></figure></div></section><section class="landing-faq-wrap" id="landing-faq"><h2>Questions, answered</h2><div class="landing-faq"><details><summary>Is StudyFlow really free?</summary><p>Yes — the timer, techniques, community, book library and rewards are free forever. Optional MoMo coin top-ups buy extra fuel, never access.</p></details><details><summary>Do I need an account?</summary><p>No — start focusing immediately. A free account syncs streaks, coins and books across devices, so it's worth adding when you're ready.</p></details><details><summary>What is the MoMo top-up?</summary><p>Coins normally come free from focus sessions and streaks. Want more? MTN, Telecel and AirtelTigo mobile money through Moolre tops you up in seconds.</p></details><details><summary>Does it work offline?</summary><p>Yes — StudyFlow installs as an app and keeps the shell and your data on-device, so a dropped connection never stops a session.</p></details><details><summary>Is my data private?</summary><p>You choose what's visible. Tasks, notes and reading stay on your device unless you sign in to sync — and profile visibility is yours to set.</p></details></div></section><section class="landing-cta card"><div><h2>Ready to make focus a habit?</h2><p class="muted">Your first session is one tap away — coins, flowers and streaks start immediately.</p></div><button type="button" class="primary" data-enter>Start free — no signup</button></section><footer class="landing-foot"><div class="lf-brand"><span class="brand-mark">◷</span><strong>StudyFlow</strong></div><nav class="lf-links"><button type="button" data-scroll="#landing-feats">Features</button><button type="button" data-scroll="#landing-how">How it works</button><button type="button" data-scroll="#landing-faq">FAQ</button><button type="button" data-enter>Open app</button></nav><div class="muted">© ${year} StudyFlow · made for deep work</div></footer></div>`
}

/* Mount the landing page into #root. `onEnter` runs the app's onboarding
   entry flow (owned by account.js); every Open-app button funnels there. */
export function mountLanding(root, { onEnter } = {}) {
  if (!root) return

  const variant = pickVariant()

  trackLandingView(variant)

  flushAbEvents()

  window.__sfAbSummary = abSummary

  // Shipped z-test exposed for verification (tools/verify-growth.mjs) and
  // ad-hoc console checks — harmless to leave in production.
  window.__sfAbZ = twoPropZTest

  root.innerHTML = landingMarkup(variant)

  const enter = () => {
    trackLandingCta(variant)

    flushAbEvents()

    if (typeof onEnter === "function") onEnter()
  }

  $$("[data-enter]", root).forEach((b) => {
    b.onclick = enter
  })

  const smooth = () => !state.reduceMotion

  $$("[data-scroll]", root).forEach((b) => {
    b.onclick = () => {
      try {
        document
          .querySelector(b.dataset.scroll)
          ?.scrollIntoView({ behavior: smooth() ? "smooth" : "auto" })
      } catch {
        /* ignore */
      }
    }
  })

  demoTimer(root)

  // A visitor who actually plays with the demo timer is a hot lead — worth
  // its own funnel stage between view and CTA click.
  const demoStart = $("[data-demo-toggle]", root)

  if (demoStart)
    demoStart.addEventListener(
      "click",
      () => {
        trackLandingDemo(variant)

        flushAbEvents()
      },
      { once: true },
    )

  const installBtn = $("[data-install]", root)

  if (installBtn)
    installBtn.onclick = async () => {
      const prompt = window.__sfInstallPrompt

      if (!prompt) return

      try {
        prompt.prompt()

        const choice = await prompt.userChoice

        if (choice && choice.outcome === "accepted") installBtn.hidden = true
      } catch {
        /* ignore */
      }
    }
}
