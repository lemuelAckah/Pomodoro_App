/* app.js — shell, navigation, search, boot */

import {
  state,
  $,
  $$,
  uid,
  get,
  save,
  esc,
  sicon,
  persist,
  notify,
  checkReminder,
  maybeWhatsNew,
  refreshServerTime,
  applyDisplay,
  applyEquippedTheme,
  applyMotion,
  avatarMarkup,
  cloudStateSubscription,
  hydrateCloudState,
  refreshCoinDisplays,
  staggerCardsIn,
  syncThemeToggle,
  toggleNight,
  setCloudSubscription,
  sanitizeState,
  formatHeaderDate,
  updateBarPadding,
  restoreArchivedState,
  archiveStateForSignOut,
  haltPersist,
} from "./core.js"

import { getCurrentUser, onAuthStateChange } from "./services/backend.js"

import { pullProductivity } from "./services/productivity-sync.js"

import { pullRewards } from "./services/rewards-sync.js"

import { pullMusic } from "./services/music-sync.js"

import {
  migrateSongs,
  sounds,
  renderNowPlaying,
  initAudioState,
} from "./audio.js"

import {
  renderTimer,
  renderMiniTimer,
  toggleTimer,
  toggleBoss,
  closeFocusView,
  initTimerState,
  resetFocusSession,
  openFocusView,
} from "./timer.js"

import { techniques, openTechniqueGuide } from "./tech-catalog.js"

import { renderSounds } from "./audio.js"

import {
  storeItems,
  normItem,
  migrateOwned,
  equippedAvatarEmoji,
} from "./store-catalog.js"

import { syncBooksLibrary } from "./services/books-sync.js"

import { renderFavorites } from "./tech-catalog.js"

import { renderLanding, renderAccount, renderSettings } from "./account.js"

let searchHits = []

// Guards the one-time-per-session cloud hydration: auth events repeat

// (INITIAL_SESSION, TOKEN_REFRESHED, visibility changes) and every repeat

// used to rebuild the whole app underneath the user.

let hydrationInFlight = false

function openSearch() {
  closeSearch()

  const overlay = document.createElement("div")

  overlay.className = "modal-backdrop"

  overlay.id = "search-palette"

  overlay.innerHTML = `<div class="modal search-modal"><input class="input" id="search-input" placeholder="Search tasks, groups, techniques, store…" aria-label="Global search" autocomplete="off"><div id="search-results" class="search-results"></div><div class="muted" style="font-size:11px;margin-top:8px">Enter opens the top hit · Esc closes · Ctrl K toggles</div></div>`

  document.body.append(overlay)

  const input = $("#search-input", overlay)

  input.oninput = () => renderSearchResults(input.value.trim().toLowerCase())

  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      const first = $("[data-hit]", overlay)

      if (first) {
        const hit = searchHits[+first.dataset.hit]

        overlay.remove()

        if (hit) runSearchHit(hit)
      }
    }
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove()
  })

  renderSearchResults("")

  setTimeout(() => input.focus(), 0)
}

function closeSearch() {
  $("#search-palette")?.remove()
}

async function collectSearch(q) {
  const hits = []
  ;(state.tasks || []).forEach((t) => {
    if (!q || t.text.toLowerCase().includes(q))
      hits.push({
        icon: sicon("check"),

        title: t.text,

        sub: t.done ? "Task · done" : "Task · open Focus desk",

        run: () => {
          state.tab = "timer"
        },
      })
  })

  techniques.forEach((x) => {
    if (!q || `${x[1]} ${x[3]} ${x[5]}`.toLowerCase().includes(q))
      hits.push({
        icon: x[2],

        title: x[1],

        sub: "Technique guide",

        run: () => {
          openTechniqueGuide(x[0])
        },
      })
  })

  // Groups live in the lazy community chunk — search degrades gracefully
  // to the rest of the index while it loads (or if the load fails).
  const communityMod = await import("./community.js").catch(() => null)

  if (communityMod) {
    communityMod.allGroups().forEach((g) => {
      if (
        !q ||
        `${g.name} ${(g.tags || []).join(" ")}`.toLowerCase().includes(q)
      ) {
        const joined = get("sf-joined", []).includes(g.id)

        hits.push({
          icon: g.emoji,

          title: g.name,

          sub: joined ? "Group · open chat" : "Group · join",

          run: () => {
            state.tab = "community"

            state.activeChat = joined ? g.id : null

            state.subtab = joined ? "messages" : "discover"
          },
        })
      }
    })
  }
  ;(state.friends || []).forEach((f) => {
    if (!q || f.username.toLowerCase().includes(q))
      hits.push({
        icon: sicon("user"),

        title: "@" + f.username,

        sub: "Friend · open chat",

        run: () => {
          state.tab = "community"

          state.subtab = "messages"

          state.activeChat = f.id
        },
      })
  })

  storeItems.forEach((raw) => {
    const it = normItem(raw)

    if (!q || `${it.name} ${it.category}`.toLowerCase().includes(q))
      hits.push({
        icon: it.emoji,

        title: it.name,

        sub: `Reward · ${sicon("coin")}${it.price}`,

        run: () => {
          state.tab = "store"

          state.storeCategory = it.category
        },
      })
  })

  const booksMod = await import("./books.js").catch(() => null)

  if (booksMod) {
    booksMod.searchBooks(q).forEach((b) => {
      hits.push({
        icon: sicon("book"),

        title: b.title,

        sub: `Book · ${b.author || "Unknown author"}`,

        run: () => {
          state.tab = "books"

          state.bookView = { name: "details", id: b.id }
        },
      })
    })
  }

  return hits.slice(0, 9)
}

let searchTick = 0

function renderSearchResults(q) {
  const box = $("#search-results")

  if (!box) return

  // collectSearch awaits lazy chunks; a token drops stale results if the
  // user keeps typing or closes the palette mid-search.
  const tick = ++searchTick

  collectSearch(q).then((hits) => {
    if (tick !== searchTick) return

    const live = $("#search-results")

    if (!live) return

    searchHits = hits

    live.innerHTML = hits.length
      ? hits

          .map(
            (h, i) =>
              `<button type="button" class="search-row" data-hit="${i}"><span class="search-ico">${h.icon}</span><span class="search-txt"><strong>${esc(h.title)}</strong><small>${esc(h.sub)}</small></span></button>`,
          )

          .join("")
      : '<p class="muted">Nothing found. Try “focus”, a subject, or a friend’s name.</p>'

    $$("[data-hit]", live).forEach(
      (b) =>
        (b.onclick = () => {
          const hit = searchHits[+b.dataset.hit]

          closeSearch()

          if (hit) runSearchHit(hit)
        }),
    )
  })
}

function runSearchHit(hit) {
  try {
    hit.run()
  } catch {
    /* ignore */
  }

  persist()

  shell()
}

let headerDateTimer = null

function refreshHeaderDate() {
  const full = formatHeaderDate(new Date(), false)

  const short = formatHeaderDate(new Date(), true)

  document.querySelectorAll("[data-header-date]").forEach((el) => {
    const next = el.hasAttribute("data-header-short") ? short : full

    if (el.textContent !== next) el.textContent = next
  })

  scheduleHeaderDate()
}

function scheduleHeaderDate() {
  if (headerDateTimer) {
    clearTimeout(headerDateTimer)

    headerDateTimer = null
  }

  try {
    const now = new Date()

    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    )

    const ms = Math.max(1000, midnight.getTime() - now.getTime() + 500)

    headerDateTimer = setTimeout(() => {
      headerDateTimer = null

      refreshHeaderDate()
    }, ms)
  } catch {
    /* clock unavailable — header keeps its rendered date */
  }
}

if (!window.__sfDateWatch) {
  window.__sfDateWatch = true

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshHeaderDate()
  })

  window.addEventListener("focus", () => refreshHeaderDate())
}

function shell() {
  $("#root").innerHTML =
    `<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">◷</div><strong>StudyFlow</strong></div><div><div class="eyebrow" style="padding:0 12px 10px">Workspace</div><nav class="nav">${[
      ["timer", "◷", "Focus desk"],

      ["techniques", sicon("sparkle"), "Techniques"],

      ["sounds", "◒", "Sound studio"],

      ["community", "◎", "Community"],

      ["books", sicon("book"), "Book Library"],

      ["store", "◇", "Rewards store"],

      ["favorites", sicon("star"), "Favorites"],

      ["account", "◉", "Account"],

      ["settings", sicon("gear"), "Settings"],
    ]

      .map(
        ([id, ico, label]) =>
          `<button type="button" data-tab="${id}" class="${
            state.tab === id ? "active" : ""
          }"><span>${ico}</span>${label}</button>`,
      )

      .join(
        "",
      )}</nav></div><div class="sidebar-note"><div class="eyebrow">Today’s intention</div><p>Small focused sessions become remarkable progress.</p></div></aside><main class="main"><header class="topbar"><div><div class="mobile-brand"><span class="brand-mark">◷</span><strong>StudyFlow</strong></div><div class="eyebrow"><span data-header-date data-header-full>${formatHeaderDate(new Date(), false)}</span><span data-header-date data-header-short>${formatHeaderDate(new Date(), true)}</span></div></div><div class="top-actions"><button type="button" class="top-icon" data-search title="Search (Ctrl K)">${sicon("search")}</button><button type="button" class="top-icon" data-notifications title="Notifications">${sicon("gem")}<span class="notification-dot">${state.notifications.filter((n) => !n.read).length || ""}</span></button><button type="button" class="coins" data-go-topup title="Top up coins with MoMo">${sicon("coin")} <span id="coin-count" data-coin="header">${state.coins}</span></button><button type="button" class="theme-toggle${
      state.night ? " night" : ""
    }" data-theme-toggle role="switch" aria-checked="${Boolean(state.night)}" title="${
      state.night ? "Switch to day mode" : "Switch to night mode"
    }" aria-label="Toggle day and night mode"><span class="tt-icons">${sicon("sun")}${sicon("moon")}</span><span class="tt-thumb"></span></button><button type="button" class="avatar" data-profile title="Open profile">${avatarMarkup(state.profile.photo, equippedAvatarEmoji() || state.profile.avatar)}</button></div></header><div class="content"><div id="view"></div></div></main></div><div id="mini-timer-root"></div><div id="modal-root"></div>`

  bindShell()

  render()

  renderMiniTimer()

  applyEquippedTheme()

  applyMotion()

  applyDisplay()

  refreshCoinDisplays()

  scheduleHeaderDate()

  // On mobile the nav sits at the top of the page — after switching tabs,

  // bring the active tab chip back into view so the selection is visible.

  const activeNav = document.querySelector(".nav button.active")

  if (activeNav && typeof activeNav.scrollIntoView === "function") {
    try {
      activeNav.scrollIntoView({ block: "nearest", inline: "nearest" })
    } catch {
      /* older browsers */
    }
  }
}

function bindShell() {
  $$(".nav button").forEach(
    (button) =>
      (button.onclick = () => {
        state.tab = button.dataset.tab

        persist()

        shell()
      }),
  )

  $("[data-profile]").onclick = () =>
    import("./account.js").then((m) => m.openProfile())

  $("[data-search]").onclick = openSearch

  $("[data-notifications]").onclick = () =>
    import("./account.js").then((m) => m.openNotifications())

  $("[data-theme-toggle]").onclick = toggleNight

  $("[data-go-topup]")?.addEventListener("click", () => {
    state.tab = "store"

    persist()

    shell()

    requestAnimationFrame(() => {
      try {
        $("#coin-packs")?.scrollIntoView({
          behavior: state.reduceMotion ? "auto" : "smooth",

          block: "start",
        })
      } catch {
        /* older browsers */
      }
    })
  })

  syncThemeToggle()
}

let renderToken = 0

function render() {
  const view = $("#view")

  if (!view) return

  view.innerHTML = `${["timer", "techniques", "sounds", "community", "books", "store", "favorites", "account", "settings"].map((tab) => `<section id="tab-${tab}" class="tab-panel ${state.tab === tab ? "active" : ""}"></section>`).join("")}`

  // Eager views render synchronously; the four heavy features are lazy
  // route chunks pulled on first visit (and preloaded after boot).
  const syncViews = {
    timer: renderTimer,

    sounds: renderSounds,

    favorites: renderFavorites,

    account: renderAccount,

    settings: renderSettings,
  }

  const lazyViews = {
    techniques: () => import("./techniques.js").then((m) => m.renderTechniques),

    community: () => import("./community.js").then((m) => m.renderCommunity),

    books: () => import("./books.js").then((m) => m.renderLibrary),

    store: () => import("./store.js").then((m) => m.renderStore),
  }

  const paintOverlays = () => {
    if (state.call) {
      import("./community.js").then((m) => m.renderCall()).catch(() => {})
    }

    renderNowPlaying()
  }

  const runView = (draw) => {
    try {
      draw()
    } catch (err) {
      // One broken tab must never take down the whole app.

      console.error(`[studyflow] tab "${state.tab}" failed to render:`, err)

      const panel = $(`#tab-${state.tab}`)

      if (panel) {
        panel.innerHTML = `<div class="card empty-state"><div class="emoji">${sicon("warn")}</div><h3>This section hit a snag</h3><p class="muted">${esc(err?.message || "Something went wrong here. The rest of the app is fine.")}</p><div style="display:flex;gap:8px;justify-content:center"><button type="button" class="ghost" data-tab-retry>Try again</button><button type="button" class="primary" data-tab-home>Back to Focus</button></div></div>`

        $("[data-tab-retry]", panel).onclick = () => render()

        $("[data-tab-home]", panel).onclick = () => {
          state.tab = "timer"

          persist()

          shell()
        }
      }
    }
  }

  const sync = syncViews[state.tab]

  if (sync) {
    runView(sync)

    paintOverlays()

    staggerCardsIn($(`#tab-${state.tab}`))

    return
  }

  const token = ++renderToken

  // Paint a shimmering placeholder synchronously so the panel is never
  // blank while the chunk streams in (first visit only — afterwards the
  // module is cached and this frame is swapped out within milliseconds).
  const skelPanel = $(`#tab-${state.tab}`)

  if (skelPanel) {
    skelPanel.innerHTML = `<div class="route-skeleton" aria-hidden="true"><div class="sk-line sk-title"></div><div class="sk-line sk-sub"></div><div class="sk-grid">${`<div class="sk-line sk-card"></div>`.repeat(6)}</div></div>`
  }
  ;(lazyViews[state.tab] || (() => Promise.resolve(renderTimer)))()
    .then((draw) => {
      // The user may have switched tabs while the chunk was in flight.
      if (token !== renderToken || !$("#view")) return

      runView(draw)

      paintOverlays()

      staggerCardsIn($(`#tab-${state.tab}`))
    })
    .catch((err) => {
      if (token !== renderToken) return

      runView(() => {
        throw err
      })
    })
}

/* Layer contract (see styles): page popups (tooltips, dropdowns, chat menus)
   sit below the sticky topbar (30) and the fixed bottom bars (44+), and every
   one of them dismisses on scroll so drifting popups never slide over chrome. */

if (!window.__sfScrollCloser) {
  window.__sfScrollCloser = true

  window.addEventListener(
    "scroll",

    (e) => {
      try {
        // Scrolls inside a popup or modal are navigation, not dismissal.

        if (e.target?.closest?.(".friend-pick.drop, .modal, [data-picker]"))
          return

        document

          .querySelectorAll(
            ".friend-pick.drop, .post-menu.chat-menu, .post-menu[data-post-pop], [data-picker]",
          )

          .forEach((el) => {
            el.hidden = true
          })

        document.body.classList.add("is-scrolling")

        clearTimeout(window.__sfScrollT)

        window.__sfScrollT = setTimeout(
          () => document.body.classList.remove("is-scrolling"),

          280,
        )
      } catch {
        /* never break scrolling */
      }
    },

    { capture: true, passive: true },
  )
}

if (!window.__sfBarPadWatch) {
  window.__sfBarPadWatch = true

  window.addEventListener("resize", () => {
    try {
      updateBarPadding()
    } catch {
      /* ignore */
    }
  })
}

if (!window.__sfKeysBound) {
  window.__sfKeysBound = true

  document.addEventListener("keydown", (e) => {
    const tag = (document.activeElement?.tagName || "").toUpperCase()

    const typing =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      Boolean(document.activeElement?.isContentEditable)

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault()

      if ($("#search-palette")) closeSearch()
      else openSearch()

      return
    }

    if (e.key === "Escape") {
      if ($("#gift-center")) {
        $("#gift-center")?.remove()

        return
      }

      if ($("#search-palette")) closeSearch()

      if ($("#boss-veil")) toggleBoss(false)

      if ($("#focus-view")) closeFocusView()

      return
    }

    if (typing) return

    if (e.repeat) return

    if (
      (e.key === "b" || e.key === "B") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      if ($("#search-palette")) return

      toggleBoss()

      return
    }

    if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (tag === "BUTTON" || tag === "A") return

      if (state.tab === "timer" && !document.querySelector("#status-viewer")) {
        e.preventDefault()

        toggleTimer()
      }
    }

    if (
      (e.key === "r" || e.key === "R") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      if ($("#search-palette") || $("#status-viewer") || $("#focus-view"))
        return

      if (state.tab === "timer") {
        e.preventDefault()

        resetFocusSession()
      }
    }

    if (
      (e.key === "f" || e.key === "F") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      if ($("#search-palette") || $("#status-viewer")) return

      if (state.tab === "timer") {
        e.preventDefault()

        if (document.querySelector("#focus-view")) closeFocusView()
        else openFocusView()
      }
    }
  })
}

if (!window.__sfStatusBound) {
  window.__sfStatusBound = true

  document.addEventListener("click", (e) => {
    const t =
      e.target && e.target.closest
        ? e.target.closest("[data-status-open],[data-status-play]")
        : null

    if (t && !document.querySelector("#status-viewer"))
      import("./community.js")
        .then((m) => m.openStatus(t.dataset.statusOpen || undefined))
        .catch(() => {})
  })

  // Right-click your own status chip to delete it — no need to open the viewer.

  document.addEventListener("contextmenu", (e) => {
    const chip =
      e.target && e.target.closest
        ? e.target.closest("[data-story-view]")
        : null

    if (!chip || document.querySelector("#status-viewer")) return

    e.preventDefault()

    import("./community.js")
      .then((m) =>
        m.askDeleteStatus({
          id: chip.dataset.storyView,
          key: "story:" + chip.dataset.storyView,
          type: "story",
        }),
      )
      .catch(() => {})
  })
}

initTimerState()

initAudioState()

sanitizeState()

migrateSongs()

migrateOwned()

if (!state.deviceId) {
  state.deviceId = uid()

  save("sf-device", state.deviceId)
}

refreshServerTime()

// Stories pruning lives in the lazy community chunk.
import("./community.js").then((m) => m.pruneExpiredStories()).catch(() => {})

if (!state.entered) {
  renderLanding()

  preloadFeatureChunks()
} else {
  shell()

  preloadFeatureChunks()

  checkReminder()

  maybeWhatsNew()

  if (!state.toured)
    setTimeout(() => {
      if (state.entered && !state.toured)
        import("./account.js").then((m) => m.startTour()).catch(() => {})
    }, 1400)
}

try {
  if (sessionStorage.getItem("sf-wiped") === "1") {
    sessionStorage.removeItem("sf-wiped")

    setTimeout(() => notify("All your data was permanently deleted"), 600)
  }

  if (sessionStorage.getItem("sf-signed-out") === "1") {
    sessionStorage.removeItem("sf-signed-out")

    setTimeout(
      () =>
        notify("Signed out — your data is safe and returns when you sign in"),
      600,
    )
  }

  if (sessionStorage.getItem("sf-restored") === "1") {
    sessionStorage.removeItem("sf-restored")

    setTimeout(
      () => notify("Welcome back — your workspace is exactly as you left it"),
      600,
    )
  }
} catch {
  /* ignore */
}

// Warm the lazy route chunks once the shell is interactive — first visits
// then resolve instantly, and the network fetch happens off the critical
// path. (Literal specifiers only: Vite must see them to emit the chunks.)
function preloadFeatureChunks() {
  const kick = () => {
    // Fire the imports, then hand the service worker every hashed asset
    // the boot has touched — by then the four route chunks are listed too.
    Promise.allSettled([
      import("./techniques.js"),

      import("./community.js"),

      import("./books.js"),

      import("./store.js"),
    ]).then(() => sendPrecacheManifest())
  }

  if ("requestIdleCallback" in window)
    requestIdleCallback(kick, { timeout: 3000 })
  else setTimeout(kick, 1200)
}

// Hand the service worker the hashed asset URLs seen so far (lazy route
// chunks, CSS). It fetches and caches anything missing, so offline
// navigation between tabs works even for tabs never opened online.
function sendPrecacheManifest(worker) {
  if (!("serviceWorker" in navigator)) return

  // navigator.serviceWorker.controller is null on the very first load
  // (the worker is still installing) — callers can pass reg.active from
  // serviceWorker.ready instead so the manifest still reaches it.
  worker = worker || navigator.serviceWorker.controller

  if (!worker) return

  try {
    const urls = new Set()

    performance.getEntriesByType("resource").forEach((e) => {
      if (!e.name) return

      const path = new URL(e.name, location.href).pathname

      if (path.startsWith("/assets/")) urls.add(path)
    })

    if (!urls.size) return

    worker.postMessage({
      type: "PRECACHE",

      urls: [...urls],
    })
  } catch {
    /* ignore */
  }
}

/* PWA install lifecycle — supports Chrome/Edge (beforeinstallprompt),
   iOS (Add to Home Screen heuristic), and display-mode detection so the
   app can show the right message in the hero, header and Settings. */

const SF_INSTALL_EMAIL = "blaymiezahlemuelackah2008@gmail.com"

function isIosSafari() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.MSStream &&
    !!navigator.standalone === false
  )
}

function isSupportedBrowser() {
  // Chrome, Edge, Opera, Samsung Internet, Firefox (Gecko) expose the
  // beforeinstallprompt event. Safari does not.
  return "beforeinstallprompt" in window
}

function isInstalled() {
  // display-mode tells us whether the app is already running standalone.
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    return true
  if (window.matchMedia && window.matchMedia("(display-mode: window-controls-overlay)").matches)
    return true
  // iOS fallback: navigator.standalone is true after "Add to Home Screen".
  if (navigator.standalone) return true
  return false
}

function iosAhsHint() {
  if (!isIosSafari()) return null
  // Safari does not fire beforeinstallprompt, but the app is installable.
  return {
    platform: "ios",
    label: "Add to Home Screen",
    instructions: [
      "Tap the Share button (box with an up-arrow) in the browser bar.",
      "Scroll and tap Add to Home Screen.",
      "Confirm, then launch StudyFlow from your home screen.",
    ],
  }
}

window.__sfInstallState = window.__sfInstallState || {}
window.__sfInstallPrompt = null
window.sfInstall = null

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault()
  window.__sfInstallPrompt = e
  window.__sfInstallState.offered = true
  document.body.classList.add("pwa-installable")
  window.dispatchEvent(new CustomEvent("sf-install:offered"))
})

window.addEventListener("appinstalled", () => {
  window.__sfInstallState.installed = true
  window.__sfInstallState.offered = false
  window.__sfInstallPrompt = null
  document.body.classList.remove("pwa-installable")
  document.body.classList.add("pwa-installed")
  window.dispatchEvent(new CustomEvent("sf-install:installed"))
})

// Detect display-mode changes (e.g. user opens a fresh standalone session).
window.addEventListener("SFInstalled", () => {
  window.__sfInstallState.installed = true
  document.body.classList.add("pwa-installed")
  window.dispatchEvent(new CustomEvent("sf-install:installed"))
})

window.sfInstall = (() => {
  const prompt = window.__sfInstallPrompt
  if (!prompt) return
  prompt.prompt().then((choice) => {
    if (choice && choice.outcome === "accepted") {
      window.__sfInstallState.installed = true
      window.__sfInstallState.offered = false
      document.body.classList.remove("pwa-installable")
      document.body.classList.add("pwa-installed")
      window.dispatchEvent(new CustomEvent("sf-install:installed"))
      if (window.sfInstallDismissed === "dismissed") window.sfInstallDismissed = null
    } else if (choice && choice.outcome === "dismissed") {
      window.sfInstallDismissed = "dismissed"
      window.dispatchEvent(new CustomEvent("sf-install:dismissed"))
    }
  }).catch(() => {})
})

/**
 * Public API used by the landing page and Settings install card.
 * @returns {object} current install state snapshot
 */
export function sfInstallState() {
  return {
    supported: isSupportedBrowser(),
    ios: isIosSafari(),
    offered: !!window.__sfInstallState.offered,
    installed: isInstalled() || !!window.__sfInstallState.installed,
    hint: isInstalled() ? null : iosAHSHint(),
  }
}

/**
 * Ask the browser to install. On iOS this is a no-op — the caller should
 * instead surface the iOS instructions from sfInstallState().
 */
export function sfInstallNow() {
  if (navigator.standalone || isInstalled()) return
  if (window.sfInstall) window.sfInstall()
}


function showUpdateToast(reg) {
  if ($("#update-toast")) return

  const bar = document.createElement("div")

  bar.id = "update-toast"

  bar.innerHTML = `<span>${sicon("sparkle")} A fresh StudyFlow is ready</span><button type="button" data-update-now>Refresh</button>`

  document.body.append(bar)

  $("[data-update-now]", bar).onclick = () => {
    try {
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" })
    } catch {
      /* ignore */
    }

    setTimeout(() => location.reload(), 350)
  }
}

if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker

      .register("/sw.js")

      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing

          if (!worker) return

          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              showUpdateToast(reg)
            }
          })
        })
      })

      .catch(() => {})

    // Wait for an ACTIVE worker — on the first load the registration
    // promise can resolve while the worker is still installing.
    navigator.serviceWorker.ready

      .then((reg) => {
        // Deliver only once the controller IS the fresh active worker: on a
        // first-ever load the controller is still null, and right after a
        // version bump it is the outgoing worker whose cache gets purged.
        const deliver = () => {
          if (navigator.serviceWorker.controller === reg.active) {
            sendPrecacheManifest(reg.active)

            return true
          }

          return false
        }

        if (!deliver())
          navigator.serviceWorker.addEventListener("controllerchange", deliver)
      })

      .catch(() => {})
  })
}

getCurrentUser()

  .then(async (user) => {
    if (!user) return

    // Returning session (e.g. page refresh): if a pre-sign-out archive

    // exists, restore it and rebuild the app from storage; otherwise the

    // cloud snapshot fills in on this boot.

    if (restoreArchivedState(user.id)) {
      sessionStorage.setItem("sf-restored", "1")

      location.reload()

      return
    }

    // The INITIAL_SESSION auth echo can win the race and hydrate first —

    // skip the duplicate hydrate + shell that would land right behind it.

    if (
      state.user?.id === user.id &&
      (cloudStateSubscription || hydrationInFlight)
    ) {
      state.user = user

      return
    }

    state.user = user

    // Mark hydration in-flight so the INITIAL_SESSION auth echo (fired for

    // this same user) waits instead of running a second full hydrate + shell.

    hydrationInFlight = true

    await hydrateCloudState(user).finally(() => {
      hydrationInFlight = false
    })

    // Phase 3: tasks, notes and technique data follow the account.

    await pullProductivity()

    // Phase 4: authoritative coins, inventory, achievements, streak, boxes.

    pullRewards().catch(() => {})

    // Phase 5: music metadata + playlists follow the account (audio stays local).

    pullMusic().catch(() => {})

    // Phase 6: book metadata rows follow the account (files stay local).

    syncBooksLibrary().catch(() => {})
  })

  .catch(() => {
    /* offline or unreachable backend — local mode continues */
  })

onAuthStateChange((user) => {
  const expired = state.user && !user

  if (expired) {
    state.user = null

    cloudStateSubscription?.unsubscribe()

    setCloudSubscription(null)

    // Server-side session end (expired token, signed out elsewhere):

    // archive + purge so the guest screen shows none of the account's data.

    archiveStateForSignOut(null)

    haltPersist()

    sessionStorage.setItem("sf-signed-out", "1")

    location.reload()

    return
  }

  if (user) {
    // Token refreshes, tab re-focuses and Supabase's INITIAL_SESSION echo all

    // land here with the SAME user we already have. Re-hydrating on each one

    // rebuilds the entire app (scroll, focus, open menus gone) and feels like

    // the site "keeps refreshing". Hydrate only on a genuinely new session —

    // the user was absent, or it is a different account.

    const sameUser =
      state.user &&
      state.user.id === user.id &&
      (cloudStateSubscription || hydrationInFlight)

    if (sameUser) {
      state.user = user

      if (state.tab === "account" || state.tab === "settings") render()

      return
    }

    state.user = user

    hydrationInFlight = true

    // OAuth or cross-tab sign-in lands here: restore the archive first —

    // the reload it triggers rebuilds the app around the restored data.

    if (restoreArchivedState(user.id)) {
      sessionStorage.setItem("sf-restored", "1")

      location.reload()

      return
    }

    hydrateCloudState(user)

      .catch(() => {})

      .finally(() => {
        hydrationInFlight = false

        // Pulls wait for hydrate: racing them let an empty cloud snapshot

        // overwrite the just-hydrated (or guest) state mid-load.

        pullProductivity()

        pullRewards().catch(() => {})

        pullMusic().catch(() => {})

        syncBooksLibrary().catch(() => {})

        // Ring/accept inbox: subscribe once the session (and thus

        // state.user) is live so incoming 1:1 calls actually ring.

        import("./community.js")
          .then((m) => m.ensureIncomingCallSubscription())
          .catch(() => {})
      })
  }

  if (state.tab === "account" || state.tab === "settings") render()
})

export {
  searchHits,
  openSearch,
  closeSearch,
  collectSearch,
  renderSearchResults,
  runSearchHit,
  shell,
  bindShell,
  render,
  showUpdateToast,
}
