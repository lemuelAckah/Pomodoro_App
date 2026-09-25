/* audio.js — chimes, ambient engine, music library, sound studio */
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
  pushUserSettings,
  toast,
  addCoins,
  fmtClock,
  fmtSize,
  iconStar,
  bindFavorites,
  checkReminder,
  confirmBox,
  viewHead,
  updateBarPadding,
  makeDraggable,
  dragLock,
} from "./core.js"
import { renderFavorites } from "./techniques.js"
import {
  getPlayerState,
  savePlayerState,
  hydratePlayerFromStorage,
  toggleFavorite,
  isFavorite,
  getFavorites,
  getRecentlyPlayed,
  setQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  playNextInQueue,
  clearQueue,
  getQueue,
  getCurrentQueueTrack,
  toggleRepeat,
  toggleShuffle,
  setSpeed,
  cycleSpeed,
  setVolume,
  toggleMute,
  saveResumePos,
  listPlaylists,
  getPlaylist,
  createPlaylist,
  renamePlaylist,
  updatePlaylist,
  PLAYLIST_COVERS,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  moveInPlaylist,
  playlistSongs,
  purgeSongEverywhere,
} from "./audio-state.js"
import {
  setSourceResolver,
  setPlaybackListener,
  getPlaybackState,
  applyPlaybackSettings,
  startPlayback,
  pausePlayback,
  resumePlayback,
  togglePlayback,
  seekTo,
  seekPercent,
  advance,
  skipToNext,
  skipToPrevious,
  restartCurrent,
  playSongFromList,
  shuffleAll,
  clearNowPlaying,
} from "./audio-engine.js"
import {
  mirrorMusicTracks,
  mirrorPlaylists,
  deleteTrackEverywhere,
  deletePlaylistEverywhere,
} from "./services/music-sync.js"
const sounds = [
  ["rain", "Rain on Glass", sicon("rain"), "Nature"],
  ["forest", "Forest Canopy", sicon("tree"), "Nature"],
  ["ocean", "Ocean Waves", sicon("wave"), "Nature"],
  ["fire", "Quiet Fireplace", sicon("fire"), "Nature"],
  ["brown", "Brown Noise", sicon("noise"), "Noise"],
  ["pink", "Pink Noise", sicon("flower"), "Noise"],
  ["white", "White Noise", sicon("noise"), "Noise"],
  ["alpha", "Alpha Waves", sicon("lotus"), "Binaural"],
  ["gamma", "Gamma Waves", sicon("bolt"), "Binaural"],
]

let ambientContext

let ambientMaster

let noiseBufs

let ambientLayers = {}

let mixDucked = false

const DUCK_LEVEL = 0.12

let chimeCtx = null

function warmAudio() {
  try {
    if (!chimeCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext
      if (!Ctor) return
      chimeCtx = new Ctor()
    }
    if (chimeCtx.state === "suspended") chimeCtx.resume()
  } catch {
    /* audio unavailable */
  }
}

const CHIMES = {
  arpeggio: {
    label: "Arpeggio",
    focus: [523.25, 659.25, 783.99, 1046.5],
    break: [659.25, 523.25],
  },
  bells: {
    label: "Soft bells",
    focus: [880, 1174.66, 1567.98],
    break: [783.99, 587.33],
  },
  chirp: {
    label: "Bright chirp",
    focus: [392, 523.25, 659.25],
    break: [440, 349.23],
  },
}

function playChime(kind, style, vol) {
  try {
    warmAudio()
    if (!chimeCtx) return
    style = style || state.chimeStyle || "arpeggio"
    vol = vol ?? state.chimeVolume ?? 0.8
    if (!(vol > 0)) return
    const set = CHIMES[style] || CHIMES.arpeggio
    const notes = set[kind] || set.focus
    const peak = Math.min(0.4, 0.28 * vol + 0.02)
    const startAt = chimeCtx.currentTime + 0.02
    notes.forEach((freq, i) => {
      const osc = chimeCtx.createOscillator()
      const gain = chimeCtx.createGain()
      osc.connect(gain)
      gain.connect(chimeCtx.destination)
      osc.type = "sine"
      osc.frequency.value = freq
      const t = startAt + i * 0.16
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      osc.start(t)
      osc.stop(t + 0.55)
    })
  } catch {
    /* silent */
  }
}

if (!window.__sfReminderLoop) {
  window.__sfReminderLoop = setInterval(checkReminder, 30000)
}

export function initAudioState() {
  setPlaybackListener(() => {
    // Engine-driven changes (auto-advance, play/pause, errors, stop) keep the
    // now-playing bar and the song rows truthful with TARGETED updates — never
    // a full renderSounds() rebuild, which would nuke search focus, scroll,
    // open menus, in-progress playlist forms and active drags mid-interaction.
    renderNowPlaying()
    if (state.tab === "sounds") {
      renderSongList()
      renderPlaylists()
    }
  })
  setSourceResolver(async (songId) => {
    const blob = await songBlobGet(songId)
    if (!blob) return null
    const song = (state.songs || []).find((s) => s.id === songId)
    if (!song) return null
    // Always mint a fresh object URL: a blob: URL saved during an earlier
    // session died when that page closed, and cached ones may have been
    // revoked. Reusing them makes the audio element fail to load.
    return songObjectUrl(songId, blob)
  })
  repairSongLibrary()
  if (!state.soundMix) state.soundMix = {}
  if (!Object.keys(state.soundMix).length && state.activeSound) {
    state.soundMix = { [state.activeSound]: 0.7 }
    persist()
  }
  if (state.running && state.linkSound && Object.keys(state.soundMix).length) {
    try {
      applyLinkToTimer()
    } catch {
      /* audio locked until first gesture */
    }
  }
  hydratePlayerFromStorage()
  applyPlaybackSettings()
  // Persist the live position on unload so resume-after-pause can pick up
  // where playback left off even across a reload or crash.
  window.addEventListener("beforeunload", () => {
    try {
      const st = getPlaybackState()
      if (
        st.current &&
        st.playing &&
        Number.isFinite(st.currentTime) &&
        st.currentTime > 1
      ) {
        saveResumePos(st.current.id, st.currentTime)
      }
    } catch {
      /* best-effort only */
    }
  })
}

// Session-only: the mini-player close hides every bar (audio is paused).
// Reopening the Sounds section restores the bar safely. Never persisted,
// so a reload always restores the player from queue/track state.
let playerClosed = false

export function dismissPlayer() {
  endMiniDrag()
  try {
    pausePlayback()
  } catch {
    /* already stopped */
  }
  playerClosed = true
  state.playerHidden = false
  renderNowPlaying()
}

function restorePlayerBars() {
  if (!playerClosed) return
  playerClosed = false
  renderNowPlaying()
}

const resumeLiveAudio = () => {
  try {
    if (ambientContext && ambientContext.state === "suspended")
      ambientContext.resume()
  } catch {
    /* ignore */
  }
  try {
    warmAudio()
  } catch {
    /* ignore */
  }
}

if (!window.__sfAudioResume) {
  window.__sfAudioResume = true
  window.addEventListener("pointerdown", resumeLiveAudio)
  window.addEventListener("keydown", resumeLiveAudio)
}

function mixerMarkup() {
  const entries = Object.entries(state.soundMix || {})
  const nameOf = (id) => {
    const s = sounds.find((x) => x[0] === id)
    return s ? `${s[2]} ${s[1]}` : id
  }
  const masterPct = Math.round((state.soundVolume ?? 0.8) * 100)
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Your mix</h2><span class="tag">layered</span></div><p class="muted">Tap ${sicon("play")} on any sound below to layer it in. Volumes blend live.</p><div class="mix-row"><span class="muted" style="min-width:56px">Master</span><input type="range" min="0" max="100" value="${masterPct}" data-master-vol aria-label="Master volume"><span class="mix-pct" data-master-pct>${masterPct}%</span></div><div id="mix-layers">${
    entries.length
      ? entries
          .map(
            ([id, vol]) =>
              `<div class="mix-row"><span style="min-width:56px">${nameOf(id)}</span><input type="range" min="0" max="100" value="${Math.round(vol * 100)}" data-layer-vol="${id}" aria-label="${esc(id)} volume"><span class="mix-pct" data-layer-pct="${id}">${Math.round(vol * 100)}%</span><button type="button" class="ghost" data-layer-remove="${id}" title="Remove">×</button></div>`,
          )
          .join("")
      : '<p class="muted" style="margin-top:10px">Quiet for now — start a sound below.</p>'
  }</div><label class="toggle-row" style="margin-top:12px"><span><strong>Link to timer</strong><small>Auto-start the mix with focus · fade to a hush on breaks</small></span><input type="checkbox" id="link-sound"${
    state.linkSound ? " checked" : ""
  }></label>${
    entries.length
      ? '<button type="button" class="ghost" id="stop-mix" style="margin-top:10px">Stop everything</button>'
      : ""
  }</div>`
}

function bindMixer(t) {
  const master = $("[data-master-vol]", t)
  if (master) {
    master.oninput = () => {
      setMasterVolume(master.value / 100)
      const pct = $("[data-master-pct]", t)
      if (pct) pct.textContent = `${master.value}%`
    }
    master.onchange = () => {
      persist()
      pushUserSettings()
    }
  }
  $$("[data-layer-vol]", t).forEach((slider) => {
    slider.oninput = () => {
      const id = slider.dataset.layerVol
      const v = slider.value / 100
      state.soundMix[id] = v
      const layer = ambientLayers[id]
      if (layer) {
        layer.vol = v
        applyLayerGain(id)
      }
      const pct = $(`[data-layer-pct="${id}"]`, t)
      if (pct) pct.textContent = `${slider.value}%`
    }
    slider.onchange = () => {
      persist()
      pushUserSettings()
    }
  })
  $$("[data-layer-remove]", t).forEach(
    (b) =>
      (b.onclick = () => {
        stopLayer(b.dataset.layerRemove)
        delete state.soundMix[b.dataset.layerRemove]
        persist()
        pushUserSettings()
        renderSounds()
      }),
  )
  const link = $("#link-sound", t)
  if (link)
    link.onchange = () => {
      state.linkSound = link.checked
      persist()
      applyLinkToTimer()
      toast(
        state.linkSound ? "Soundscape linked to your timer" : "Timer link off",
      )
    }
  const stopAll = $("#stop-mix", t)
  if (stopAll)
    stopAll.onclick = () => {
      stopAllLayers()
      state.soundMix = {}
      persist()
      pushUserSettings()
      renderSounds()
    }
}

const songBlobs = new Map()

const songUrls = new Map()

let reimportTargetId = null

let songDbPromise = null

async function clearSongDatabase() {
  try {
    const db = await songDb()
    if (db) db.close()
  } catch {
    /* ignore */
  }
  songDbPromise = null
  if (typeof indexedDB === "undefined") return true
  await new Promise((res, rej) => {
    try {
      const req = indexedDB.deleteDatabase("studyflow")
      req.onsuccess = () => res(true)
      req.onerror = () => rej(req.error)
      req.onblocked = () => res(true)
    } catch (e) {
      rej(e)
    }
  })
  return true
}
function songDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  if (!songDbPromise) {
    songDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open("studyflow", 1)
        req.onupgradeneeded = () => req.result.createObjectStore("songs")
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return songDbPromise
}

// Throws on failure so callers (e.g. import) can tell the user instead of
// silently keeping a memory-only copy that vanishes on the next page load.
async function songBlobPut(id, blob) {
  songBlobs.set(id, blob)
  const db = await songDb()
  if (!db) return // no IndexedDB here: memory-only, works until the page closes
  await new Promise((res, rej) => {
    try {
      const tx = db.transaction("songs", "readwrite")
      tx.objectStore("songs").put(blob, id)
      tx.oncomplete = () => res(true)
      tx.onerror = () => rej(tx.error || new Error("IndexedDB write failed"))
      tx.onabort = () => rej(tx.error || new Error("IndexedDB write aborted"))
    } catch (e) {
      rej(e)
    }
  })
}

async function songBlobGet(id) {
  if (songBlobs.has(id)) return songBlobs.get(id)
  try {
    const db = await songDb()
    if (!db) return null
    const blob = await new Promise((res, rej) => {
      const tx = db.transaction("songs", "readonly")
      const rq = tx.objectStore("songs").get(id)
      rq.onsuccess = () => res(rq.result || null)
      rq.onerror = () => rej(rq.error)
    })
    if (blob) songBlobs.set(id, blob)
    return blob
  } catch {
    return null
  }
}

async function songBlobDelete(id) {
  songBlobs.delete(id)
  const url = songUrls.get(id)
  if (url) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
    songUrls.delete(id)
  }
  try {
    const db = await songDb()
    if (!db) return
    await new Promise((res) => {
      const tx = db.transaction("songs", "readwrite")
      tx.objectStore("songs").delete(id)
      tx.oncomplete = () => res(true)
      tx.onerror = () => res(false)
    })
  } catch {
    /* ignore */
  }
}

// Mints a fresh, valid object URL every call and retires the previous one for
// the same id — callers can never receive a stale or revoked URL.
function songObjectUrl(id, blob) {
  const stale = songUrls.get(id)
  if (stale) {
    try {
      URL.revokeObjectURL(stale)
    } catch {
      /* ignore */
    }
    songUrls.delete(id)
  }
  const url = URL.createObjectURL(blob)
  songUrls.set(id, url)
  return url
}

async function songHasAudio(id) {
  return Boolean(await songBlobGet(id))
}

// Ask the browser to keep our IndexedDB audio out of eviction. Without this,
// long-idle libraries can lose audio data under storage pressure.
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persisted && navigator.storage?.persist) {
      if (!(await navigator.storage.persisted()))
        await navigator.storage.persist()
    }
  } catch {
    /* not supported — best-effort only */
  }
}

// Boot-time repair: blob: URLs and "playing" flags from a previous session are
// meaningless now, and the browser may have evicted some audio. Clean up so
// every track either plays from IndexedDB or is visibly marked as missing.
async function repairSongLibrary() {
  requestPersistentStorage()
  let changed = false
  for (const s of state.songs || []) {
    if (s.blobUrl) {
      delete s.blobUrl
      changed = true
    }
    if (s.playing) {
      s.playing = false
      changed = true
    }
    if (await songHasAudio(s.id)) {
      if (s.missing) {
        delete s.missing
        changed = true
      }
    } else if (!s.missing) {
      s.missing = true
      changed = true
    }
  }
  if (changed) {
    persist()
    if (state.tab === "sounds") renderSongList()
  }
}

async function migrateSongs() {
  let changed = false
  for (const s of state.songs || []) {
    if (s.url && String(s.url).startsWith("data:")) {
      try {
        const blob = await fetch(s.url).then((r) => r.blob())
        await songBlobPut(s.id, blob)
        if (s.missing) {
          delete s.missing
        }
      } catch {
        /* keep metadata; audio re-importable */
      }
      delete s.url
      changed = true
    }
    // Backfill the fields newer code relies on (dupe detection, cloud merge).
    if (!s.fingerprint && (s.fileName || s.name)) {
      s.fingerprint =
        `${s.fileName || s.name}|${s.size || 0}|${s.type || ""}`.slice(0, 160)
      changed = true
    }
    if (s.title == null && s.name) {
      s.title = s.name
      changed = true
    }
    if (!s.created) {
      s.created = Date.now()
      changed = true
    }
    if (!s.updated) {
      s.updated = s.created
      changed = true
    }
  }
  if (changed) persist()
}

const AUDIO_EXTS = [
  "mp3",
  "wav",
  "ogg",
  "oga",
  "m4a",
  "aac",
  "flac",
  "opus",
  "webm",
  "mp4",
]

function validateAudioFile(file) {
  if (!file) return "No file chosen"
  const ext = (
    String(file.name || "")
      .split(".")
      .pop() || ""
  ).toLowerCase()
  const okType =
    String(file.type || "").startsWith("audio/") ||
    AUDIO_EXTS.includes(ext) ||
    String(file.type || "").startsWith("video/mp4")
  if (!okType)
    return `"${file.name}" doesn't look like audio — try MP3, WAV or OGG`
  if (!file.size) return `"${file.name}" is empty`
  if (file.size > 30 * 1024 * 1024)
    return `"${file.name}" is over 30 MB — pick a smaller file`
  return ""
}

const MAX_SONGS = 500

function cleanSongName(name) {
  return String(name || "Untitled track")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .slice(0, 80)
}

function songFingerprint(file) {
  return `${file.name || ""}|${file.size || 0}|${file.type || ""}`.slice(0, 160)
}

function findDuplicateSong(file) {
  const fp = songFingerprint(file)
  const clean = cleanSongName(file.name).toLowerCase()
  return (
    (state.songs || []).find(
      (s) =>
        (s.fingerprint && s.fingerprint === fp) ||
        ((s.fileName || s.name || "").toLowerCase() ===
          String(file.name || "").toLowerCase() &&
          Number(s.size || 0) === Number(file.size || 0)),
    ) || null
  )
}

async function playSong(id) {
  const song = (state.songs || []).find((s) => s.id === id)
  if (!song) return
  const blob = await songBlobGet(id)
  if (!blob) {
    song.missing = true
    persist()
    renderSounds()
    toast(
      "This track's audio was removed by the browser to free space — re-import it",
    )
    return
  }
  if (song.missing) {
    delete song.missing
    persist()
    renderSounds()
  }
  song.blobUrl = songObjectUrl(id, blob)
  playSongFromList(id)
}

function toggleSong(id) {
  const song = (state.songs || []).find((s) => s.id === id)
  if (!song) return
  const st = getPlaybackState()
  if (st.current && st.current.id === id) {
    // Resume keeps the position; resumePlayback also handles the fresh-session
    // case where no source is loaded yet (it restarts the track).
    if (st.playing) pausePlayback()
    else resumePlayback()
  } else {
    playSong(id)
  }
}

function resumeTrack(song) {
  resumePlayback()
}

function advanceTrack(dir) {
  advance(dir)
}

function stopPlayback() {
  clearNowPlaying()
}

function probeDuration(id) {
  songBlobGet(id).then((blob) => {
    if (!blob) return
    try {
      const url = URL.createObjectURL(blob)
      const probe = new Audio()
      probe.preload = "metadata"
      probe.onloadedmetadata = () => {
        const song = state.songs.find((s) => s.id === id)
        if (song && probe.duration && Number.isFinite(probe.duration)) {
          song.duration = Math.round(probe.duration)
          song.updated = Date.now()
          persist()
          mirrorMusicTracks()
          if (state.tab === "sounds") renderSounds()
          renderNowPlaying()
        }
        URL.revokeObjectURL(url)
      }
      probe.onerror = () => URL.revokeObjectURL(url)
      probe.src = url
    } catch {
      /* ignore */
    }
  })
}

function songFormat(s) {
  const fromType =
    s.type && s.type.startsWith("audio/")
      ? s.type.slice(6).toUpperCase().split(";")[0]
      : ""
  if (fromType) return fromType === "MPEG" ? "MP3" : fromType
  const ext = (
    String(s.name || "")
      .split(".")
      .pop() || ""
  ).toUpperCase()
  return ext && ext !== String(s.name || "").toUpperCase() ? ext : ""
}

function renderNowPlaying() {
  let bar = $("#now-playing")
  let mini = $("#np-mini")
  const st = getPlaybackState()
  const track = st.current
  if (!track || playerClosed) {
    bar?.remove()
    mini?.remove()
    updateBarPadding()
    return
  }
  if (state.playerHidden) {
    bar?.remove()
    renderMiniPlayer(track, st)
    return
  }
  mini?.remove()
  const p = getPlayerState()
  const paused = !st.playing
  const pct =
    st.duration > 0 ? Math.round((st.currentTime / st.duration) * 1000) : 0
  const repeatIcon =
    p.repeat === "one"
      ? sicon("repeat-one")
      : p.repeat === "all"
        ? sicon("repeat")
        : sicon("repeat")
  const repeatLabel =
    p.repeat === "one"
      ? "Repeat One"
      : p.repeat === "all"
        ? "Repeat All"
        : "Repeat Off"
  const favIcon = isFavorite(track.id) ? "heart-filled" : "heart"

  if (!bar) {
    bar = document.createElement("div")
    bar.id = "now-playing"
    document.body.append(bar)
  }
  bar.classList.remove("np-shuffle-on", "np-repeat-on")
  bar.innerHTML = `
    <div class="np-controls">
      <button type="button" class="np-btn" data-np-prev title="Previous">${sicon("skip-back")}</button>
      <button type="button" class="np-btn np-main" data-np-toggle title="${
        paused ? "Play" : "Pause"
      }">${paused ? sicon("play") : sicon("pause")}</button>
      <button type="button" class="np-btn" data-np-next title="Next">${sicon("skip-forward")}</button>
    </div>
    <div class="np-progress">
      <span class="np-time" data-np-current>${fmtClock(st.currentTime)}</span>
      <input class="np-seek" data-np-seek type="range" min="0" max="1000" value="${pct}" aria-label="Seek">
      <span class="np-time" data-np-duration>${fmtClock(st.duration)}</span>
    </div>
    <div class="np-meta">
      <span class="np-track" title="${esc(track.title)}">${esc(track.title)}</span>
      ${
        track.artist
          ? `<span class="np-artist">${esc(track.artist)}</span>`
          : ""
      }
    </div>
    <div class="np-extras">
      <button type="button" class="np-btn${
        isFavorite(track.id) ? " liked" : ""
      }" data-np-fav title="${
        isFavorite(track.id) ? "Unlike" : "Like"
      }" aria-pressed="${isFavorite(track.id)}">${sicon(favIcon)}</button>
      <button type="button" class="np-btn" data-np-repeat title="${repeatLabel}">${repeatIcon}</button>
      <button type="button" class="np-btn" data-np-shuffle title="${
        p.shuffle ? "Shuffle On" : "Shuffle Off"
      }">${sicon("shuffle")}</button>
      <button type="button" class="np-btn" data-np-speed title="Speed ${p.speed}x">${sicon("timer")}</button>
      <div class="np-vol-wrap">
        <button type="button" class="np-btn" data-np-mute title="Mute">${sicon(p.muted ? "volume-x" : "volume-2")}</button>
        <input class="np-vol" data-np-vol type="range" min="0" max="100" value="${Math.round(p.volume * 100)}" aria-label="Volume">
      </div>
      <button type="button" class="np-btn" data-np-queue title="Queue">${sicon("list")}</button>
      <button type="button" class="np-btn np-close" data-np-close title="Hide player">${sicon("x")}</button>
    </div>
  `
  if (p.shuffle) bar.classList.add("np-shuffle-on")
  if (p.repeat !== "off") bar.classList.add("np-repeat-on")
  bindNowPlaying(bar)
  // Whole bar is the handle (buttons/sliders opt out via the closest() guard
  // in makeDraggable); binding is idempotent across re-renders.
  makeDraggable(bar, bar)
  updateBarPadding()
}

const MINI_POS_KEY = "sf-mini-pos"
const MINI_DRAG_TOLERANCE = 6

let miniDrag = null // active drag session or null
let suppressMiniClick = false

function getMiniPos() {
  try {
    const raw = localStorage.getItem(MINI_POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!Number.isFinite(+p.left) || !Number.isFinite(+p.top)) return null
    return {
      left: Math.max(0, Math.min(window.innerWidth - 80, +p.left)),
      top: Math.max(0, Math.min(window.innerHeight - 80, +p.top)),
    }
  } catch {
    return null
  }
}

function saveMiniPos(left, top) {
  try {
    localStorage.setItem(MINI_POS_KEY, JSON.stringify({ left, top }))
  } catch {
    /* private mode etc. — position just won't persist */
  }
}

function applyMiniPos(mini) {
  const pos = getMiniPos()
  if (!pos) return
  mini.style.left = pos.left + "px"
  mini.style.top = pos.top + "px"
  mini.style.right = "auto"
  mini.style.bottom = "auto"
}

function endMiniDrag() {
  if (!miniDrag) return false
  const { el, pid, moved } = miniDrag
  miniDrag = null
  try {
    el.style.cursor = ""
    el.classList.remove("drag-active")
    if (pid !== null && el.hasPointerCapture?.(pid))
      el.releasePointerCapture(pid)
  } catch {
    /* ignore */
  }
  dragLock(false)
  if (moved) {
    // A real drag, not a tap: swallow the click that pointerup would fire.
    suppressMiniClick = true
    setTimeout(() => {
      suppressMiniClick = false
    }, 0)
  }
  return moved
}

function startMiniDrag(e, el) {
  if (e.button !== undefined && e.button !== 0) return
  // Single-touch gesture only: a second finger mid-drag must not hijack (and
  // leak) the first session.
  if (miniDrag) return
  // Interactive descendants handle themselves — never start a move from them.
  if (e.target.closest?.("button, a, input, textarea, select")) return
  e.preventDefault()
  const pid = e.pointerId
  miniDrag = {
    el,
    pid,
    moved: false,
    startX: e.clientX,
    startY: e.clientY,
    origX: el.offsetLeft,
    origY: el.offsetTop,
  }
  el.style.cursor = "grabbing"
  el.classList.add("drag-active")
  dragLock(true)
  try {
    el.setPointerCapture?.(pid)
  } catch {
    /* ignore */
  }
  const onMove = (ev) => {
    const s = miniDrag
    if (!s || ev.pointerId !== s.pid) return
    if (
      Math.abs(ev.clientX - s.startX) + Math.abs(ev.clientY - s.startY) >
      MINI_DRAG_TOLERANCE
    ) {
      s.moved = true
    }
    if (!s.moved) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    s.el.style.left =
      Math.max(
        0,
        Math.min(vw - s.el.offsetWidth, s.origX + ev.clientX - s.startX),
      ) + "px"
    s.el.style.top =
      Math.max(
        0,
        Math.min(vh - s.el.offsetHeight, s.origY + ev.clientY - s.startY),
      ) + "px"
    s.el.style.right = "auto"
    s.el.style.bottom = "auto"
  }
  const onUp = (ev) => {
    if (
      miniDrag &&
      ev &&
      ev.pointerId !== undefined &&
      ev.pointerId !== miniDrag.pid
    )
      return
    document.removeEventListener("pointermove", onMove)
    document.removeEventListener("pointerup", onUp)
    document.removeEventListener("pointercancel", onUp)
    const s = miniDrag
    endMiniDrag()
    if (s && s.moved) {
      try {
        saveMiniPos(
          parseFloat(s.el.style.left) || 0,
          parseFloat(s.el.style.top) || 0,
        )
      } catch {
        /* ignore */
      }
    }
  }
  document.addEventListener("pointermove", onMove, { passive: false })
  document.addEventListener("pointerup", onUp)
  document.addEventListener("pointercancel", onUp)
}

function bindMiniDrag(mini) {
  // Bound once per element creation (not per render) — no listener pile-up.
  if (mini.dataset.miniDragBound) return
  mini.dataset.miniDragBound = "1"
  mini.addEventListener("pointerdown", (e) => startMiniDrag(e, mini))
  // Swallow the click that follows a real drag so buttons under the release
  // point never fire accidentally.
  mini.addEventListener(
    "click",
    (e) => {
      if (suppressMiniClick) {
        e.stopPropagation()
        e.preventDefault()
        suppressMiniClick = false
      }
    },
    true,
  )
  mini.addEventListener("lostpointercapture", () => {
    if (miniDrag && miniDrag.el === mini) endMiniDrag()
  })
}

function renderMiniPlayer(track, st) {
  let mini = $("#np-mini")
  if (!mini) {
    mini = document.createElement("div")
    mini.id = "np-mini"
    mini.className = "np-mini-card"
    document.body.append(mini)
    applyMiniPos(mini)
    bindMiniDrag(mini)
  }
  const p = getPlayerState()
  const paused = !st.playing
  // Never rebuild mid-drag: the gesture owns the element until release.
  // Update only the live fields instead.
  if (miniDrag && miniDrag.el === mini) {
    const tgl = mini.querySelector("[data-np-mini-toggle]")
    if (tgl) {
      tgl.innerHTML = paused ? sicon("play") : sicon("pause")
      tgl.title = paused ? "Play" : "Pause"
    }
    updateMiniProgress(mini, st)
    return
  }
  const pct =
    st.duration > 0 ? Math.round((st.currentTime / st.duration) * 1000) : 0
  mini.innerHTML = `
    <div class="np-mini-top" data-mini-handle>
      <span class="np-mini-art" aria-hidden="true">${sicon("music")}</span>
      <span class="np-mini-meta" data-mini-handle>
        <strong class="np-mini-title" title="${esc(track.title)}">${esc(track.title)}</strong>
        ${
          track.artist
            ? `<small class="np-mini-artist">${esc(track.artist)}</small>`
            : ""
        }
      </span>
      <button type="button" class="np-mini-btn" data-np-mini-open title="Open full player">${sicon("expand")}</button>
      <button type="button" class="np-mini-btn np-mini-close" data-np-mini-close title="Close player (pauses)">${sicon("x")}</button>
    </div>
    <div class="np-mini-progress">
      <span class="np-mini-time" data-np-mini-current>${fmtClock(st.currentTime)}</span>
      <input class="np-mini-seek" data-np-mini-seek type="range" min="0" max="1000" value="${pct}" aria-label="Seek">
      <span class="np-mini-time" data-np-mini-duration>${fmtClock(st.duration)}</span>
    </div>
    <div class="np-mini-controls">
      <button type="button" class="np-mini-btn" data-np-mini-shuffle title="${
        p.shuffle ? "Shuffle On" : "Shuffle Off"
      }">${sicon("shuffle")}</button>
      <button type="button" class="np-mini-btn" data-np-mini-prev title="Previous">${sicon("skip-back")}</button>
      <button type="button" class="np-mini-btn np-mini-main" data-np-mini-toggle title="${
        paused ? "Play" : "Pause"
      }">${paused ? sicon("play") : sicon("pause")}</button>
      <button type="button" class="np-mini-btn" data-np-mini-next title="Next">${sicon("skip-forward")}</button>
      <button type="button" class="np-mini-btn" data-np-mini-repeat title="${
        p.repeat === "one"
          ? "Repeat One"
          : p.repeat === "all"
            ? "Repeat All"
            : "Repeat Off"
      }">${p.repeat === "one" ? sicon("repeat-one") : sicon("repeat")}</button>
      <button type="button" class="np-mini-btn" data-np-mini-mute title="${
        p.muted ? "Unmute" : "Mute"
      }">${sicon(p.muted ? "volume-x" : "volume-2")}</button>
      <input class="np-mini-vol" data-np-mini-vol type="range" min="0" max="100" value="${Math.round(p.volume * 100)}" aria-label="Volume">
    </div>
  `
  mini.classList.toggle("np-shuffle-on", Boolean(p.shuffle))
  mini.classList.toggle("np-repeat-on", p.repeat !== "off")
  $("[data-np-mini-toggle]", mini).onclick = () => {
    const s = getPlaybackState()
    if (s.playing) pausePlayback()
    else resumePlayback()
  }
  $("[data-np-mini-prev]", mini).onclick = () => skipToPrevious()
  $("[data-np-mini-next]", mini).onclick = () => skipToNext()
  $("[data-np-mini-open]", mini).onclick = () => {
    state.playerHidden = false
    renderNowPlaying()
  }
  $("[data-np-mini-close]", mini).onclick = () => dismissPlayer()
  $("[data-np-mini-shuffle]", mini).onclick = () => {
    toggleShuffle()
    renderNowPlaying()
  }
  $("[data-np-mini-repeat]", mini).onclick = () => {
    toggleRepeat()
    renderNowPlaying()
  }
  $("[data-np-mini-mute]", mini).onclick = () => {
    toggleMute()
    applyPlaybackSettings()
    renderNowPlaying()
  }
  const seek = $("[data-np-mini-seek]", mini)
  if (seek) {
    seek.oninput = () => {
      seek.dataset.scrub = "1"
    }
    seek.onchange = () => {
      delete seek.dataset.scrub
      seekPercent(seek.value / 10)
    }
  }
  const vol = $("[data-np-mini-vol]", mini)
  if (vol) {
    vol.oninput = () => {
      setVolume(vol.value / 100)
      applyPlaybackSettings()
    }
    vol.onchange = () => persist()
  }
  updateBarPadding()
}

function updateMiniProgress(mini, st) {
  const root = mini || $("#np-mini")
  if (!root) return
  const cur = root.querySelector("[data-np-mini-current]")
  if (cur) cur.textContent = fmtClock(st.currentTime)
  const dur = root.querySelector("[data-np-mini-duration]")
  if (dur) dur.textContent = fmtClock(st.duration)
  const seek = root.querySelector("[data-np-mini-seek]")
  if (seek && !seek.dataset.scrub && st.duration > 0) {
    seek.value = Math.round((st.currentTime / st.duration) * 1000)
  }
}

function bindNowPlaying(bar) {
  $("[data-np-toggle]", bar).onclick = () => {
    const st = getPlaybackState()
    if (st.playing) pausePlayback()
    else resumePlayback()
  }
  $("[data-np-prev]", bar).onclick = () => skipToPrevious()
  $("[data-np-next]", bar).onclick = () => skipToNext()
  $("[data-np-fav]", bar).onclick = (e) => {
    const st = getPlaybackState()
    if (st.current) toggleFavorite(st.current.id)
    renderNowPlaying()
  }
  $("[data-np-repeat]", bar).onclick = () => {
    toggleRepeat()
    renderNowPlaying()
  }
  $("[data-np-shuffle]", bar).onclick = () => {
    toggleShuffle()
    renderNowPlaying()
  }
  $("[data-np-speed]", bar).onclick = () => {
    cycleSpeed()
    applyPlaybackSettings()
    renderNowPlaying()
  }
  $("[data-np-mute]", bar).onclick = () => {
    toggleMute()
    applyPlaybackSettings()
    renderNowPlaying()
  }
  $("[data-np-queue]", bar).onclick = () => openQueueModal()
  $("[data-np-close]", bar).onclick = () => {
    state.playerHidden = true
    renderNowPlaying()
  }
  const seek = $("[data-np-seek]", bar)
  if (seek) {
    seek.oninput = () => {
      seek.dataset.scrub = "1"
    }
    seek.onchange = () => {
      delete seek.dataset.scrub
      seekPercent(seek.value / 10)
    }
  }
  const vol = $("[data-np-vol]", bar)
  if (vol) {
    vol.oninput = () => {
      setVolume(vol.value / 100)
      applyPlaybackSettings()
    }
    vol.onchange = () => persist()
  }
}

function openQueueModal() {
  document.querySelectorAll("[data-queue-backdrop]").forEach((m) => m.remove())
  const st = getPlaybackState()
  const p = getPlayerState()
  const items = st.queue
  let html = `<div class="modal-backdrop" data-queue-backdrop style="z-index:60"><div class="queue-modal"><div class="queue-head"><h2>Up Next</h2><div style="display:flex;gap:8px"><button type="button" class="ghost" data-queue-clear${
    items.length ? "" : " disabled"
  }>Clear</button><button type="button" class="ghost" data-queue-close>${sicon("x")}</button></div></div>`
  if (!items.length) {
    html += `<div class="queue-empty"><p class="muted">Queue is empty — your library keeps playing on loop.</p></div>`
  } else {
    html += `<div class="queue-list">`
    items.forEach((song, i) => {
      const isCurrent = i === p.index
      const played = p.index >= 0 && i < p.index
      const art = song.title || song.name || "Untitled"
      html += `<div class="queue-item${isCurrent ? " current" : ""}${
        played ? " played" : ""
      }" data-queue-item="${i}" data-queue-play="${i}" draggable="true">
        <span class="queue-grip" data-queue-grip title="Drag to reorder">${sicon("grip-vertical")}</span>
        <div class="queue-info"><strong>${esc(art)}</strong><small>${
          song.artist ? esc(song.artist) + " · " : ""
        }${song.duration ? fmtClock(song.duration) : "--:--"}</small></div>
        ${
          isCurrent ? `<span class="tag" style="font-size:10px">Now</span>` : ""
        }
        <span class="queue-move">
          <button type="button" class="queue-shift" data-queue-up="${i}" title="Move up" aria-label="Move up"${
            i === 0 ? " disabled" : ""
          }>${sicon("chevron-up")}</button>
          <button type="button" class="queue-shift" data-queue-down="${i}" title="Move down" aria-label="Move down"${
            i === items.length - 1 ? " disabled" : ""
          }>${sicon("chevron-down")}</button>
        </span>
        <button type="button" class="queue-remove" data-queue-rm="${i}" title="Remove">${sicon("x")}</button>
      </div>`
    })
    html += `</div>`
    html += `<p class="muted" style="margin:6px 16px 0;font-size:11px">Drag rows (or use the arrows) to rearrange the order.</p>`
  }
  html += `<div class="queue-actions"><span class="muted" style="font-size:12px">${items.length} song${
    items.length !== 1 ? "s" : ""
  }${p.shuffle ? " · shuffle on" : ""}${
    p.repeat !== "off" ? " · repeat " + p.repeat : ""
  }</span></div></div></div>`
  const backdrop = document.createElement("div")
  backdrop.innerHTML = html
  const el = backdrop.firstElementChild
  document.body.append(el)
  bindQueueModal(el)
}

function bindQueueModal(el) {
  // el IS the [data-queue-backdrop] element — querySelector only sees
  // descendants, so the old code got null here and threw, leaving every
  // control after the close button permanently dead.
  el.onclick = (e) => {
    if (e.target === el) el.remove()
  }
  const close = el.querySelector("[data-queue-close]")
  if (close) close.onclick = () => el.remove()
  const clear = el.querySelector("[data-queue-clear]")
  if (clear)
    clear.onclick = () => {
      // Keep the music playing: the current track finishes, then the whole
      // library loops on as the queue (handled in engine advance()).
      clearQueue()
      el.remove()
      renderNowPlaying()
      if (state.tab === "sounds") renderSounds()
    }
  el.querySelectorAll("[data-queue-play]").forEach((btn) => {
    btn.onclick = (e) => {
      if (
        e.target.closest(
          "[data-queue-rm], [data-queue-up], [data-queue-down], [data-queue-grip]",
        )
      )
        return
      const idx = parseInt(btn.dataset.queuePlay, 10)
      const p = getPlayerState()
      if (p.queue[idx]) {
        savePlayerState({ index: idx })
        startPlayback(p.queue[idx], { startInQueue: false })
        el.remove()
      }
    }
  })
  el.querySelectorAll("[data-queue-rm]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const idx = parseInt(btn.dataset.queueRm, 10)
      removeFromQueue(idx)
      openQueueModal() // re-render with fresh indices
      renderNowPlaying()
    }
  })
  el.querySelectorAll("[data-queue-up]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const i = parseInt(btn.dataset.queueUp, 10)
      if (i > 0) {
        reorderQueue(i, i - 1)
        openQueueModal()
        renderNowPlaying()
      }
    }
  })
  el.querySelectorAll("[data-queue-down]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const i = parseInt(btn.dataset.queueDown, 10)
      const p = getPlayerState()
      if (i < p.queue.length - 1) {
        reorderQueue(i, i + 1)
        openQueueModal()
        renderNowPlaying()
      }
    }
  })
  bindQueueDrag(el)
}

// Drag-and-drop reordering for the Up Next list.
function bindQueueDrag(el) {
  let dragIdx = -1
  const rows = () => [...el.querySelectorAll("[data-queue-item]")]
  rows().forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragIdx = parseInt(row.dataset.queueItem, 10)
      row.classList.add("dragging")
      try {
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", String(dragIdx))
      } catch {
        /* ignore */
      }
    })
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging")
      rows().forEach((r) => r.classList.remove("drop-above", "drop-below"))
      dragIdx = -1
    })
    row.addEventListener("dragover", (e) => {
      e.preventDefault()
      if (dragIdx < 0) return
      try {
        e.dataTransfer.dropEffect = "move"
      } catch {
        /* ignore */
      }
      const target = parseInt(row.dataset.queueItem, 10)
      const rect = row.getBoundingClientRect()
      const before = e.clientY < rect.top + rect.height / 2
      row.classList.toggle("drop-above", before && target !== dragIdx)
      row.classList.toggle("drop-below", !before && target !== dragIdx)
    })
    row.addEventListener("dragleave", () =>
      row.classList.remove("drop-above", "drop-below"),
    )
    row.addEventListener("drop", (e) => {
      e.preventDefault()
      if (dragIdx < 0) return
      const target = parseInt(row.dataset.queueItem, 10)
      const rect = row.getBoundingClientRect()
      const before = e.clientY < rect.top + rect.height / 2
      let to = before ? target : target + 1
      if (to > dragIdx) to -= 1
      if (to !== dragIdx) {
        reorderQueue(dragIdx, to)
        openQueueModal()
        renderNowPlaying()
      }
    })
  })
}

function updateNowPlaying() {
  const bar = $("#now-playing")
  if (!bar) return
  const st = getPlaybackState()
  const track = st.current
  if (!track) {
    bar.remove()
    return
  }
  const toggle = $("[data-np-toggle]", bar)
  if (toggle) {
    const paused = !st.playing
    toggle.innerHTML = paused ? sicon("play") : sicon("pause")
    toggle.title = paused ? "Play" : "Pause"
  }
  const time = $("[data-np-current]", bar)
  if (time) time.textContent = fmtClock(st.currentTime)
  const dur = $("[data-np-duration]", bar)
  if (dur) dur.textContent = fmtClock(st.duration || track.duration)
  const seek = $("[data-np-seek]", bar)
  if (seek && !seek.dataset.scrub && st.duration > 0) {
    seek.value = Math.round((st.currentTime / st.duration) * 1000)
  }
}

let songQuery = ""
function setSongQuery(q) {
  songQuery = String(q ?? "")
}
function getSongQuery() {
  return songQuery
}
function songHaystack(s) {
  return `${s.title || ""} ${s.artist || ""} ${s.album || ""} ${s.fileName || s.name || ""}`.toLowerCase()
}
function visibleSongs() {
  const q = songQuery.trim().toLowerCase()
  const tab = state.songFilter || "all"
  let list = state.songs || []
  if (tab === "favorites") list = list.filter((s) => isFavorite(s.id))
  else if (tab === "recent") {
    const p = getPlayerState()
    list = (p.history || [])
      .map((id) => list.find((s) => s.id === id))
      .filter(Boolean)
  }
  if (!q) return list
  return list.filter((s) => {
    try {
      return songHaystack(s).includes(q)
    } catch {
      return true
    }
  })
}
function songRow(s) {
  const st = getPlaybackState()
  const isCurrent = st.current && st.current.id === s.id
  const isPlaying = isCurrent && st.playing
  const sub = s.missing
    ? "Audio missing — the browser removed it to free space"
    : `${s.artist ? esc(s.artist) + " · " : ""}${
        s.duration ? fmtClock(s.duration) : "--:--"
      }`
  const playBtn = s.missing
    ? `<button type="button" class="ghost" data-song-reimport="${s.id}">Re-import</button>`
    : `<button type="button" class="ghost" data-song-play="${s.id}">${
        isPlaying ? "Pause" : "Play"
      }</button>`
  // Secondary actions live in an overflow menu so rows never overflow on
  // narrow screens (and playlists get a natural home there).
  const menuBtn = `<button type="button" class="ghost song-menu-btn" data-song-menu="${s.id}" title="More actions" aria-label="More actions for ${esc(s.title)}" aria-haspopup="menu">⋯</button>`
  return `<div class="song${isCurrent ? " active" : ""}${
    s.missing ? " missing" : ""
  }"><span class="song-art" aria-hidden="true">${sicon(s.missing ? "warn" : "music")}</span><span class="song-meta"><strong class="song-title" title="${esc(s.title)}">${esc(s.title)}</strong><small class="muted">${sub}</small></span><span class="song-dur">${
    s.missing ? "⚠" : s.duration ? fmtClock(s.duration) : "--:--"
  }</span><span class="song-btns">${playBtn}${menuBtn}</span></div>`
}

function songListMarkup() {
  const total = (state.songs || []).length
  if (!total) return '<p class="muted">No personal songs imported yet.</p>'
  const shown = visibleSongs()
  if (!shown.length)
    return `<div class="empty-state song-empty"><div class="emoji">${sicon("search")}</div><h3>No songs found</h3><p class="muted">Nothing in your library matches "${esc(songQuery.trim())}". Try a different title, artist, or file name.</p></div>`
  return shown.map(songRow).join("")
}
function songTabsMarkup() {
  const favCount = getFavorites().length
  const recentCount = getRecentlyPlayed().length
  return (
    `<button type="button" class="filter ${
      (state.songFilter || "all") === "all" ? "active" : ""
    }" data-song-tab="all">All (${(state.songs || []).length})</button>` +
    `<button type="button" class="filter ${
      state.songFilter === "favorites" ? "active" : ""
    }" data-song-tab="favorites">Favorites (${favCount})</button>` +
    `<button type="button" class="filter ${
      state.songFilter === "recent" ? "active" : ""
    }" data-song-tab="recent">Recently Played (${recentCount})</button>`
  )
}

function bindSongTabs(root) {
  $$("[data-song-tab]", root).forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.songTab
      if (tab === "favorites") state.songFilter = "favorites"
      else if (tab === "recent") state.songFilter = "recent"
      else state.songFilter = "all"
      renderSounds()
    }
  })
}

function refreshSongTabs() {
  const box = $("#song-tabs")
  if (!box) return
  box.innerHTML = songTabsMarkup()
  bindSongTabs(box)
}

function renderSongList() {
  const box = $("#song-list")
  if (!box) return
  // Preserve scroll: full song rows are rebuilt on every playback change.
  const top = box.scrollTop
  box.innerHTML = songListMarkup()
  try {
    box.scrollTop = top
  } catch {
    /* ignore */
  }
  bindSongRows(box)
  refreshSongTabs()
}

function renderSounds() {
  const t = $("#tab-sounds")
  if (!t) return
  closeSongMenu()
  // Reopening the section restores a dismissed player safely.
  restorePlayerBars()
  const searchHadFocus = document.activeElement?.id === "song-search"
  const visible =
    state.soundFilter === "All"
      ? sounds
      : sounds.filter((s) => s[3] === state.soundFilter)
  const favCount = getFavorites().length
  const recentCount = getRecentlyPlayed().length
  const p = getPlayerState()
  t.innerHTML = `${viewHead("Sound studio", "Layer ambient sound, keep your own music close, and build an environment that helps your attention settle.")}${mixerMarkup()}<div class="sound-layout"><div><div class="filter-bar">${["All", "Nature", "Noise", "Binaural"].map((x) => `<button type="button" class="filter ${state.soundFilter === x ? "active" : ""}" data-sound-filter="${x}">${x}</button>`).join("")}</div><div class="grid">${visible.map((s) => `<div class="card sound-card"><div class="sound-icon">${s[1].startsWith("Rain") ? sicon("rain") : s[2]}</div><div><h3>${s[1]}</h3><p class="muted">${s[3]} soundscape for study</p></div><div class="sound-controls">${iconStar("sound-" + s[0])}<button type="button" class="icon-btn" data-sound="${s[0]}">${state.soundMix[s[0]] != null ? "Ⅱ" : sicon("play")}</button></div></div>`).join("")}</div></div><div class="card"><div class="section-row"><h2>Song library</h2><label class="primary" style="font-size:12px;padding:9px 12px">Import songs<input id="song-input" type="file" accept="audio/*" multiple hidden></label></div><p class="muted">Bring your own music into the focus desk. Files are stored in this browser and kept between visits.</p><div class="song-search"><span class="song-search-ico" aria-hidden="true">${sicon("search")}</span><input class="input" id="song-search" placeholder="Search your songs…" value="${esc(songQuery)}" aria-label="Search imported songs" autocomplete="off"><button type="button" class="icon-btn song-search-clear" data-song-clear title="Clear search" aria-label="Clear search"${
    songQuery.trim() ? "" : " hidden"
  }>${sicon("x")}</button></div><div class="song-list" id="song-list">${songListMarkup()}</div><div class="song-tabs" id="song-tabs">${songTabsMarkup()}</div></div></div></div>`
  $$("[data-sound-filter]", t).forEach(
    (b) =>
      (b.onclick = () => {
        state.soundFilter = b.dataset.soundFilter
        renderSounds()
      }),
  )
  $$("[data-sound]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.sound
        if (state.soundMix[id] != null) {
          stopLayer(id)
          delete state.soundMix[id]
        } else if (startLayer(id, 0.7)) {
          state.soundMix[id] = 0.7
        }
        persist()
        renderSounds()
      }),
  )
  // (tabs are refreshed in place by refreshSongTabs; binding below covers
  // the initial full render)
  bindSongTabs(t)
  const plBox = document.createElement("div")
  plBox.id = "playlist-section"
  t.append(plBox)
  renderPlaylists()
  bindMixer(t)
  bindFavorites(t)
  $("#song-input", t).onchange = async (e) => {
    const files = [...e.target.files]
    e.target.value = ""
    requestPersistentStorage()
    let added = 0
    let skipped = 0
    for (const file of files) {
      const problem = validateAudioFile(file)
      if (problem) {
        toast(problem)
        continue
      }
      if ((state.songs || []).length >= MAX_SONGS) {
        toast(`Library is full (${MAX_SONGS} tracks) — remove something first`)
        break
      }
      const dupe = findDuplicateSong(file)
      if (dupe && !dupe.missing) {
        skipped++
        continue
      }
      // Re-importing replaces the missing track in place (same id) so queue,
      // favorites, history and playlist entries keep working.
      const replaceIdx = reimportTargetId
        ? (state.songs || []).findIndex((s) => s.id === reimportTargetId)
        : dupe
          ? (state.songs || []).findIndex((s) => s.id === dupe.id)
          : -1
      const id = replaceIdx >= 0 ? reimportTargetId || dupe.id : uid()
      reimportTargetId = null
      try {
        await songBlobPut(id, file)
      } catch {
        // The write genuinely failed — say so instead of keeping a memory-only
        // copy that would vanish on the next page load.
        toast(
          `Couldn't store "${esc(cleanSongName(file.name))}" — free up space and try again`,
        )
        continue
      }
      const now = Date.now()
      if (replaceIdx >= 0) {
        const entry = state.songs[replaceIdx]
        entry.size = file.size
        entry.type = file.type || ""
        entry.duration = 0
        entry.playing = false
        entry.fingerprint = songFingerprint(file)
        entry.updated = now
        delete entry.missing
      } else {
        state.songs.push({
          id,
          name: cleanSongName(file.name),
          title: cleanSongName(file.name),
          artist: "",
          album: "",
          fileName: file.name,
          size: file.size,
          type: file.type || "",
          duration: 0,
          playing: false,
          imported: true,
          fingerprint: songFingerprint(file),
          created: now,
          updated: now,
        })
      }
      added++
      probeDuration(id)
    }
    if (added) {
      persist()
      mirrorMusicTracks()
      renderSounds()
      renderNowPlaying()
      toast(added === 1 ? "Song imported" : `${added} songs imported`)
    }
    if (skipped)
      toast(
        `${skipped} duplicate${
          skipped === 1 ? "" : "s"
        } skipped — already in your library`,
      )
  }
  bindSongRows(t)
  const searchInput = $("#song-search", t)
  const clearBtn = $("[data-song-clear]", t)
  const syncClear = () => {
    if (clearBtn) clearBtn.hidden = !songQuery.trim()
  }
  if (searchInput) {
    searchInput.oninput = () => {
      songQuery = searchInput.value
      renderSongList()
      syncClear()
    }
    if (clearBtn)
      clearBtn.onclick = () => {
        songQuery = ""
        searchInput.value = ""
        renderSongList()
        syncClear()
        searchInput.focus()
      }
  }
  if (searchHadFocus && songQuery) {
    const si = $("#song-search", t)
    if (si) {
      si.focus()
      try {
        si.setSelectionRange(si.value.length, si.value.length)
      } catch {
        /* ignore */
      }
    }
  }
}
function bindSongRows(root) {
  $$("[data-song-play]", root).forEach(
    (b) => (b.onclick = () => toggleSong(b.dataset.songPlay)),
  )
  $$("[data-song-menu]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation()
        openSongMenu(b.dataset.songMenu, b)
      }),
  )
  $$("[data-song-reimport]", root).forEach((btn) => {
    btn.onclick = () => {
      const input = $("#song-input")
      if (!input) return toast("Open the Sounds tab to re-import")
      reimportTargetId = btn.dataset.songReimport
      input.click()
    }
  })
}

function closeSongMenu() {
  document.querySelectorAll(".song-menu-pop").forEach((m) => m.remove())
  document.removeEventListener("pointerdown", closeSongMenuOutside, true)
  document.removeEventListener("keydown", closeSongMenuKeys, true)
}

function closeSongMenuOutside(e) {
  if (
    !e.target.closest?.(".song-menu-pop") &&
    !e.target.closest?.("[data-song-menu]")
  ) {
    closeSongMenu()
  }
}

function closeSongMenuKeys(e) {
  if (e.key === "Escape") closeSongMenu()
}

function openSongMenu(songId, anchor) {
  closeSongMenu()
  const song = (state.songs || []).find((s) => s.id === songId)
  if (!song) return
  const pop = document.createElement("div")
  pop.className = "song-menu-pop"
  pop.setAttribute("role", "menu")
  const item = (action, icon, label) =>
    `<button type="button" class="song-menu-item" data-menu-act="${action}" role="menuitem">${sicon(icon)}<span>${label}</span></button>`
  pop.innerHTML = song.missing
    ? item("reimport", "upload", "Re-import audio") +
      item("remove", "trash", "Remove from library")
    : item("next", "skip-forward", "Play next") +
      item("queue", "list", "Add to queue") +
      item("playlist", "cards", "Add to playlist…") +
      item("download", "download", "Download file") +
      item("remove", "trash", "Remove from library")
  document.body.append(pop)
  try {
    const r = anchor.getBoundingClientRect()
    const w = 220
    pop.style.left =
      Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px"
    pop.style.top =
      Math.min(window.innerHeight - pop.offsetHeight - 12, r.bottom + 6) + "px"
  } catch {
    /* falls back to CSS default position */
  }
  document.addEventListener("pointerdown", closeSongMenuOutside, true)
  document.addEventListener("keydown", closeSongMenuKeys, true)
  pop.onclick = (e) => {
    const btn = e.target.closest?.("[data-menu-act]")
    if (!btn) return
    const act = btn.dataset.menuAct
    closeSongMenu()
    if (act === "next") {
      playNextInQueue(songId)
      toast("Playing next")
      renderNowPlaying()
    } else if (act === "queue") {
      addToQueue(songId)
      toast("Added to queue")
      renderNowPlaying()
    } else if (act === "playlist") {
      openPlaylistPicker(songId)
    } else if (act === "download") {
      downloadSong(songId)
    } else if (act === "reimport") {
      const input = $("#song-input")
      if (!input) return toast("Open the Sounds tab to re-import")
      reimportTargetId = songId
      input.click()
    } else if (act === "remove") {
      deleteSong(songId)
    }
  }
  pop.querySelector(".song-menu-item")?.focus()
}

// --- Playlists ---------------------------------------------------------------
// --- Playlist Studio -----------------------------------------------------------
// Grid of cards + detail view. Module view state only (never persisted):
// cloud rows carry the content, local audio presence is per-device.
let plScreen = "grid" // "grid" | "detail"
let plOpenId = null

function playlistTotalSecs(pl) {
  return (pl.songIds || []).reduce((a, id) => {
    const s = (state.songs || []).find((x) => x.id === id)
    return a + (Number(s?.duration) || 0)
  }, 0)
}

function playlistCountText(pl) {
  const n = (pl.songIds || []).length
  return `${n} song${n === 1 ? "" : "s"}`
}

function playlistCoverMarkup(pl, size) {
  const initial =
    String(pl.name || "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?"
  return `<span class="pl-cover pl-cover-${esc(pl.cover || "sunset")}${
    size === "lg" ? " pl-cover-lg" : ""
  }" aria-hidden="true"><span class="pl-cover-initial">${esc(initial)}</span><span class="pl-cover-icon">${sicon("music")}</span></span>`
}

function playlistMarkup() {
  const all = listPlaylists()
  if (plScreen === "detail") {
    const pl = getPlaylist(plOpenId)
    if (pl) return playlistDetailMarkup(pl, all)
    plScreen = "grid"
    plOpenId = null
  }
  // Grid screen. The library search box also filters cards by playlist name.
  const q = songQuery.trim().toLowerCase()
  const lists = q
    ? all.filter((p) =>
        String(p.name || "")
          .toLowerCase()
          .includes(q),
      )
    : all
  const cards = lists
    .map((pl) => {
      const count = (pl.songIds || []).length
      return (
        `<article class="pl-card" data-pl-card="${pl.id}">` +
        `<div class="pl-cover-wrap" data-pl-open="${pl.id}" role="button" tabindex="0" title="Open ${esc(pl.name)}" aria-label="Open playlist ${esc(pl.name)}">` +
        playlistCoverMarkup(pl) +
        `<button type="button" class="pl-card-play" data-pl-play="${pl.id}" title="Play ${esc(pl.name)}" aria-label="Play ${esc(pl.name)}">${sicon("play")}</button>` +
        `</div>` +
        `<div class="pl-card-body"><div class="pl-card-meta"><strong title="${esc(pl.name)}">${esc(pl.name)}</strong>` +
        `<small class="muted">${playlistCountText(pl)}${
          pl.description ? ` · ${esc(pl.description)}` : ""
        }</small></div>` +
        `<button type="button" class="ghost pl-card-menu" data-pl-menu="${pl.id}" title="Playlist options" aria-label="Playlist options" aria-haspopup="menu">⋯</button></div>` +
        `</article>`
      )
    })
    .join("")
  return (
    `<div class="card playlist-card"><div class="section-row"><h2>Playlists</h2><span class="tag">${all.length}</span></div>` +
    `<p class="muted">Group tracks for deep-work sessions. Playlists sync with your account; the audio itself stays on this device.</p>` +
    `<button type="button" class="primary" data-pl-new style="margin:10px 0 14px">+ Create Playlist</button>` +
    (cards
      ? `<div class="pl-grid">${cards}</div>`
      : q
        ? `<p class="muted">No playlists match "${esc(songQuery.trim())}".</p>`
        : `<p class="muted">No playlists yet — create one for tonight's grind.</p>`) +
    `</div>`
  )
}

function playlistDetailMarkup(pl) {
  const members = playlistSongs(pl.id)
  const missing = (pl.songIds || []).length - members.length
  const total = playlistTotalSecs(pl)
  const st = getPlaybackState()
  const rows = members
    .map((s, i) => {
      const gone = Boolean(s.missing)
      const isCurrent = st.current && st.current.id === s.id
      const isPlaying = isCurrent && st.playing
      return (
        `<div class="pl-track${gone ? " missing" : ""}${
          isCurrent ? " current" : ""
        }">` +
        `<button type="button" class="pl-track-play" data-pl-track-play="${pl.id}:${s.id}" title="${
          gone ? "Missing audio" : isPlaying ? "Pause" : "Play"
        }" aria-label="${
          gone ? "Missing audio" : isPlaying ? "Pause" : "Play"
        } ${esc(s.title)}"${
          gone ? " disabled" : ""
        }>${sicon(gone ? "warn" : isPlaying ? "pause" : "play")}</button>` +
        `<span class="pl-track-meta"><strong title="${esc(s.title)}">${esc(s.title)}</strong><small class="muted">${
          s.artist ? esc(s.artist) + " · " : ""
        }${s.duration ? fmtClock(s.duration) : "--:--"}</small></span>` +
        `<span class="pl-track-actions">` +
        (gone
          ? `<button type="button" class="queue-remove" data-pl-rm="${pl.id}:${s.id}" title="Remove from playlist" aria-label="Remove from playlist">${sicon("x")}</button>`
          : `<button type="button" class="queue-shift" data-pl-up="${pl.id}:${i}" title="Move up" aria-label="Move up"${
              i === 0 ? " disabled" : ""
            }>${sicon("chevron-up")}</button>` +
            `<button type="button" class="queue-shift" data-pl-down="${pl.id}:${i}" title="Move down" aria-label="Move down"${
              i === members.length - 1 ? " disabled" : ""
            }>${sicon("chevron-down")}</button>` +
            `<button type="button" class="queue-remove" data-pl-rm="${pl.id}:${s.id}" title="Remove from playlist" aria-label="Remove from playlist">${sicon("x")}</button>`) +
        `</span></div>`
      )
    })
    .join("")
  return (
    `<div class="card playlist-card"><button type="button" class="ghost" data-pl-back>← All playlists</button>` +
    `<div class="pl-detail-head">${playlistCoverMarkup(pl, "lg")}` +
    `<div class="pl-detail-id"><h3>${esc(pl.name)}</h3>` +
    (pl.description ? `<p class="muted">${esc(pl.description)}</p>` : "") +
    `<p class="muted">${playlistCountText(pl)}${
      total ? ` · ${fmtClock(total)}` : ""
    }</p></div></div>` +
    `<div class="pl-detail-actions"><button type="button" class="primary" data-pl-play="${pl.id}">Play All</button>` +
    `<button type="button" class="ghost" data-pl-shuffleplay="${pl.id}">${sicon("shuffle")} Shuffle</button>` +
    `<button type="button" class="ghost" data-pl-edit="${pl.id}">Edit</button>` +
    `<button type="button" class="ghost" data-pl-addsongs="${pl.id}">Add Songs</button>` +
    `<button type="button" class="ghost" data-pl-menu="${pl.id}" title="More options" aria-label="More options" aria-haspopup="menu">⋯</button></div>` +
    (rows ||
      '<p class="muted">Empty playlist — add something to get started.</p>') +
    (missing
      ? `<p class="muted">${missing} saved track${
          missing === 1 ? " is" : "s are"
        } missing on this device.</p>`
      : "") +
    `</div>`
  )
}

function renderPlaylists() {
  const box = $("#playlist-section")
  if (!box) return
  box.innerHTML = playlistMarkup()
  bindPlaylists(box)
}

// Fisher–Yates order for shuffle play. The playlist itself is untouched —
// only the playback queue carries the shuffled order.
function shuffledOrder(ids) {
  const arr = [...ids]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function playablePlaylistIds(pl) {
  return (pl.songIds || []).filter((sid) => {
    const s = (state.songs || []).find((x) => x.id === sid)
    return s && !s.missing
  })
}

function playPlaylist(id, opts = {}) {
  const pl = getPlaylist(id)
  if (!pl) return toast("Playlist not found")
  let ids = playablePlaylistIds(pl)
  if (!ids.length) return toast("Nothing playable in here on this device yet")
  if (opts.shuffle) ids = shuffledOrder(ids)
  setQueue(ids, 0)
  savePlayerState({ shuffle: false })
  startPlayback(ids[0], { startInQueue: false })
  renderPlaylists()
  renderNowPlaying()
}

function bindPlaylists(box) {
  const newBtn = $("[data-pl-new]", box)
  if (newBtn) newBtn.onclick = () => openPlaylistCreateModal()
  // Grid cards
  $$("[data-pl-open]", box).forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest?.("[data-pl-play],[data-pl-menu]")) return
      plScreen = "detail"
      plOpenId = el.dataset.plOpen
      renderPlaylists()
    }
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        plScreen = "detail"
        plOpenId = el.dataset.plOpen
        renderPlaylists()
      }
    }
  })
  $$("[data-pl-play]", box).forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation()
      playPlaylist(b.dataset.plPlay)
    }
  })
  $$("[data-pl-menu]", box).forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation()
      openPlaylistMenu(b.dataset.plMenu, b)
    }
  })
  // Detail screen
  const back = $("[data-pl-back]", box)
  if (back)
    back.onclick = () => {
      plScreen = "grid"
      plOpenId = null
      renderPlaylists()
    }
  $$("[data-pl-shuffleplay]", box).forEach((b) => {
    b.onclick = () => playPlaylist(b.dataset.plShuffleplay, { shuffle: true })
  })
  $$("[data-pl-edit]", box).forEach((b) => {
    b.onclick = () => openPlaylistEditModal(b.dataset.plEdit)
  })
  $$("[data-pl-addsongs]", box).forEach((b) => {
    b.onclick = () => openPlaylistAddModal(b.dataset.plAddsongs)
  })
  $$("[data-pl-track-play]", box).forEach((b) => {
    b.onclick = () => {
      const sep = b.dataset.plTrackPlay.indexOf(":")
      const pid = b.dataset.plTrackPlay.slice(0, sep)
      const sid = b.dataset.plTrackPlay.slice(sep + 1)
      const pl = getPlaylist(pid)
      if (!pl) return
      const ids = playablePlaylistIds(pl)
      const at = ids.indexOf(sid)
      if (at < 0) return toast("Audio missing on this device — re-import it")
      setQueue(ids, at)
      savePlayerState({ shuffle: false })
      startPlayback(sid, { startInQueue: false })
      renderPlaylists()
      renderNowPlaying()
    }
  })
  $$("[data-pl-rm]", box).forEach((b) => {
    b.onclick = () => {
      const sep = b.dataset.plRm.indexOf(":")
      const pid = b.dataset.plRm.slice(0, sep)
      const sid = b.dataset.plRm.slice(sep + 1)
      if (removeFromPlaylist(pid, sid)) {
        mirrorPlaylists()
        renderPlaylists()
      }
    }
  })
  const move = (attr, dir) => {
    $$(`[data-pl-${attr}]`, box).forEach((btn) => {
      btn.onclick = () => {
        const raw = attr === "up" ? btn.dataset.plUp : btn.dataset.plDown
        const i = raw.indexOf(":")
        if (
          moveInPlaylist(
            raw.slice(0, i),
            +raw.slice(i + 1),
            +raw.slice(i + 1) + dir,
          )
        ) {
          mirrorPlaylists()
          renderPlaylists()
        }
      }
    })
  }
  move("up", -1)
  move("down", 1)
}

function closePlaylistMenu() {
  document.querySelectorAll("[data-pl-menu-pop]").forEach((m) => m.remove())
  document.removeEventListener("pointerdown", closePlaylistMenuOutside, true)
  document.removeEventListener("keydown", closePlaylistMenuKeys, true)
}

function closePlaylistMenuOutside(e) {
  if (
    !e.target.closest?.("[data-pl-menu-pop]") &&
    !e.target.closest?.("[data-pl-menu]")
  ) {
    closePlaylistMenu()
  }
}

function closePlaylistMenuKeys(e) {
  if (e.key === "Escape") closePlaylistMenu()
}

function openPlaylistMenu(plId, anchor) {
  closePlaylistMenu()
  const pl = getPlaylist(plId)
  if (!pl) return
  const pop = document.createElement("div")
  pop.className = "song-menu-pop"
  pop.setAttribute("data-pl-menu-pop", "")
  pop.setAttribute("role", "menu")
  const item = (action, icon, label) =>
    `<button type="button" class="song-menu-item" data-pl-act="${action}" role="menuitem">${sicon(icon)}<span>${label}</span></button>`
  pop.innerHTML =
    item("play", "play", "Play") +
    item("shuffle", "shuffle", "Shuffle Play") +
    item("edit", "memo", "Edit") +
    item("addsongs", "list", "Add Songs") +
    item("rename", "cards", "Rename") +
    item("delete", "trash", "Delete")
  document.body.append(pop)
  try {
    const r = anchor.getBoundingClientRect()
    const w = 220
    pop.style.left =
      Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px"
    pop.style.top =
      Math.min(window.innerHeight - pop.offsetHeight - 12, r.bottom + 6) + "px"
  } catch {
    /* falls back to CSS default position */
  }
  document.addEventListener("pointerdown", closePlaylistMenuOutside, true)
  document.addEventListener("keydown", closePlaylistMenuKeys, true)
  pop.onclick = (e) => {
    const btn = e.target.closest?.("[data-pl-act]")
    if (!btn) return
    const act = btn.dataset.plAct
    closePlaylistMenu()
    if (act === "play") playPlaylist(plId)
    else if (act === "shuffle") playPlaylist(plId, { shuffle: true })
    else if (act === "edit") openPlaylistEditModal(plId)
    else if (act === "addsongs") {
      if (plScreen !== "detail" || plOpenId !== plId) {
        plScreen = "detail"
        plOpenId = plId
        renderPlaylists()
      }
      openPlaylistAddModal(plId)
    } else if (act === "rename") openPlaylistRenameModal(plId)
    else if (act === "delete") deletePlaylistFlow(plId)
  }
  pop.querySelector(".song-menu-item")?.focus()
}

function deletePlaylistFlow(plId) {
  const pl = getPlaylist(plId)
  if (!pl) return
  confirmBox(
    `Delete "${pl.name}"?`,
    "The playlist goes away, but your songs stay in the library.",
    () => {
      if (plOpenId === plId) {
        plScreen = "grid"
        plOpenId = null
      }
      deletePlaylist(plId)
      mirrorPlaylists()
      deletePlaylistEverywhere(plId)
      renderPlaylists()
      toast("Playlist deleted")
    },
  )
}

function coverPickerMarkup(selected) {
  return (
    `<div class="pl-cover-pick" role="radiogroup" aria-label="Cover art">` +
    PLAYLIST_COVERS.map(
      (c) =>
        `<button type="button" class="pl-cover pl-cover-${c.id}${
          selected === c.id ? " selected" : ""
        }" data-cover-pick="${c.id}" role="radio" aria-checked="${selected === c.id}" title="${c.label}" aria-label="${c.label} cover"><span class="pl-cover-icon">${sicon("music")}</span></button>`,
    ).join("") +
    `</div>`
  )
}

function bindCoverPicker(modal, initial) {
  let selected = initial
  modal.querySelectorAll("[data-cover-pick]").forEach((b) => {
    b.onclick = () => {
      selected = b.dataset.coverPick
      modal.querySelectorAll("[data-cover-pick]").forEach((x) => {
        const on = x === b
        x.classList.toggle("selected", on)
        x.setAttribute("aria-checked", String(on))
      })
    }
  })
  return () => selected
}

function openPlaylistCreateModal() {
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  modal.innerHTML =
    `<div class="modal"><div class="eyebrow">New playlist</div><h2>Create Playlist</h2>` +
    `<label class="field-label">Playlist name<input class="input" data-plf-name maxlength="80" placeholder="My Evening Study" aria-label="Playlist name"></label>` +
    `<label class="field-label">Description <span class="muted">(optional)</span><textarea class="input" data-plf-desc rows="2" maxlength="300" placeholder="Calm songs for evening study"></textarea></label>` +
    `<div class="eyebrow" style="margin-top:10px">Cover</div><div data-plf-cover></div>` +
    `<p class="st-confirm-err" data-plf-err hidden></p>` +
    `<div class="modal-actions"><button type="button" class="ghost" data-plf-cancel>Cancel</button><button type="button" class="primary" data-plf-save>Create Playlist</button></div></div>`
  $("#modal-root").append(modal)
  modal.querySelector("[data-plf-cover]").innerHTML =
    coverPickerMarkup("sunset")
  const getCover = bindCoverPicker(modal, "sunset")
  const err = modal.querySelector("[data-plf-err]")
  const nameInput = modal.querySelector("[data-plf-name]")
  const descInput = modal.querySelector("[data-plf-desc]")
  const close = () => modal.remove()
  modal.querySelector("[data-plf-cancel]").onclick = close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close()
  })
  const fail = (msg) => {
    err.textContent = msg
    err.hidden = false
  }
  modal.querySelector("[data-plf-save]").onclick = () => {
    const r = createPlaylist(nameInput.value, {
      description: descInput.value,
      cover: getCover(),
    })
    if (!r.ok) return fail(r.error)
    mirrorPlaylists()
    close()
    plScreen = "detail"
    plOpenId = r.playlist.id
    renderPlaylists()
    toast(`Playlist "${r.playlist.name}" created`)
  }
  nameInput.onkeydown = (e) => {
    if (e.key === "Enter") modal.querySelector("[data-plf-save]").click()
  }
  setTimeout(() => nameInput.focus(), 0)
}

function openPlaylistEditModal(plId) {
  const pl = getPlaylist(plId)
  if (!pl) return
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  modal.innerHTML =
    `<div class="modal"><div class="eyebrow">Edit playlist</div><h2>${esc(pl.name)}</h2>` +
    `<label class="field-label">Playlist name<input class="input" data-plf-name maxlength="80" value="${esc(pl.name)}" aria-label="Playlist name"></label>` +
    `<label class="field-label">Description <span class="muted">(optional)</span><textarea class="input" data-plf-desc rows="2" maxlength="300">${esc(pl.description || "")}</textarea></label>` +
    `<div class="eyebrow" style="margin-top:10px">Cover</div><div data-plf-cover></div>` +
    `<p class="st-confirm-err" data-plf-err hidden></p>` +
    `<div class="modal-actions"><button type="button" class="ghost" data-plf-cancel>Cancel</button><button type="button" class="primary" data-plf-save>Save changes</button></div></div>`
  $("#modal-root").append(modal)
  modal.querySelector("[data-plf-cover]").innerHTML = coverPickerMarkup(
    pl.cover || "sunset",
  )
  const getCover = bindCoverPicker(modal, pl.cover || "sunset")
  const err = modal.querySelector("[data-plf-err]")
  const nameInput = modal.querySelector("[data-plf-name]")
  const descInput = modal.querySelector("[data-plf-desc]")
  const close = () => modal.remove()
  modal.querySelector("[data-plf-cancel]").onclick = close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close()
  })
  modal.querySelector("[data-plf-save]").onclick = () => {
    const r = updatePlaylist(plId, {
      name: nameInput.value,
      description: descInput.value,
      cover: getCover(),
    })
    if (!r.ok) {
      err.textContent = r.error
      err.hidden = false
      return
    }
    mirrorPlaylists()
    close()
    renderPlaylists()
    toast("Playlist updated")
  }
  setTimeout(() => {
    nameInput.focus()
    nameInput.select()
  }, 0)
}

function openPlaylistRenameModal(plId) {
  const pl = getPlaylist(plId)
  if (!pl) return
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  modal.innerHTML =
    `<div class="modal"><div class="eyebrow">Rename playlist</div><h2>${esc(pl.name)}</h2>` +
    `<input class="input" data-pl-rename-input maxlength="80" value="${esc(pl.name)}" aria-label="Playlist name">` +
    `<p class="st-confirm-err" data-pl-rename-err hidden></p>` +
    `<div class="modal-actions"><button type="button" class="ghost" data-pl-rename-cancel>Cancel</button><button type="button" class="primary" data-pl-rename-save>Rename</button></div></div>`
  $("#modal-root").append(modal)
  const input = modal.querySelector("[data-pl-rename-input]")
  const close = () => modal.remove()
  modal.querySelector("[data-pl-rename-cancel]").onclick = close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close()
  })
  const saveIt = () => {
    const r = renamePlaylist(plId, input.value)
    if (!r.ok) {
      const errEl = modal.querySelector("[data-pl-rename-err]")
      errEl.textContent = r.error
      errEl.hidden = false
      return
    }
    mirrorPlaylists()
    close()
    renderPlaylists()
    toast("Playlist renamed")
  }
  modal.querySelector("[data-pl-rename-save]").onclick = saveIt
  input.onkeydown = (e) => {
    if (e.key === "Enter") saveIt()
  }
  setTimeout(() => {
    input.focus()
    input.select()
  }, 0)
}

let plAddQuery = ""

function openPlaylistAddModal(plId) {
  const pl = getPlaylist(plId)
  if (!pl) return
  plAddQuery = ""
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  modal.innerHTML =
    `<div class="modal"><div class="eyebrow">Add to ${esc(pl.name)}</div><h2>Add Songs</h2>` +
    `<div class="song-search"><span class="song-search-ico" aria-hidden="true">${sicon("search")}</span>` +
    `<input class="input" data-pl-add-search placeholder="Search songs…" aria-label="Search songs" autocomplete="off"></div>` +
    `<div class="pl-add-list" data-pl-add-list></div>` +
    `<p class="muted" data-pl-add-count style="margin-top:8px">Selected: 0</p>` +
    `<div class="modal-actions" style="margin-top:10px"><button type="button" class="ghost" data-pl-add-cancel>Cancel</button><button type="button" class="primary" data-pl-add-save>Add to Playlist</button></div></div>`
  $("#modal-root").append(modal)
  const close = () => modal.remove()
  modal.querySelector("[data-pl-add-cancel]").onclick = close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close()
  })
  const list = modal.querySelector("[data-pl-add-list]")
  const count = modal.querySelector("[data-pl-add-count]")
  const search = modal.querySelector("[data-pl-add-search]")
  const selected = new Set()
  const paint = () => {
    const q = plAddQuery.trim().toLowerCase()
    const inIds = new Set(pl.songIds || [])
    let lib = (state.songs || []).filter((s) => !s.missing)
    if (q) {
      lib = lib.filter((s) =>
        `${s.title || ""} ${s.artist || ""} ${s.album || ""} ${s.fileName || s.name || ""}`
          .toLowerCase()
          .includes(q),
      )
    }
    // Prune selections that scrolled out of a shrinking library (cheap safety).
    ;[...selected].forEach((id) => {
      if (!(state.songs || []).some((s) => s.id === id)) selected.delete(id)
    })
    list.innerHTML = lib.length
      ? lib
          .slice(0, 200)
          .map((s) => {
            const has = inIds.has(s.id)
            const on = selected.has(s.id)
            return (
              `<label class="pl-add-row${
                has ? " in-list" : ""
              }"><input type="checkbox" data-pl-add-check="${s.id}"${
                on ? " checked" : ""
              }${has ? " disabled" : ""}>` +
              `<span class="pl-track-meta"><strong title="${esc(s.title)}">${esc(s.title)}</strong><small class="muted">${
                s.artist ? esc(s.artist) + " · " : ""
              }${s.duration ? fmtClock(s.duration) : "--:--"}</small></span>` +
              (has ? `<span class="tag">Added</span>` : "") +
              `</label>`
            )
          })
          .join("") +
        (lib.length > 200
          ? `<p class="muted">Showing the first 200 — search to narrow down.</p>`
          : "")
      : `<p class="muted">${
          q
            ? "Nothing matches that search."
            : "No playable songs in your library yet."
        }</p>`
    count.textContent = `Selected: ${selected.size}`
    list.querySelectorAll("[data-pl-add-check]").forEach((cb) => {
      cb.onchange = () => {
        if (cb.checked) selected.add(cb.dataset.plAddCheck)
        else selected.delete(cb.dataset.plAddCheck)
        count.textContent = `Selected: ${selected.size}`
      }
    })
  }
  search.oninput = () => {
    plAddQuery = search.value
    paint()
  }
  modal.querySelector("[data-pl-add-save]").onclick = () => {
    if (!selected.size) {
      close()
      return
    }
    let added = 0
    let skipped = 0
    ;[...selected].forEach((sid) => {
      const r = addToPlaylist(plId, sid)
      if (r.ok) added++
      else skipped++
    })
    mirrorPlaylists()
    close()
    renderPlaylists()
    toast(
      added
        ? `Added ${added} song${
            added === 1 ? "" : "s"
          } to "${getPlaylist(plId)?.name || "playlist"}"${
            skipped ? ` (${skipped} already in it)` : ""
          }`
        : "Those songs are already in this playlist",
    )
  }
  paint()
  setTimeout(() => search.focus(), 0)
}

function openPlaylistPicker(songId) {
  const song = (state.songs || []).find((s) => s.id === songId)
  if (!song) return
  const modal = document.createElement("div")
  modal.className = "modal-backdrop"
  const lists = listPlaylists()
  modal.innerHTML =
    `<div class="modal"><div class="eyebrow">Add to playlist</div><h2>${esc(song.title)}</h2>` +
    (lists.length
      ? `<div class="pl-pick-list">` +
        lists
          .map((pl) => {
            const has = (pl.songIds || []).includes(songId)
            return `<button type="button" class="pl-pick" data-pl-pick="${pl.id}"${
              has ? " disabled" : ""
            }><span><strong>${esc(pl.name)}</strong><small class="muted"> · ${(pl.songIds || []).length} tracks</small></span>${
              has ? '<span class="tag">added</span>' : ""
            }</button>`
          })
          .join("") +
        `</div>`
      : `<p class="muted">No playlists yet — create one first.</p>`) +
    `<div class="pl-form" style="margin-top:12px"><input class="input" data-pl-pick-new placeholder="New playlist name…" maxlength="80" aria-label="New playlist name"><button type="button" class="primary" data-pl-pick-create>Create &amp; add</button></div>` +
    `<div class="modal-actions" style="margin-top:14px"><button type="button" class="ghost" data-pl-pick-cancel>Done</button></div></div>`
  $("#modal-root").append(modal)
  const close = () => modal.remove()
  modal.querySelector("[data-pl-pick-cancel]").onclick = close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close()
  })
  modal.querySelectorAll("[data-pl-pick]").forEach((b) => {
    b.onclick = () => {
      const r = addToPlaylist(b.dataset.plPick, songId)
      if (!r.ok) return toast(r.error)
      mirrorPlaylists()
      close()
      if (state.tab === "sounds") renderSounds()
      toast(`Added to "${getPlaylist(b.dataset.plPick)?.name || "playlist"}"`)
    }
  })
  const newInput = modal.querySelector("[data-pl-pick-new]")
  modal.querySelector("[data-pl-pick-create]").onclick = () => {
    const r = createPlaylist(newInput.value)
    if (!r.ok) return toast(r.error)
    const added = addToPlaylist(r.playlist.id, songId)
    mirrorPlaylists()
    close()
    if (state.tab === "sounds") renderSounds()
    toast(
      added.ok
        ? `Created "${r.playlist.name}" and added the track`
        : `Created "${r.playlist.name}"`,
    )
  }
}

async function downloadSong(songId) {
  const song = (state.songs || []).find((s) => s.id === songId)
  if (!song) return
  const blob = await songBlobGet(songId)
  if (!blob) return toast("Audio data is missing — please re-import")
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = song.fileName || song.name || "track"
    document.body.append(a)
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
      a.remove()
    }, 4000)
  } catch {
    toast("Download failed in this browser")
  }
}

function deleteSong(songId) {
  const song = (state.songs || []).find((s) => s.id === songId)
  if (!song) return
  confirmBox(
    "Remove this track?",
    "The audio file leaves your library for good.",
    async () => {
      const live = (state.songs || []).find((s) => s.id === songId)
      if (!live) return
      if (live.playing) stopPlayback()
      await songBlobDelete(songId)
      // Purge every local reference first: queue, favorites, history,
      // playlists — then the library row, then the cloud row.
      purgeSongEverywhere(songId)
      state.songs = (state.songs || []).filter((s) => s.id !== songId)
      persist()
      mirrorMusicTracks()
      deleteTrackEverywhere(songId)
      // Rewrite playlist links now so the deleted id never lingers as a ghost
      // membership on the server (links rewrite from local state).
      mirrorPlaylists()
      if (state.tab === "sounds") renderSounds()
      renderNowPlaying()
    },
  )
}

function ambientReady() {
  try {
    if (!ambientContext) {
      const Ctor = window.AudioContext || window.webkitAudioContext
      if (!Ctor) return false
      ambientContext = new Ctor()
      ambientMaster = ambientContext.createGain()
      ambientMaster.gain.value = state.soundVolume ?? 0.8
      ambientMaster.connect(ambientContext.destination)
      const len = ambientContext.sampleRate * 2
      const white = ambientContext.createBuffer(
        1,
        len,
        ambientContext.sampleRate,
      )
      const brown = ambientContext.createBuffer(
        1,
        len,
        ambientContext.sampleRate,
      )
      const wd = white.getChannelData(0)
      const bd = brown.getChannelData(0)
      let last = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        wd[i] = w
        last = (last + 0.02 * w) / 1.02
        bd[i] = last * 3.5
      }
      noiseBufs = { white, brown }
    }
    if (ambientContext.state === "suspended") ambientContext.resume()
    return true
  } catch {
    return false
  }
}

function noiseSource(kind) {
  const src = ambientContext.createBufferSource()
  src.buffer = kind === "brown" ? noiseBufs.brown : noiseBufs.white
  src.loop = true
  return src
}

function newLayer(recipeGain) {
  const g = ambientContext.createGain()
  g.gain.value = 0
  g.connect(ambientMaster)
  const layer = {
    gain: g,
    vol: 0.7,
    recipe: recipeGain,
    timers: [],
    nodes: [],
    stop() {
      layer.timers.forEach((id) => {
        clearInterval(id)
        clearTimeout(id)
      })
      layer.nodes.forEach((n) => {
        try {
          if (n.stop) n.stop()
        } catch {
          /* already stopped */
        }
        try {
          n.disconnect()
        } catch {
          /* already gone */
        }
      })
      try {
        g.disconnect()
      } catch {
        /* already gone */
      }
    },
  }
  return layer
}

function recipeRain(layer) {
  const g = layer.gain
  const track = (n) => {
    layer.nodes.push(n)
    return n
  }
  const src = track(noiseSource("white"))
  src.start()
  const bp = track(ambientContext.createBiquadFilter())
  bp.type = "bandpass"
  bp.frequency.value = 2600
  bp.Q.value = 0.45
  src.connect(bp)
  bp.connect(g)
  const hiss = track(noiseSource("white"))
  hiss.start()
  const hp = track(ambientContext.createBiquadFilter())
  hp.type = "highpass"
  hp.frequency.value = 6500
  const hissG = track(ambientContext.createGain())
  hissG.gain.value = 0.12
  hiss.connect(hp)
  hp.connect(hissG)
  hissG.connect(g)
  const lfo = track(ambientContext.createOscillator())
  lfo.type = "sine"
  lfo.frequency.value = 0.13
  const lfoG = track(ambientContext.createGain())
  lfoG.gain.value = 0.08
  lfo.connect(lfoG)
  lfoG.connect(g.gain)
  lfo.start()
  layer.recipe = 0.5
}

function recipeFire(layer) {
  const g = layer.gain
  const track = (n) => {
    layer.nodes.push(n)
    return n
  }
  const low = track(noiseSource("brown"))
  low.start()
  const lp = track(ambientContext.createBiquadFilter())
  lp.type = "lowpass"
  lp.frequency.value = 420
  low.connect(lp)
  lp.connect(g)
  const crackle = track(noiseSource("white"))
  crackle.start()
  const hp = track(ambientContext.createBiquadFilter())
  hp.type = "highpass"
  hp.frequency.value = 2500
  const popBus = track(ambientContext.createGain())
  popBus.gain.value = 0
  crackle.connect(hp)
  hp.connect(popBus)
  popBus.connect(g)
  layer.timers.push(
    setInterval(() => {
      if (!ambientContext) return
      if (Math.random() < 0.55) {
        const t = ambientContext.currentTime
        const peak = 0.15 + Math.random() * 0.5
        try {
          popBus.gain.cancelScheduledValues(t)
          popBus.gain.setValueAtTime(Math.max(0.0001, popBus.gain.value), t)
          popBus.gain.linearRampToValueAtTime(peak, t + 0.015)
          popBus.gain.exponentialRampToValueAtTime(
            0.0001,
            t + 0.09 + Math.random() * 0.12,
          )
        } catch {
          /* busy */
        }
      }
    }, 110),
  )
  layer.recipe = 0.55
}

function recipeOcean(layer) {
  const g = layer.gain
  const track = (n) => {
    layer.nodes.push(n)
    return n
  }
  const src = track(noiseSource("brown"))
  src.start()
  const lp = track(ambientContext.createBiquadFilter())
  lp.type = "lowpass"
  lp.frequency.value = 480
  lp.Q.value = 0.5
  src.connect(lp)
  lp.connect(g)
  const lfo = track(ambientContext.createOscillator())
  lfo.type = "sine"
  lfo.frequency.value = 0.07
  const lfoG = track(ambientContext.createGain())
  lfoG.gain.value = 0.22
  lfo.connect(lfoG)
  lfoG.connect(g.gain)
  lfo.start()
  layer.recipe = 0.6
}

function recipeForest(layer) {
  const g = layer.gain
  const track = (n) => {
    layer.nodes.push(n)
    return n
  }
  const src = track(noiseSource("white"))
  src.start()
  const lp = track(ambientContext.createBiquadFilter())
  lp.type = "lowpass"
  lp.frequency.value = 900
  src.connect(lp)
  lp.connect(g)
  const chirp = () => {
    try {
      const osc = ambientContext.createOscillator()
      const env = ambientContext.createGain()
      const base = 2400 + Math.random() * 1200
      const t = ambientContext.currentTime
      osc.type = "sine"
      osc.frequency.setValueAtTime(base, t)
      osc.frequency.exponentialRampToValueAtTime(base * 0.72, t + 0.22)
      env.gain.setValueAtTime(0.0001, t)
      env.gain.exponentialRampToValueAtTime(0.09, t + 0.04)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
      osc.connect(env)
      env.connect(g)
      osc.onended = () => {
        ;[osc, env].forEach((n) => {
          const i = layer.nodes.indexOf(n)
          if (i > -1) layer.nodes.splice(i, 1)
        })
      }
      layer.nodes.push(osc, env)
      osc.start(t)
      osc.stop(t + 0.35)
    } catch {
      /* busy */
    }
  }
  const schedule = () => {
    if (Math.random() < 0.65) chirp()
    layer.timers.push(setTimeout(schedule, 2800 + Math.random() * 5200))
  }
  schedule()
  layer.recipe = 0.32
}

function recipeNoise(layer, kind) {
  const src = noiseSource(kind === "brown" ? "brown" : "white")
  layer.nodes.push(src)
  src.start()
  if (kind === "pink") {
    const lp = ambientContext.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = 3500
    layer.nodes.push(lp)
    src.connect(lp)
    lp.connect(layer.gain)
    layer.recipe = 0.1
  } else if (kind === "brown") {
    src.connect(layer.gain)
    layer.recipe = 0.25
  } else {
    src.connect(layer.gain)
    layer.recipe = 0.06
  }
}

function recipeBinaural(layer, beat) {
  const base = beat === "gamma" ? 180 : 200
  const diff = beat === "gamma" ? 40 : 10
  const mk = (freq, pan) => {
    const osc = ambientContext.createOscillator()
    osc.type = "sine"
    osc.frequency.value = freq
    const p = ambientContext.createStereoPanner
      ? ambientContext.createStereoPanner()
      : null
    layer.nodes.push(osc)
    osc.start()
    if (p) {
      p.pan.value = pan
      layer.nodes.push(p)
      osc.connect(p)
      p.connect(layer.gain)
    } else {
      osc.connect(layer.gain)
    }
  }
  mk(base, -0.9)
  mk(base + diff, 0.9)
  layer.recipe = beat === "gamma" ? 0.045 : 0.05
}

const SOUND_EQUIP = {
  "rain-pack": "rain",
  campfire: "fire",
  "forest-pack": "forest",
  "brown-pack": "brown",
  "ocean-pack": "ocean",
  thunder: "thunder",
}

function recipeThunder(layer) {
  const g = layer.gain
  const track = (n) => {
    layer.nodes.push(n)
    return n
  }
  const src = track(noiseSource("brown"))
  src.start()
  const lp = track(ambientContext.createBiquadFilter())
  lp.type = "lowpass"
  lp.frequency.value = 200
  src.connect(lp)
  lp.connect(g)
  const boom = () => {
    try {
      const osc = ambientContext.createOscillator()
      const env = ambientContext.createGain()
      const t = ambientContext.currentTime
      osc.type = "sine"
      osc.frequency.setValueAtTime(58, t)
      osc.frequency.exponentialRampToValueAtTime(34, t + 1.1)
      env.gain.setValueAtTime(0.0001, t)
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.08)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
      osc.connect(env)
      env.connect(g)
      osc.onended = () => {
        ;[osc, env].forEach((n) => {
          const i = layer.nodes.indexOf(n)
          if (i > -1) layer.nodes.splice(i, 1)
        })
      }
      layer.nodes.push(osc, env)
      osc.start(t)
      osc.stop(t + 1.8)
    } catch {
      /* busy */
    }
    layer.timers.push(setTimeout(boom, 7000 + Math.random() * 9000))
  }
  boom()
  layer.recipe = 0.5
}

function buildLayer(id) {
  const layer = newLayer(0.3)
  if (id === "rain") recipeRain(layer)
  else if (id === "fire") recipeFire(layer)
  else if (id === "ocean") recipeOcean(layer)
  else if (id === "forest") recipeForest(layer)
  else if (id === "white" || id === "pink" || id === "brown")
    recipeNoise(layer, id)
  else if (id === "alpha") recipeBinaural(layer, "alpha")
  else if (id === "gamma") recipeBinaural(layer, "gamma")
  else if (id === "thunder") recipeThunder(layer)
  else {
    layer.stop()
    return null
  }
  return layer
}

function applyLayerGain(id) {
  const layer = ambientLayers[id]
  if (!layer || !ambientContext) return
  const target = layer.recipe * layer.vol * (mixDucked ? DUCK_LEVEL : 1)
  try {
    layer.gain.gain.setTargetAtTime(target, ambientContext.currentTime, 0.5)
  } catch {
    /* busy */
  }
}

function startLayer(id, vol) {
  if (!ambientReady()) {
    toast("Audio is unavailable in this browser")
    return false
  }
  stopLayer(id)
  const layer = buildLayer(id)
  if (!layer) return false
  layer.vol = vol ?? 0.7
  ambientLayers[id] = layer
  applyLayerGain(id)
  return true
}

function stopLayer(id) {
  const layer = ambientLayers[id]
  if (!layer) return
  try {
    layer.gain.gain.setTargetAtTime(0, ambientContext.currentTime, 0.15)
  } catch {
    /* busy */
  }
  setTimeout(() => {
    try {
      layer.stop()
    } catch {
      /* already gone */
    }
  }, 600)
  delete ambientLayers[id]
}

function stopAllLayers() {
  Object.keys(ambientLayers).forEach(stopLayer)
}

function setDuck(ducked) {
  mixDucked = Boolean(ducked)
  Object.keys(ambientLayers).forEach(applyLayerGain)
}

function ensureMixPlaying() {
  if (!ambientReady()) return
  Object.entries(state.soundMix || {}).forEach(([id, vol]) => {
    if (!ambientLayers[id]) startLayer(id, vol)
  })
  Object.keys(ambientLayers).forEach((id) => {
    if (state.soundMix[id] == null) stopLayer(id)
  })
}

function applyLinkToTimer() {
  if (!state.linkSound) return
  ensureMixPlaying()
  setDuck(state.mode !== "focus")
}

function setMasterVolume(v) {
  state.soundVolume = Math.min(1, Math.max(0, v))
  if (ambientMaster && ambientContext) {
    try {
      ambientMaster.gain.setTargetAtTime(
        state.soundVolume,
        ambientContext.currentTime,
        0.2,
      )
    } catch {
      /* busy */
    }
  }
}

function stopAmbient() {
  stopAllLayers()
}

function startAmbient(soundId) {
  if (startLayer(soundId, 0.7)) state.activeSound = soundId
}

export {
  chimeCtx,
  warmAudio,
  CHIMES,
  playChime,
  ambientContext,
  ambientMaster,
  noiseBufs,
  ambientLayers,
  mixDucked,
  DUCK_LEVEL,
  mixerMarkup,
  bindMixer,
  songBlobs,
  songUrls,
  songDbPromise,
  songDb,
  songBlobPut,
  songBlobGet,
  songBlobDelete,
  songObjectUrl,
  migrateSongs,
  AUDIO_EXTS,
  validateAudioFile,
  cleanSongName,
  playSong,
  toggleSong,
  resumeTrack,
  advanceTrack,
  stopPlayback,
  probeDuration,
  songFormat,
  setSongQuery,
  getSongQuery,
  visibleSongs,
  renderNowPlaying,
  bindNowPlaying,
  updateNowPlaying,
  renderSounds,
  sounds,
  ambientReady,
  noiseSource,
  newLayer,
  recipeRain,
  recipeFire,
  recipeOcean,
  recipeForest,
  recipeNoise,
  recipeBinaural,
  SOUND_EQUIP,
  recipeThunder,
  buildLayer,
  applyLayerGain,
  startLayer,
  stopLayer,
  stopAllLayers,
  setDuck,
  ensureMixPlaying,
  applyLinkToTimer,
  setMasterVolume,
  stopAmbient,
  startAmbient,
  resumeLiveAudio,
  clearSongDatabase,
}

// Test hooks (headless verification only — not used by the app itself).
export const __musicTestHooks = {
  startMiniDrag,
  endMiniDrag,
  bindMiniDrag,
  getMiniPos,
  saveMiniPos,
}
