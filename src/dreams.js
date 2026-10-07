/* dreams.js — the Dreams experience.

   Kids answer one question — "Who do you want to be when you grow up?" —
   and that answer greets them FIRST every time StudyFlow opens (the intro
   veil mounted from app.js on every boot). Adults write life ambitions with
   a target date or year; saving one raises a full-screen standing ovation
   that plays until the crowd stops, then hands the site back exactly as it
   was. The landing section renders both parts side by side. */

import { $, esc, sicon, state, persist, notify, uid, celebrate } from "./core.js"

const DREAM_QUESTION = "Who do you want to be when you grow up?"

const OVATION_SRC = "/ovation.mp4"

const OVATION_POSTER = "/ovation-poster.jpg"

const INTRO_AUTO_CLOSE_MS = (() => {
  try {
    // QA hook: localStorage "sf-dream-hold-ms" pins the greeting open so
    // screenshots and Playwright runs can actually see it.
    const held = Number(localStorage.getItem("sf-dream-hold-ms"))
    return held >= 1000 && held <= 600000 ? held : 6800
  } catch {
    return 6800
  }
})()

/* ---------- state helpers ---------- */

function getDream() {
  const d = state.dream && typeof state.dream === "object" ? state.dream : {}
  return {
    answer: String(d.answer || "").trim(),

    at: Number(d.at) || 0,

    dismissedAt: Number(d.dismissedAt) || 0,
  }
}

function writeDream(next) {
  state.dream = { ...getDream(), ...next }

  persist()

  // The boot veil may save while the landing page is already mounted — let
  // it repaint the ribbon and kids card live.
  try {
    window.dispatchEvent(new CustomEvent("sf-dream-changed"))
  } catch {
    /* ignore */
  }
}

function getAmbitions() {
  if (!Array.isArray(state.ambitions)) state.ambitions = []
  return state.ambitions
}

function sparks(n) {
  let out = ""
  for (let i = 0; i < n; i += 1) {
    const left = Math.round(Math.random() * 96 + 2)

    const size = Math.round(Math.random() * 5 + 3)

    const dur = Math.round(Math.random() * 7000 + 7000) / 1000

    const delay = Math.round(Math.random() * 6000) / 1000

    out += `<i style="left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s"></i>`
  }
  return out
}

function lockScroll() {
  document.body.classList.add("dream-lock")
}

function unlockScroll() {
  document.body.classList.remove("dream-lock")
}

/* ---------- boot greeting: the first thing the site shows ---------- */

function introAnswerMarkup(d) {
  return `<div class="dream-splash"><div class="dream-sparks" aria-hidden="true">${sparks(16)}</div><div class="dream-splash-card"><span class="dream-eyebrow">${sicon("sparkle")} When I grow up, I want to be…</span><p class="dream-big">“${esc(d.answer)}”</p><div class="dream-veil-actions"><button type="button" class="primary" data-dream-continue>Step into StudyFlow →</button></div><span class="dream-autobar" aria-hidden="true"></span><small class="muted">Your dream greets you first, every time you open StudyFlow.</small></div></div>`
}

function introQuestionMarkup(d) {
  const again = d.dismissedAt
    ? `<small class="muted">Last chance skipped — but dreams wait patiently.</small>`
    : `<small class="muted">Your answer shows up first, every time StudyFlow opens.</small>`
  return `<div class="dream-splash"><div class="dream-sparks" aria-hidden="true">${sparks(16)}</div><div class="dream-splash-card dream-question-card"><span class="dream-eyebrow">${sicon("sparkle")} One little question</span><h2 class="dream-big">${DREAM_QUESTION}</h2><form class="dream-qform"><input class="input dream-qinput" data-dream-input placeholder="A pilot… a doctor… a game maker… your dream, in your words" maxlength="120" autocomplete="off" aria-label="${DREAM_QUESTION}"><button type="submit" class="primary">That's me! ${sicon("sparkle")}</button></form><button type="button" class="dream-maybe" data-dream-maybe>Maybe later</button>${again}</div></div>`
}

function closeVeil(veil, onGone) {
  if (!veil || veil.__closing) return
  veil.__closing = true
  veil.classList.remove("dream-in")
  veil.classList.add("dream-out")
  setTimeout(() => {
    veil.remove()
    unlockScroll()
    if (typeof onGone === "function") onGone()
  }, 480)
}

export function mountDreamIntro() {
  if ($("#dream-veil")) return
  const d = getDream()

  const veil = document.createElement("div")
  veil.id = "dream-veil"
  veil.className = "dream-veil"
  veil.innerHTML = d.answer ? introAnswerMarkup(d) : introQuestionMarkup(d)
  lockScroll()
  document.body.appendChild(veil)
  requestAnimationFrame(() => veil.classList.add("dream-in"))

  let autoT = null
  const onKey = (e) => {
    if (e.key === "Escape") closeVeil(veil, cleanup)
  }
  const cleanup = () => {
    if (autoT) clearTimeout(autoT)
    document.removeEventListener("keydown", onKey, true)
  }
  document.addEventListener("keydown", onKey, true)

  if (d.answer) {
    // The dream has been spoken — a gentle auto-continue keeps it magical,
    // never blocking. Any click or Enter moves on instantly.
    autoT = setTimeout(() => closeVeil(veil, cleanup), INTRO_AUTO_CLOSE_MS)
    veil.addEventListener("click", (e) => {
      if (e.target.closest("[data-dream-continue]") || e.target === veil)
        closeVeil(veil, cleanup)
    })
    const btn = $("[data-dream-continue]", veil)
    if (btn) btn.onclick = () => closeVeil(veil, cleanup)
  } else {
    // First visit (or question skipped before): invite the answer. Only an
    // explicit "Maybe later" or Escape skips — background taps never steal
    // the question away.
    veil.addEventListener("click", (e) => {
      if (e.target.closest("[data-dream-maybe]")) {
        writeDream({ dismissedAt: Date.now() })
        closeVeil(veil, cleanup)
      }
    })
    const form = $(".dream-qform", veil)
    if (form)
      form.addEventListener("submit", (e) => {
        e.preventDefault()
        const input = $("[data-dream-input]", veil)
        const value = (input?.value || "").trim()
        if (!value) {
          input?.focus()
          const card = $(".dream-splash-card", veil)
          if (card) {
            card.classList.remove("dream-shake")
            void card.offsetWidth
            card.classList.add("dream-shake")
          }
          return
        }
        writeDream({ answer: value, at: Date.now() })
        try {
          celebrate()
        } catch {
          /* confetti is a bonus */
        }
        const card = $(".dream-splash-card", veil)
        if (card)
          card.innerHTML = `<span class="dream-eyebrow">${sicon("sparkle")} Then let's begin…</span><p class="dream-big">“${esc(value)}”</p><small class="muted">Saved. This dream greets you first, every time you open StudyFlow.</small><span class="dream-autobar fast" aria-hidden="true"></span>`
        if (autoT) clearTimeout(autoT)
        autoT = setTimeout(() => closeVeil(veil, cleanup), 3200)
      })
    const input = $("[data-dream-input]", veil)
    if (input) setTimeout(() => input.focus(), 350)
  }
}

/* ---------- ovation: full-screen crowd, until the video ends ---------- */

let ovationBound = false

export function playOvation() {
  if ($("#ovation-veil")) return
  const veil = document.createElement("div")
  veil.id = "ovation-veil"
  veil.className = "ovation-veil"
  veil.setAttribute("role", "dialog")
  veil.setAttribute("aria-label", "A standing ovation, for you")
  veil.innerHTML = `<video src="${OVATION_SRC}" poster="${OVATION_POSTER}" autoplay playsinline preload="auto"></video><div class="ovation-glow" aria-hidden="true"></div><div class="ovation-copy"><span class="ovation-eyebrow">${sicon("star")} A standing ovation — for you</span><h2>Take a bow.</h2><p>This crowd stands for what you're becoming. StudyFlow returns the moment they sit down.</p></div>`
  lockScroll()
  document.body.appendChild(veil)
  requestAnimationFrame(() => veil.classList.add("ovation-in"))

  const video = $("video", veil)
  let started = false

  const finish = () => {
    veil.classList.add("ovation-out")
    setTimeout(() => {
      veil.remove()
      unlockScroll()
    }, 700)
  }

  if (!ovationBound) {
    // Escape is a hidden courtesy hatch; the show itself runs to the end.
    ovationBound = true
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("#ovation-veil")) {
        const v = $("#ovation-veil video")
        if (v) {
          v.pause()
          v.dispatchEvent(new Event("ended"))
        }
      }
    })
  }

  if (video) {
    video.addEventListener("ended", finish)
    video.addEventListener("error", () => {
      finish()
      try {
        notify("The ovation video could not load — your dream still counts")
      } catch {
        /* ignore */
      }
    })
    video.play().catch(() => veil.classList.add("ovation-wait"))
    veil.addEventListener("click", () => {
      if (started) return
      video
        .play()
        .then(() => {
          started = true
          veil.classList.remove("ovation-wait")
        })
        .catch(() => {})
    })
  } else {
    finish()
  }
}

/* ---------- landing section: kids + adults, side by side ---------- */

function ambitionItemMarkup(a) {
  return `<li class="dream-item ${a.done ? "done" : ""}"><button type="button" class="dream-check${a.done ? " on" : ""}" data-ambition-done="${a.id}" aria-label="${a.done ? "Mark as still dreaming" : "Mark achieved"}" aria-pressed="${a.done ? "true" : "false"}">${a.done ? sicon("check") : ""}</button><div class="dream-item-main"><b>${esc(a.text)}</b>${a.target ? `<span class="dream-chip">${sicon("star")} ${esc(a.target)}</span>` : ""}</div><button type="button" class="icon-btn dream-del" data-ambition-del="${a.id}" aria-label="Remove ambition">×</button></li>`
}

function ambitionsListMarkup() {
  const items = getAmbitions()
  if (!items.length)
    return `<li class="dream-empty">No ambitions yet — the first one brings this whole crowd to its feet.</li>`
  return items.map(ambitionItemMarkup).join("")
}

function kidsCardMarkup(d) {
  const form = `<form class="dream-qform" data-dream-form ${d.answer && !d.editing ? "hidden" : ""}><input class="input dream-qinput" data-dream-input maxlength="120" autocomplete="off" placeholder="A pilot… a doctor… a game maker…" aria-label="${DREAM_QUESTION}" value="${esc(d.answer)}"><button type="submit" class="primary">${d.answer ? "Save my new dream" : "That's me!"}</button></form>`
  const answered = d.answer
    ? `<p class="dream-answer-big">“${esc(d.answer)}”</p><p class="muted dream-note">This is the first thing you'll see every time you open StudyFlow.</p><div class="dream-actions"><button type="button" class="ghost" data-dream-edit>${sicon("refresh")} Change my answer</button></div>`
    : `<p class="muted dream-note">Write it in your own words — it becomes the first thing you see every time you open StudyFlow.</p>`
  return `<div class="dream-card-head"><span class="dream-tag dream-tag-kids">${sicon("sparkle")} For kids</span><h3>${DREAM_QUESTION}</h3></div>${answered}${form}`
}

function adultsCardMarkup() {
  return `<div class="dream-card-head"><span class="dream-tag dream-tag-adults">For adults</span><h3>Your life ambitions</h3><p class="muted">Name what you want to achieve — and when you're claiming it. Writing one down earns you a full-screen standing ovation.</p></div><ul class="dream-list" data-ambition-list>${ambitionsListMarkup()}</ul><form class="dream-ambition-form" data-ambition-form><input class="input" data-ambition-text maxlength="140" autocomplete="off" placeholder="e.g. Build my own school" aria-label="Your ambition"><input class="input dream-target" data-ambition-target maxlength="24" autocomplete="off" placeholder="By 2030" aria-label="Target date or year"><button type="submit" class="primary">${sicon("check")} Add ambition</button></form><div class="dream-ovation-row"><button type="button" class="ghost" data-play-ovation>▶ Play my standing ovation</button><small class="muted">Full-screen · plays until the crowd stops · then StudyFlow returns just as it was</small></div>`
}

function dreamsSectionMarkup() {
  return `<div class="dreams-head"><h2>Dreams, spoken out loud</h2><p class="muted">One question for the kids. A whole sky for the adults.</p></div><div class="dreams-grid"><div class="card dream-card dream-card-kids" id="dream-kids"></div><div class="card dream-card dream-card-adults" id="dream-adults">${adultsCardMarkup()}</div></div>`
}

function repaint(root) {
  const kids = $("#dream-kids", root)
  if (kids) {
    const editing = kids.__editing
    kids.innerHTML = kidsCardMarkup({ ...getDream(), editing })
    if (editing) {
      const input = $("[data-dream-input]", kids)
      if (input) {
        input.focus()
        input.selectionStart = input.value.length
      }
    }
  }
  const list = $("[data-ambition-list]", root)
  if (list) list.innerHTML = ambitionsListMarkup()

  paintRibbon(root)
}

function paintRibbon(root) {
  const slot = $("[data-dream-ribbon]", root)
  if (!slot) return
  const d = getDream()
  if (!d.answer) {
    slot.hidden = true
    slot.innerHTML = ""
    return
  }
  slot.hidden = false
  slot.innerHTML = `<button type="button" class="dream-ribbon-pill" data-ribbon-goto>${sicon("sparkle")} <span>When I grow up, I want to be</span> <b>“${esc(d.answer)}”</b></button>`
  const pill = $("[data-ribbon-goto]", slot)
  if (pill)
    pill.onclick = () => {
      try {
        $("#landing-dreams")?.scrollIntoView({
          behavior: state.reduceMotion ? "auto" : "smooth",
          block: "start",
        })
      } catch {
        /* ignore */
      }
    }
}

let dreamsWinBound = false

let dreamsBoundHost = null

export function renderDreamsSection(root) {
  const host = $("#landing-dreams", root)
  if (!host) return
  host.innerHTML = dreamsSectionMarkup()
  repaint(root)

  // The window listener is document-scoped and bound once; the host
  // listeners are bound per element — mountLanding can rebuild #root
  // (e.g. the tech-check back button), and a fresh host must still respond.
  if (!dreamsWinBound) {
    dreamsWinBound = true
    window.addEventListener("sf-dream-changed", () => {
      const current = document.querySelector("#landing-dreams")
      if (!current) return
      const kids = document.querySelector("#dream-kids")
      if (kids) kids.__editing = false
      repaint(document)
    })
  }

  if (dreamsBoundHost === host) return
  dreamsBoundHost = host

  host.addEventListener("submit", (e) => {
    const form = e.target
    if (form?.matches?.("[data-dream-form]")) {
      e.preventDefault()
      const input = $("[data-dream-input]", host)
      const value = (input?.value || "").trim()
      if (!value) {
        input?.focus()
        return
      }
      writeDream({ answer: value, at: Date.now() })
      const kids = $("#dream-kids", root)
      if (kids) kids.__editing = false
      repaint(root)
      try {
        notify("Saved — this dream now greets you first, every time")
        celebrate()
      } catch {
        /* ignore */
      }
      return
    }
    if (form?.matches?.("[data-ambition-form]")) {
      e.preventDefault()
      const textEl = $("[data-ambition-text]", host)
      const targetEl = $("[data-ambition-target]", host)
      const text = (textEl?.value || "").trim()
      if (!text) {
        textEl?.focus()
        const card = form.closest(".dream-card")
        if (card) {
          card.classList.remove("dream-shake")
          void card.offsetWidth
          card.classList.add("dream-shake")
        }
        return
      }
      const target = (targetEl?.value || "").trim()
      getAmbitions().unshift({
        id: uid(),
        text,
        target,
        done: false,
        at: Date.now(),
      })
      persist()
      if (textEl) textEl.value = ""
      if (targetEl) targetEl.value = ""
      repaint(root)
      try {
        notify("Ambition written down — the crowd is rising…")
      } catch {
        /* ignore */
      }
      setTimeout(() => playOvation(), 450)
    }
  })

  host.addEventListener("click", (e) => {
    const t = e.target.closest?.("[data-dream-edit], [data-ambition-done], [data-ambition-del], [data-play-ovation]")
    if (!t) return
    if (t.matches("[data-dream-edit]")) {
      const kids = $("#dream-kids", root)
      if (kids) {
        kids.__editing = true
        repaint(root)
      }
      return
    }
    if (t.matches("[data-ambition-done]")) {
      const id = t.getAttribute("data-ambition-done")
      const item = getAmbitions().find((a) => a.id === id)
      if (item) {
        item.done = !item.done
        persist()
        repaint(root)
        if (item.done) {
          try {
            celebrate()
          } catch {
            /* ignore */
          }
        }
      }
      return
    }
    if (t.matches("[data-ambition-del]")) {
      const id = t.getAttribute("data-ambition-del")
      state.ambitions = getAmbitions().filter((a) => a.id !== id)
      persist()
      repaint(root)
      return
    }
    if (t.matches("[data-play-ovation]")) {
      playOvation()
    }
  })
}
