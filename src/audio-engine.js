import { state, persist, $, fmtClock, notify } from "./core.js"
import {
  getPlayerState,
  savePlayerState,
  addToHistory,
  setQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  clearQueue,
  getQueue,
  getCurrentQueueTrack,
  isFavorite,
  getFavorites,
  getRecentlyPlayed,
  toggleRepeat,
  toggleShuffle,
  setSpeed,
  cycleSpeed,
  setVolume,
  toggleMute,
  saveResumePos,
  getResumePos,
  clearResumePos,
} from "./audio-state.js"

let audioEl = null
let endedGuard = false
let sourceResolver = null
let playbackListener = null
// Generation counter: overlapping startPlayback calls (rapid Next clicks,
// ended+manual overlap) must not let a STALE play() rejection clobber the
// new track's flags or toast a phantom "blocked" message. Only the latest
// generation may touch UI state from async continuations.
let playToken = 0

export function setSourceResolver(fn) {
  sourceResolver = fn
}

// UI hook: fired whenever playback state actually changes (track change,
// play/pause, end-of-queue, error) so the now-playing bar/mini player stay
// truthful without polling.
export function setPlaybackListener(fn) {
  playbackListener = typeof fn === "function" ? fn : null
}

function emitPlaybackChange() {
  if (!playbackListener) return
  try {
    playbackListener()
  } catch {
    /* UI refresh must never break playback */
  }
}

function ensureAudio() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = "metadata"
    audioEl.volume = state.player?.volume ?? state.playerVol ?? 0.8
    audioEl.addEventListener("timeupdate", onTimeUpdate)
    audioEl.addEventListener("loadedmetadata", onMetaLoaded)
    audioEl.addEventListener("ended", onEnded)
    audioEl.addEventListener("error", onError)
  }
  return audioEl
}

function onTimeUpdate() {
  // Real playback progress proves the track is healthy — this is what clears
  // the consecutive-failure streak (NOT play() success: a doomed source can
  // resolve play() and then fail to load, which must still count).
  if (audioEl && !audioEl.paused && !audioEl.ended) errorSkipStreak = 0
  const audio = audioEl
  if (!audio || audio.ended) return
  const bar = $("#now-playing")
  if (bar) {
    const seek = $("[data-np-seek]", bar)
    const time = $("[data-np-current]", bar)
    if (time) time.textContent = fmtClock(audio.currentTime)
    if (seek && !seek.dataset.scrub && audio.duration > 0) {
      seek.value = Math.round((audio.currentTime / audio.duration) * 1000)
    }
  }
  const mini = document.querySelector("#np-mini")
  if (mini) {
    const time = mini.querySelector("[data-np-mini-current]")
    if (time) time.textContent = fmtClock(audio.currentTime)
    const seek = mini.querySelector("[data-np-mini-seek]")
    if (seek && !seek.dataset.scrub && audio.duration > 0) {
      seek.value = Math.round((audio.currentTime / audio.duration) * 1000)
    }
  }
}

function onMetaLoaded() {
  const bar = $("#now-playing")
  if (bar) {
    const dur = $("[data-np-duration]", bar)
    if (dur) dur.textContent = fmtClock(audioEl?.duration)
  }
  const mini = document.querySelector("#np-mini")
  if (mini) {
    const dur = mini.querySelector("[data-np-mini-duration]")
    if (dur) dur.textContent = fmtClock(audioEl?.duration)
  }
}

let lastErrorRetriedId = null

// Consecutive give-ups (decode failures, not missing files — those are
// skipped silently by advance()). Caps the skip storm when a whole stretch
// of the library is unplayable so the player stops instead of spinning.
let errorSkipStreak = 0

function onEnded() {
  if (endedGuard) return
  endedGuard = true
  setTimeout(() => {
    endedGuard = false
  }, 300)
  clearResumePos()
  const p = getPlayerState()
  if (p.repeat === "one") {
    restartCurrent()
    return
  }
  advance(1, { manual: false })
}

function onError() {
  const audio = audioEl
  if (
    !audio ||
    !audio.src ||
    audio.error?.code === MediaError.MEDIA_ERR_ABORTED
  )
    return
  const songId = state.playerTrack
  const song = (state.songs || []).find((s) => s.id === songId)
  if (!song) return
  // A dead source (stale/revoked blob: URL from an earlier session or evicted
  // page) usually means the audio data itself is fine in IndexedDB — drop the
  // URL and retry once with a freshly minted one before giving up.
  if (song.blobUrl) {
    try {
      URL.revokeObjectURL(song.blobUrl)
    } catch {
      /* ignore */
    }
    song.blobUrl = null
  }
  if (lastErrorRetriedId !== songId) {
    lastErrorRetriedId = songId
    startPlayback(songId, {
      startInQueue: false,
      startPos: audio.currentTime || 0,
    })
    return
  }
  lastErrorRetriedId = null
  const name = song ? `"${song.title || song.name || "Unknown"}"` : "This track"
  notify(`${name} cannot be played by your browser — skipping`)
  errorSkipStreak++
  if (errorSkipStreak >= 5) {
    errorSkipStreak = 0
    pausePlayback()
    notify("Stopped — several tracks in a row failed to play")
    return
  }
  advance(1)
}

function applySettings() {
  const audio = ensureAudio()
  const p = getPlayerState()
  audio.volume = p.muted ? 0 : p.volume
  audio.playbackRate = p.speed || 1
}

async function resolveUrl(songId) {
  const song = (state.songs || []).find((s) => s.id === songId)
  if (!song) return null
  if (song.blobUrl) return song.blobUrl
  if (song._blob) {
    song.blobUrl = URL.createObjectURL(song._blob)
    return song.blobUrl
  }
  if (sourceResolver) {
    const url = await sourceResolver(songId)
    if (url) return url
  }
  return null
}

function getBlobUrl(songId) {
  const song = (state.songs || []).find((s) => s.id === songId)
  if (!song) return null
  if (song.blobUrl) return song.blobUrl
  if (song._blob) {
    song.blobUrl = URL.createObjectURL(song._blob)
    return song.blobUrl
  }
  return null
}

export function getPlaybackState() {
  const audio = ensureAudio()
  const p = getPlayerState()
  const current = getCurrentQueueTrack()
  return {
    playing: !audio.paused && !audio.ended,
    currentTime: audio.currentTime || 0,
    duration: audio.duration || 0,
    volume: audio.volume,
    muted: audio.muted,
    speed: audio.playbackRate,
    current,
    queue: getQueue(),
    index: p.index,
    repeat: p.repeat,
    shuffle: p.shuffle,
    favorites: getFavorites(),
    recentlyPlayed: getRecentlyPlayed(),
  }
}

export function applyPlaybackSettings() {
  applySettings()
}

export async function startPlayback(songId, options = {}) {
  const { startInQueue = true, startPos = 0 } = options
  const audio = ensureAudio()
  const song = (state.songs || []).find((s) => s.id === songId)
  if (!song) return null
  const token = ++playToken
  // A new track is a fresh slate for error recovery: only consecutive errors
  // on the SAME track escalate (retry once, then skip). Resetting on play
  // success instead would let a persistently broken track retry forever when
  // the success continuation lands before its load error.
  if (lastErrorRetriedId && lastErrorRetriedId !== songId)
    lastErrorRetriedId = null
  // A saved pause position belongs to its own track — starting anything
  // else discards it (callers read it before invoking us when resuming).
  if (getResumePos(songId) <= 0) clearResumePos()
  let url = getBlobUrl(songId)
  if (!url) url = await resolveUrl(songId)
  if (!url) {
    // The audio data itself is gone (evicted by the browser) — surface it on
    // the row so the user gets a Re-import button instead of a dead Play.
    song.missing = true
    persist()
    notify(
      "This track's audio was removed by the browser to free space — re-import it",
    )
    return null
  }
  if (!song.blobUrl) song.blobUrl = url
  const sameTrack =
    !audio.error && audio.currentSrc === url && state.playerTrack === songId
  if (!sameTrack) {
    audio.pause()
    audio.src = url
    audio.load()
    if (startPos > 0) {
      // currentTime can only be set reliably once metadata is loaded for a
      // brand-new source; seek right after load() is silently ignored.
      const seekOnce = () => {
        // A newer selection may have taken over while metadata was loading —
        // never seek a stale position onto it.
        if (token !== playToken) return
        try {
          audio.currentTime = startPos
        } catch {
          /* ignore */
        }
      }
      // `once` guarantees no listener pile-up if metadata never arrives
      // (the manual remove is a belt-and-braces backup for old engines).
      audio.addEventListener("loadedmetadata", seekOnce, { once: true })
    }
  } else if (audio.ended) {
    audio.currentTime = 0
  } else if (startPos > 0) {
    try {
      audio.currentTime = startPos
    } catch {
      /* ignore */
    }
  }
  const p = getPlayerState()
  const idx = p.queue.indexOf(songId)
  if (startInQueue) {
    if (idx === -1) {
      addToQueue(songId)
      const newP = getPlayerState()
      newP.index = newP.queue.length - 1
      savePlayerState({ index: newP.index })
    } else {
      savePlayerState({ index: idx })
    }
  } else if (idx >= 0) {
    savePlayerState({ index: idx })
  }
  state.songs.forEach((s) => (s.playing = s.id === songId))
  state.playerTrack = songId
  state.playerHidden = false
  addToHistory(songId)
  persist()
  applySettings()
  emitPlaybackChange()
  try {
    await audio.play()
  } catch {
    // Stale generation (a newer track took over and this play() was
    // interrupted): stay silent so we don't clear the new track's state.
    if (token !== playToken) return null
    state.songs.forEach((s) => (s.playing = false))
    emitPlaybackChange()
    notify("Playback was blocked — tap play again")
  }
  return song
}

export function pausePlayback() {
  const audio = ensureAudio()
  if (!audio.paused) {
    try {
      if (state.playerTrack && Number.isFinite(audio.currentTime)) {
        saveResumePos(state.playerTrack, audio.currentTime)
      }
    } catch {
      /* position save is best-effort */
    }
    audio.pause()
    emitPlaybackChange()
  }
}

export function resumePlayback() {
  const audio = ensureAudio()
  if (audio.ended) {
    const trackId = state.playerTrack
    if (trackId) startPlayback(trackId, { startInQueue: false, startPos: 0 })
    return
  }
  if (audio.paused) {
    // Fresh session, revoked URL, or cleared source: nothing usable is loaded.
    // Reload the current track — from the saved pause position when we have
    // one, so resume-after-pause survives even a page reload.
    if (!audio.currentSrc) {
      const trackId = state.playerTrack || getCurrentQueueTrack()?.id
      if (!trackId) return
      startPlayback(trackId, {
        startInQueue: false,
        startPos: getResumePos(trackId),
      })
      return
    }
    // Resume is a continuation, not a new selection: if a newer track took
    // over meanwhile, its state wins and this outcome stays silent.
    const token = playToken
    audio
      .play()
      .then(() => {
        if (token === playToken) emitPlaybackChange()
      })
      .catch(() => {
        if (token !== playToken) return
        notify("Playback was blocked — tap play again")
      })
  }
}

export function togglePlayback(songId) {
  const audio = ensureAudio()
  if (songId && state.playerTrack === songId) {
    if (audio.ended) {
      startPlayback(songId, { startInQueue: false, startPos: 0 })
    } else if (audio.paused) {
      resumePlayback()
    } else {
      pausePlayback()
    }
  } else if (songId) {
    startPlayback(songId)
  } else if (audio.ended) {
    const trackId = state.playerTrack
    if (trackId) startPlayback(trackId, { startInQueue: false, startPos: 0 })
  } else if (audio.paused) {
    resumePlayback()
  } else {
    pausePlayback()
  }
}

export function seekTo(time) {
  const audio = ensureAudio()
  const t = Math.max(0, Math.min(time, audio.duration || 0))
  try {
    audio.currentTime = t
    if (audio.ended && t < audio.duration) {
      audio.play().catch(() => {})
    }
  } catch {
    /* ignore */
  }
}

export function seekPercent(percent) {
  const audio = ensureAudio()
  const dur = audio.duration || 0
  if (dur > 0) seekTo((percent / 100) * dur)
}

export function advance(direction, { manual = true } = {}) {
  const p = getPlayerState()
  if (!p.queue.length) {
    // Queue cleared: keep the music flowing from the last track that played,
    // looping through the whole library — just like Boomplay after clearing.
    const ids = (state.songs || []).filter((s) => !s.missing).map((s) => s.id)
    if (!ids.length) {
      notify("Queue is empty — import some songs first")
      return
    }
    const at = Math.max(0, ids.indexOf(state.playerTrack))
    const start =
      direction < 0 ? (at - 1 + ids.length) % ids.length : (at + 1) % ids.length
    setQueue(ids, start)
    startPlayback(ids[start], { startInQueue: false })
    return
  }
  const total = p.queue.length
  // Manual skips wrap around even with repeat off (Boomplay/Spotify behavior);
  // auto-advance at the end of the queue stops cleanly unless repeat is on.
  const wrapOk = manual || p.repeat === "all"
  const pick = (i) => {
    if (i < 0) return wrapOk ? total - 1 : null
    if (i >= total) return wrapOk ? 0 : null
    return i
  }
  let nextIndex = pick(p.index + direction)
  if (nextIndex === null) {
    pausePlayback()
    return
  }
  // Never land on a track whose audio data the browser evicted — hop over it.
  for (let tried = 0; tried < total; tried++) {
    const song = (state.songs || []).find((s) => s.id === p.queue[nextIndex])
    if (song && !song.missing) break
    const wrapped = pick(nextIndex + direction)
    if (wrapped === null || wrapped === nextIndex) break
    nextIndex = wrapped
  }
  savePlayerState({ index: nextIndex })
  startPlayback(p.queue[nextIndex], { startInQueue: false, startPos: 0 })
}

export function skipToNext() {
  advance(1)
}

export function skipToPrevious() {
  const audio = ensureAudio()
  if (audio.currentTime > 3) {
    seekTo(0)
    return
  }
  advance(-1)
}

export function restartCurrent() {
  const audio = ensureAudio()
  audio.currentTime = 0
  if (audio.paused || audio.ended) {
    audio.play().catch(() => {})
  }
}

export function playSongFromList(songId) {
  const p = getPlayerState()
  const allIds = (state.songs || []).map((s) => s.id)
  if (!p.queue.includes(songId)) {
    const idx = allIds.indexOf(songId)
    setQueue(allIds, idx >= 0 ? idx : 0)
  } else {
    const idx = p.queue.indexOf(songId)
    savePlayerState({ index: idx })
  }
  startPlayback(songId, { startInQueue: false })
}

export function shuffleAll() {
  const allIds = (state.songs || []).map((s) => s.id)
  const shuffled = [...allIds]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  setQueue(shuffled, 0)
  savePlayerState({ shuffle: true })
  if (shuffled.length) startPlayback(shuffled[0], { startInQueue: false })
}

export function clearNowPlaying() {
  const audio = ensureAudio()
  audio.pause()
  audio.removeAttribute("src")
  audio.load()
  state.songs.forEach((s) => (s.playing = false))
  state.playerTrack = null
  savePlayerState({ index: -1 })
  clearQueue()
  persist()
  emitPlaybackChange()
}
