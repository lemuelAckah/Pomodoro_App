/* landing.js — the public marketing page: nav, hero, live demo timer,
   product showcase, features, testimonials, FAQ, CTA and footer.
   Everything a visitor sees before they ever press "Open Focus Desk". */

import { $, $$, sicon, state, celebrate } from "./core.js"

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

    ring.style.setProperty("--p", `${((total - time) / total) * 360}deg`)

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

function landingMarkup() {
  const year = new Date().getFullYear()

  return `<div class="landing landing-on-dusk"><div class="landing-dusk" aria-hidden="true"><span class="dusk-glow"></span><span class="dusk-dial"><i class="dusk-pie"></i><i class="dusk-ring"></i></span><span class="dusk-orbit"><b class="dusk-dot a"></b><b class="dusk-dot b"></b></span><span class="dusk-echo"></span></div><nav class="landing-nav"><div class="ln-brand"><span class="brand-mark">◷</span><strong>StudyFlow</strong></div><div class="ln-links"><button type="button" data-scroll="#landing-feats">Features</button><button type="button" data-scroll="#landing-how">How it works</button><button type="button" data-scroll="#landing-faq">FAQ</button><button type="button" class="primary ln-open" data-enter>Open app</button></div></nav><header class="landing-hero"><div class="brand-mark landing-mark">◷</div><div class="eyebrow">StudyFlow · free forever</div><h1>Focus with intention.</h1><p class="lede">Pomodoro sessions, streaks, study buddies and rewards — one calm workspace for deep work.</p><div class="landing-actions"><button type="button" class="primary" data-enter>Open Focus Desk →</button><button type="button" class="ghost landing-ghost" data-scroll="#landing-demo">Try the timer</button><button type="button" class="ghost landing-ghost landing-install" data-install>${sicon("download")} Install app</button></div><div class="landing-trust muted">No account needed to start · Works offline · MoMo top-ups for coins</div><div class="landing-live" data-live hidden><span class="live-dot" aria-hidden="true"></span><b data-live-sessions>0</b> focus sessions logged by <b data-live-learners>0</b> learners</div></header><section class="landing-demo" id="landing-demo"><div class="card demo-card"><div class="demo-head"><span class="eyebrow">Live demo — no signup</span><button type="button" class="ghost demo-sprint" data-demo-sprint>Try a 30s sprint</button></div><div class="demo-ring" data-demo-ring style="--p:0deg"><div><div class="demo-time" data-demo-time>25:00</div><div class="demo-label" data-demo-label>Focus</div></div></div><div class="demo-actions"><button type="button" class="icon-btn" data-demo-reset title="Reset">↻</button><button type="button" class="primary" data-demo-toggle>Start session</button></div><p class="muted demo-hint">This is the real timer — the same ring, focus sounds and streaks waiting inside.</p></div></section><section class="landing-stats"><div class="ls-item"><b>10</b><span>study techniques with guided tools</span></div><div class="ls-item"><b>50+</b><span>rewards to unlock with earned coins</span></div><div class="ls-item"><b>24/7</b><span>study rooms, sprints and community</span></div><div class="ls-item"><b>GH¢0</b><span>to start — no card, no catch</span></div></section><section class="landing-showcase" data-showcase><div class="shot-tabs" role="tablist" aria-label="Product preview"><button type="button" class="shot-tab is-active" role="tab" aria-selected="true" data-shot="0">Focus desk</button><button type="button" class="shot-tab" role="tab" aria-selected="false" data-shot="1">Community</button><button type="button" class="shot-tab" role="tab" aria-selected="false" data-shot="2">Rewards</button><button type="button" class="shot-tab" role="tab" aria-selected="false" data-shot="3">Bookshelf</button></div><div class="shot-stage"><figure class="landing-shot shot-panel is-active" data-panel="0" data-caption="The Focus desk — timer, tasks, garden, records and achievements in one calm view."><div class="shot-bar" aria-hidden="true"><i></i><i></i><i></i><span>StudyFlow — Focus desk</span></div><img src="/app-preview.png" alt="The StudyFlow focus desk: timer ring, today's tasks and weekly stats" width="1440" height="900" loading="lazy" /></figure><figure class="landing-shot shot-panel" data-panel="1" data-caption="Sprint rooms, stories, chat and group challenges — study alone, never lonely." hidden><div class="shot-bar" aria-hidden="true"><i></i><i></i><i></i><span>StudyFlow — community</span></div><div class="mock mock-community"><div class="mk-stories"><span class="mk-story">AM</span><span class="mk-story">KO</span><span class="mk-story">EA</span><span class="mk-story">JB</span></div><div class="mk-bubble them">Sprint starts in 5 — you in?</div><div class="mk-bubble me">Joining now!</div><div class="mk-pill">${sicon("timer")} 24:59 · 4 focusing</div><div class="mk-row"><span class="mk-avatar">KO</span><span class="mk-line"></span></div><div class="mk-row"><span class="mk-avatar">AM</span><span class="mk-line w60"></span></div></div></figure><figure class="landing-shot shot-panel" data-panel="2" data-caption="Coins, mystery boxes and boosts — every focused session pays out." hidden><div class="shot-bar" aria-hidden="true"><i></i><i></i><i></i><span>StudyFlow — reward store</span></div><div class="mock mock-rewards"><div class="mk-tiles"><div class="mk-tile">${sicon("star")}<b>50</b></div><div class="mk-tile">${sicon("gift")}<b>120</b></div><div class="mk-tile hot">${sicon("coin")}<b>Free</b></div><div class="mk-tile">${sicon("fire")}<b>80</b></div><div class="mk-tile">${sicon("heart")}<b>200</b></div><div class="mk-tile">${sicon("sprout")}<b>30</b></div></div><div class="mk-box">${sicon("gift")} Mystery box ready to open</div></div></figure><figure class="landing-shot shot-panel" data-panel="3" data-caption="Upload books, read distraction-free and keep a reading streak." hidden><div class="shot-bar" aria-hidden="true"><i></i><i></i><i></i><span>StudyFlow — bookshelf</span></div><div class="mock mock-books"><div class="mk-spines"><span class="mk-spine s1"></span><span class="mk-spine s2"></span><span class="mk-spine s3"></span><span class="mk-spine s4"></span></div><div class="mk-progress w72"><span></span></div><div class="mk-note">Atomic Habits · page 214 — 72% complete</div><div class="mk-row"><span class="mk-avatar">${sicon("book")}</span><span class="mk-line"></span></div><div class="mk-row"><span class="mk-avatar">${sicon("book")}</span><span class="mk-line w60"></span></div></div></figure></div><figcaption class="muted" data-shot-caption>The Focus desk — timer, tasks, garden, records and achievements in one calm view.</figcaption></section>

<section class="landing-focus-desk" id="landing-desk">
  <h2 class="rv">The Focus Desk</h2>
  <p class="muted">One calm workspace for the whole session — timer, tasks, garden, records and achievements.</p>
  <div class="landing-focus-grid">
    <div class="landing-focus-card card">
      <div class="emoji">${sicon("timer")}</div>
      <h3>Live timer ring</h3>
      <p class="muted">Focus, short and long breaks with custom lengths and gentle anti-distraction rules.</p>
    </div>
    <div class="landing-focus-card card">
      <div class="emoji">${sicon("check")}</div>
      <h3>Today's tasks</h3>
      <p class="muted">Name what you'll work on, then check it off as the ring tracks every second.</p>
    </div>
    <div class="landing-focus-card card">
      <div class="emoji">${sicon("sprout")}</div>
      <h3>Garden &amp; streaks</h3>
      <p class="muted">Every finished session plants a flower and pays coins — consistency compounds.</p>
    </div>
    <div class="landing-focus-card card">
      <div class="emoji">${sicon("gem")}</div>
      <h3>Records</h3>
      <p class="muted">Longest streak, biggest day and total focus time — your progress, kept honest.</p>
    </div>
    <div class="landing-focus-card card">
      <div class="emoji">${sicon("trophy")}</div>
      <h3>Achievements</h3>
      <p class="muted">Badges celebrate real milestones, not busywork — from the first session onwards.</p>
    </div>
    <div class="landing-focus-card card">
      <div class="emoji">${sicon("refresh")}</div>
      <h3>Offline-ready</h3>
      <p class="muted">Installs as an app and keeps the shell and your data on-device, so a dropped link never stops a session.</p>
    </div>
  </div>
  <div class="landing-focus-cta">
    <button type="button" class="primary" data-scroll="#landing-demo">Try the live demo timer →</button>
  </div>
</section>

<div class="grid three landing-feats" id="landing-feats"><div class="card"><div class="emoji">${sicon("timer")}</div><h3>Smart timer</h3><p class="muted">Focus, short and long breaks with custom lengths, session templates and gentle anti-distraction rules.</p></div><div class="card"><div class="emoji">${sicon("brain")}</div><h3>Techniques that teach</h3><p class="muted">Flashcards, Cornell and Feynman pads, mind maps and quizzes — with a check that matches methods to how you learn.</p></div><div class="card"><div class="emoji">${sicon("users")}</div><h3>Study together</h3><p class="muted">Sprint rooms with live countdowns, group challenges, chat, voice notes and 24-hour stories.</p></div><div class="card"><div class="emoji">${sicon("book")}</div><h3>Your bookshelf</h3><p class="muted">Upload books, read distraction-free, and track pages, highlights and reading streaks.</p></div><div class="card"><div class="emoji">${sicon("coin")}</div><h3>Rewards that motivate</h3><p class="muted">Earn coins every session — themes, sound packs, badges and boosts. Top up with MoMo in seconds.</p></div><div class="card"><div class="emoji">${sicon("sprout")}</div><h3>Streaks &amp; garden</h3><p class="muted">Every session plants a flower and pays coins. Watch the garden grow as consistency compounds.</p></div></div><div class="card landing-how-card" id="landing-how"><h2>How it works</h2><ol class="detail-steps"><li><strong>Pick a task</strong> — name what you'll work on.</li><li><strong>Start a session</strong> — the ring tracks every second; phone down.</li><li><strong>Rest &amp; repeat</strong> — breaks in between; coins, flowers and streaks after.</li></ol></div><section class="landing-includes"><div class="inc-head"><h2>Everything included, free forever</h2><p class="muted">No trials, no locked tabs, no premium wall — the whole toolkit ships free.</p></div><ul class="inc-grid"><li>${sicon("check")} Pomodoro timer &amp; templates</li><li>${sicon("check")} 10 guided study techniques</li><li>${sicon("check")} Flashcards, quizzes &amp; pads</li><li>${sicon("check")} Focus music &amp; sound studio</li><li>${sicon("check")} Book library &amp; reader</li><li>${sicon("check")} Study rooms &amp; sprints</li><li>${sicon("check")} Group challenges &amp; chat</li><li>${sicon("check")} Stories &amp; status</li><li>${sicon("check")} Streaks &amp; garden</li><li>${sicon("check")} Coins, badges &amp; rewards</li><li>${sicon("check")} Stats &amp; achievements</li><li>${sicon("check")} Offline-first install</li></ul></section><section class="landing-quotes-wrap"><h2>Students focus better with StudyFlow</h2><div class="grid three landing-quotes"><figure class="card landing-quote"><blockquote>“The sprint rooms keep me honest. Seeing three friends' timers running makes it so much harder to pick up my phone.”</blockquote><figcaption><span class="q-ava">AM</span><div><strong>Ama M.</strong><small>Level 300, KNUST</small><span class="q-stars" aria-label="5 out of 5 stars">★★★★★</span></div><span class="q-verified">${sicon("check")} verified student</span></figcaption></figure><figure class="card landing-quote"><blockquote>“I used to revise with ten tabs open. Now one 25-minute session with rain sounds beats two hours of pretending.”</blockquote><figcaption><span class="q-ava">KO</span><div><strong>Kojo O.</strong><small>Pre-med, University of Ghana</small><span class="q-stars" aria-label="5 out of 5 stars">★★★★★</span></div><span class="q-verified">${sicon("check")} verified student</span></figcaption></figure><figure class="card landing-quote"><blockquote>“My whole garden is flowers from exam season. Streaks plus coins sound gimmicky — until they're the reason you show up daily.”</blockquote><figcaption><span class="q-ava">EA</span><div><strong>Efe A.</strong><small>Engineering, UCC</small><span class="q-stars" aria-label="5 out of 5 stars">★★★★★</span></div><span class="q-verified">${sicon("check")} verified student</span></figcaption></figure></div></section><section class="landing-faq-wrap" id="landing-faq"><h2>Questions, answered</h2><div class="landing-faq"><details><summary>Is StudyFlow really free?</summary><p>Yes — the timer, techniques, community, book library and rewards are free forever. Optional MoMo coin top-ups buy extra fuel, never access.</p></details><details><summary>Do I need an account?</summary><p>No — start focusing immediately. A free account syncs streaks, coins and books across devices, so it's worth adding when you're ready.</p></details><details><summary>What is the MoMo top-up?</summary><p>Coins normally come free from focus sessions and streaks. Want more? MTN, Telecel and AirtelTigo mobile money through Moolre tops you up in seconds.</p></details><details><summary>Does it work offline?</summary><p>Yes — StudyFlow installs as an app and keeps the shell and your data on-device, so a dropped connection never stops a session.</p></details><details><summary>Is my data private?</summary><p>You choose what's visible. Tasks, notes and reading stay on your device unless you sign in to sync — and profile visibility is yours to set.</p></details></div></section><section class="landing-invite"><div class="li-copy"><h2>Better with a study buddy</h2><p class="muted">Invite a friend, open a sprint room and keep each other honest — shared streaks and live timers make focus social.</p><div class="li-actions"><button type="button" class="primary" data-share="wa">${sicon("chat")} Invite on WhatsApp</button><button type="button" class="ghost" data-share="x">Share on X</button><button type="button" class="ghost" data-share="copy">Copy link</button></div></div><div class="li-art" aria-hidden="true"><span class="li-ava a1">AM</span><span class="li-ava a2">KO</span><span class="li-ava a3">${sicon("users")}</span></div></section><section class="landing-cta card"><div><h2>Ready to make focus a habit?</h2><p class="muted">Your first session is one tap away — coins, flowers and streaks start immediately.</p></div><button type="button" class="primary" data-enter>Start free — no signup</button></section><footer class="landing-foot"><div class="lf-brand"><span class="brand-mark">◷</span><strong>StudyFlow</strong></div><nav class="lf-links"><button type="button" data-scroll="#landing-feats">Features</button><button type="button" data-scroll="#landing-how">How it works</button><button type="button" data-scroll="#landing-faq">FAQ</button><button type="button" data-enter>Open app</button><button type="button" data-legal="privacy">Privacy</button><button type="button" data-legal="terms">Terms</button><button type="button" data-legal="contact">Contact</button></nav><div class="muted">© ${year} StudyFlow · made for deep work</div></footer></div>`
}

/* ---- Landing behaviours: reveals, sticky nav, showcase, share, legal ---- */

const SHARE_TEXT =
  "Study with me on StudyFlow — Pomodoro, streaks and rewards, free forever."

const LEGAL = {
  privacy: {
    title: "Privacy Policy",      body: `<p>StudyFlow is local-first: your tasks, notes, timer settings, streaks and books live on your own device by default.</p>
      <h3>What leaves your device</h3>
      <p>Only when you sign in do we sync the essentials — your profile, progress, coins, stories and uploaded books — to secure cloud storage. Nothing is sold, rented or used for advertising.</p>
      <h3>What others can see</h3>
      <p>You control visibility. Your display name, avatar and shared content are visible only to the audience your settings allow.</p>
      <h3>Your choices</h3>
      <p>You can wipe everything — local data and cloud records — from Settings → Delete all my data. Anonymous counters help us improve; they never profile you.</p>
      <h3>Contact</h3>
      <p>Questions? Reach the team at <b>blaymiezahlemuelackah2008@gmail.com</b>.</p>`,
  },
  terms: {
    title: "Terms of Service",
    body: `<p>By using StudyFlow you agree to use it as a study tool, fairly and lawfully.</p>
      <h3>Your account</h3>
      <p>You are responsible for what happens under your login. Keep credentials to yourself and treat community members with respect.</p>
      <h3>Coins and top-ups</h3>
      <p>Coins are virtual rewards earned by focusing. Optional mobile-money top-ups add coins only — they never buy special privileges — and completed top-ups are non-refundable except where the law requires otherwise.</p>
      <h3>Your content</h3>
      <p>Stories, messages and books you upload remain yours. You grant only the permission needed to store them and show them to the audience you choose.</p>
      <h3>Availability</h3>
      <p>The app is provided "as is" without warranty. We work hard to keep it fast and offline-friendly, but cannot promise uninterrupted service.</p>`,
  },
  contact: {
    title: "Contact",
    body: `<h3>Support</h3>
      <p>Email <a href="mailto:blaymiezahlemuelackah2008@gmail.com">blaymiezahlemuelackah2008@gmail.com</a> — we aim to reply within one working day.</p>
      <h3>Community</h3>
      <p>Prefer chat? The community groups inside StudyFlow are open around the clock — study rooms, sprints and group discussions.</p>
      <h3>Press and partnerships</h3>
      <p>Same inbox — mention "press" or "partnership" in the subject line and we will route you to the right person.</p>`,
  },
}

let navScrollHandler = null
let shotTimer = null
let microWired = false

function countUp(el, target, ms = 1100, suffix = "") {
  if (!el) return
  const final = Number(target) || 0
  if (state.reduceMotion) {
    el.textContent = final.toLocaleString("en-US") + suffix
    return
  }
  const t0 = performance.now()
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms)
    const eased = 1 - Math.pow(1 - k, 3)
    el.textContent = Math.round(final * eased).toLocaleString("en-US") + suffix
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function runStatCount(section) {
  $$(".ls-item b", section).forEach((b) => {
    const m = /^(\d+)(\+?)$/.exec(b.textContent.trim())
    if (m) countUp(b, parseInt(m[1], 10), 1200, m[2])
  })
}

function wireReveal(root) {
  if (!("IntersectionObserver" in window) || state.reduceMotion) return
  // The showcase already has its own tab-switching animation — skip it so the
  // product screenshot is visible immediately on mobile (the parent .rv opacity
  // would otherwise hide it until the section scrolls into view).
  const targets = $$(
    ".landing > section:not([data-showcase]), #landing-feats > .card, .landing-how-card, .landing-quote, .landing-cta",
    root,
  )
  if (!targets.length) return
  targets.forEach((el) => el.classList.add("rv"))
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        e.target.classList.add("rv-in")
        io.unobserve(e.target)
        if (e.target.classList.contains("landing-stats")) runStatCount(e.target)
      }
    },
    { threshold: 0.16, rootMargin: "0px 0px -5% 0px" },
  )
  targets.forEach((el) => io.observe(el))
}

function wireStickyNav(root) {
  const nav = $(".landing-nav", root)
  if (!nav) return
  if (navScrollHandler) window.removeEventListener("scroll", navScrollHandler)
  navScrollHandler = () => nav.classList.toggle("stuck", window.scrollY > 40)
  window.addEventListener("scroll", navScrollHandler, { passive: true })
  navScrollHandler()
}

function wireShowcase(root) {
  const wrap = $("[data-showcase]", root)
  if (!wrap) return
  if (shotTimer) clearInterval(shotTimer)
  shotTimer = null
  const tabs = $$(".shot-tab", wrap)
  const panels = $$(".shot-panel", wrap)
  const cap = $("[data-shot-caption]", root)
  const select = (n) => {
    tabs.forEach((t) => {
      const on = Number(t.dataset.shot) === n
      t.classList.toggle("is-active", on)
      t.setAttribute("aria-selected", on ? "true" : "false")
    })
    panels.forEach((p) => {
      const on = Number(p.dataset.panel) === n
      p.classList.toggle("is-active", on)
      p.hidden = !on
      if (on && cap && p.dataset.caption) cap.textContent = p.dataset.caption
    })
  }
  const stop = () => {
    if (shotTimer) clearInterval(shotTimer)
    shotTimer = null
  }
  tabs.forEach((t) => {
    t.onclick = () => {
      stop()
      select(Number(t.dataset.shot))
    }
  })
  wrap.addEventListener("pointerdown", stop, { once: true })
  if (!state.reduceMotion) {
    let n = 0
    shotTimer = setInterval(() => {
      if (!document.contains(wrap)) return stop()
      n = (n + 1) % tabs.length
      select(n)
    }, 4500)
  }
}

function wireShare(root) {
  $$("[data-share]", root).forEach((b) => {
    b.onclick = () => {
      const url = location.href.split("#")[0]
      const kind = b.dataset.share
      if (kind === "wa") {
        window.open(
          "https://wa.me/?text=" + encodeURIComponent(SHARE_TEXT + " " + url),
          "_blank",
          "noopener",
        )
      } else if (kind === "x") {
        window.open(
          "https://twitter.com/intent/tweet?text=" +
            encodeURIComponent(SHARE_TEXT) +
            "&url=" +
            encodeURIComponent(url),
          "_blank",
          "noopener",
        )
      } else if (navigator.clipboard) {
        navigator.clipboard
          .writeText(url)
          .then(() => {
            const prev = b.textContent
            b.textContent = "Link copied!"
            setTimeout(() => {
              b.textContent = prev
            }, 1600)
          })
          .catch(() => {})
      }
    }
  })
}

function wireLegal(root) {
  const buttons = $$("[data-legal]", root)
  if (!buttons.length) return
  const dlg = document.createElement("dialog")
  dlg.className = "legal-dlg"
  root.appendChild(dlg)
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close()
  })
  buttons.forEach((b) => {
    b.onclick = () => {
      const page = LEGAL[b.dataset.legal]
      if (!page) return
      dlg.innerHTML = `<div class="legal-card"><div class="legal-head"><h3>${page.title}</h3><button type="button" class="icon-btn legal-close" aria-label="Close">×</button></div><div class="legal-body">${page.body}</div></div>`
      const close = $(".legal-close", dlg)
      if (close) close.onclick = () => dlg.close()
      dlg.showModal()
    }
  })
}

function wireMicroInteractions(root) {
  const canHover = window.matchMedia("(hover: hover)").matches
  if (!state.reduceMotion && canHover) {
    $$(".landing-actions .primary, .ln-links .ln-open", root).forEach((btn) => {
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect()
        const dx = ((e.clientX - r.left) / r.width - 0.5) * 8
        const dy = ((e.clientY - r.top) / r.height - 0.5) * 6
        btn.style.transform = `translate(${dx}px, ${dy}px)`
      })
      btn.addEventListener("pointerleave", () => {
        btn.style.transform = ""
      })
    })
  }
  if (microWired) return
  microWired = true
  root.addEventListener("click", (e) => {
    const t = e.target.closest?.(".landing .ghost, .landing .icon-btn")
    if (!t || state.reduceMotion) return
    const r = t.getBoundingClientRect()
    const rip = document.createElement("span")
    rip.className = "ripple"
    const size = Math.max(r.width, r.height)
    rip.style.width = size + "px"
    rip.style.height = size + "px"
    rip.style.left = e.clientX - r.left - size / 2 + "px"
    rip.style.top = e.clientY - r.top - size / 2 + "px"
    t.appendChild(rip)
    rip.addEventListener("animationend", () => rip.remove())
  })
}

async function loadLiveStats(root) {
  const box = $("[data-live]", root)
  if (!box) return
  try {
    const mod = await import("./services/backend.js")
    const sb = mod.supabase
    if (!sb) return
    const { data, error } = await sb.rpc("sf_public_stats")
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) return
    box.hidden = false
    countUp($("[data-live-sessions]", box), Number(row.sessions) || 0, 1500)
    countUp($("[data-live-learners]", box), Number(row.learners) || 0, 1500)
  } catch {
    /* stats stay hidden until migration 034 is applied */
  }
}

/* Mount the landing page into #root. `onEnter` runs the app's onboarding
   entry flow (owned by account.js); every Open-app button funnels there. */
export const INSTALL_SUPPORT_EMAIL = "blaymiezahlemuelackah2008@gmail.com"

export function mountLanding(root, { onEnter } = {}) {
  if (!root) return

  root.innerHTML = landingMarkup()

  const enter = () => {
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

  wireStickyNav(root)
  wireReveal(root)
  wireShowcase(root)
  wireShare(root)
  wireLegal(root)
  wireMicroInteractions(root)
  setTimeout(() => loadLiveStats(root), 1200)

  const installBtn = $("[data-install]", root)

  if (installBtn) {
    installBtn.setAttribute(
      "aria-label",
      document.documentElement.getAttribute("data-install-target") ||
        "Install StudyFlow app",
    )
    installBtn.onclick = () => {
      if (typeof window.sfInstall === "function") {
        window.sfInstall()
      } else if (window.__sfInstallState && window.__sfInstallState.hint) {
        // iOS: surface the Add-to-Home-Screen instructions instead.
        const hint = window.__sfInstallState.hint
        if (hint && hint.platform === "ios") {
          const msg = [
            hint.label + ":",
            ...hint.instructions.map((s) => "• " + s),
          ].join("\n")
          alert(msg)
        }
      }
    }
    // Reflect install state changes live.
    const updateInstallBtn = () => {
      if (window.__sfInstallState && window.__sfInstallState.installed) {
        installBtn.textContent = sicon("check") + " Installed"
        installBtn.disabled = true
        installBtn.style.opacity = "0.7"
      }
    }
    window.addEventListener("sf-install:installed", updateInstallBtn)
    window.addEventListener("sf-install:dismissed", () => {
      installBtn.textContent = sicon("download") + " Install again"
    })
  }

  return root
}
