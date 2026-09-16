/* audio.js — chimes, ambient engine, music library, sound studio */
import {
  state, $, $$, uid, get, save, esc, sicon, persist, notify, addCoins,
  fmtClock, fmtSize, iconStar, bindFavorites, checkReminder, confirmBox, viewHead,
  updateBarPadding, makeDraggable,
} from "./core.js";
import { renderFavorites } from "./techniques.js";
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
} from "./audio-state.js";
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
} from "./audio-engine.js";
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
];

let ambientContext;

let ambientMaster;

let noiseBufs;

let ambientLayers = {};

let mixDucked = false;

const DUCK_LEVEL = 0.12;

let chimeCtx = null;

function warmAudio() {
  try {
    if (!chimeCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      chimeCtx = new Ctor();
    }
    if (chimeCtx.state === "suspended") chimeCtx.resume();
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
};

function playChime(kind, style, vol) {
  try {
    warmAudio();
    if (!chimeCtx) return;
    style = style || state.chimeStyle || "arpeggio";
    vol = vol ?? state.chimeVolume ?? 0.8;
    if (!(vol > 0)) return;
    const set = CHIMES[style] || CHIMES.arpeggio;
    const notes = set[kind] || set.focus;
    const peak = Math.min(0.4, 0.28 * vol + 0.02);
    const startAt = chimeCtx.currentTime + 0.02;
    notes.forEach((freq, i) => {
      const osc = chimeCtx.createOscillator();
      const gain = chimeCtx.createGain();
      osc.connect(gain);
      gain.connect(chimeCtx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = startAt + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch {
    /* silent */
  }
}

if (!window.__sfReminderLoop) {
  window.__sfReminderLoop = setInterval(checkReminder, 30000);
}

export function initAudioState() {
  setPlaybackListener(() => {
    // Engine-driven changes (auto-advance, play/pause, errors, stop) keep the
    // now-playing bar and the sounds tab truthful.
    renderNowPlaying();
    if (state.tab === "sounds") renderSounds();
  });
  setSourceResolver(async (songId) => {
    const blob = await songBlobGet(songId);
    if (!blob) return null;
    const song = (state.songs || []).find((s) => s.id === songId);
    if (!song) return null;
    // Always mint a fresh object URL: a blob: URL saved during an earlier
    // session died when that page closed, and cached ones may have been
    // revoked. Reusing them makes the audio element fail to load.
    return songObjectUrl(songId, blob);
  });
  repairSongLibrary();
  if (!state.soundMix) state.soundMix = {};
  if (!Object.keys(state.soundMix).length && state.activeSound) {
    state.soundMix = { [state.activeSound]: 0.7 };
    persist();
  }
  if (state.running && state.linkSound && Object.keys(state.soundMix).length) {
    try {
      applyLinkToTimer();
    } catch {
      /* audio locked until first gesture */
    }
  }
  hydratePlayerFromStorage();
  applyPlaybackSettings();
}

const resumeLiveAudio = () => {
  try {
    if (ambientContext && ambientContext.state === "suspended")
      ambientContext.resume();
  } catch {
    /* ignore */
  }
  try {
    warmAudio();
  } catch {
    /* ignore */
  }
};

if (!window.__sfAudioResume) {
  window.__sfAudioResume = true;
  window.addEventListener("pointerdown", resumeLiveAudio);
  window.addEventListener("keydown", resumeLiveAudio);
}

function mixerMarkup() {
  const entries = Object.entries(state.soundMix || {});
  const nameOf = (id) => {
    const s = sounds.find((x) => x[0] === id);
    return s ? `${s[2]} ${s[1]}` : id;
  };
  const masterPct = Math.round((state.soundVolume ?? 0.8) * 100);
  return `<div class="card" style="margin-bottom:18px"><div class="section-row"><h2>Your mix</h2><span class="tag">layered</span></div><p class="muted">Tap ${sicon("play")} on any sound below to layer it in. Volumes blend live.</p><div class="mix-row"><span class="muted" style="min-width:56px">Master</span><input type="range" min="0" max="100" value="${masterPct}" data-master-vol aria-label="Master volume"><span class="mix-pct" data-master-pct>${masterPct}%</span></div><div id="mix-layers">${entries.length ? entries.map(([id, vol]) => `<div class="mix-row"><span style="min-width:56px">${nameOf(id)}</span><input type="range" min="0" max="100" value="${Math.round(vol * 100)}" data-layer-vol="${id}" aria-label="${esc(id)} volume"><span class="mix-pct" data-layer-pct="${id}">${Math.round(vol * 100)}%</span><button class="ghost" data-layer-remove="${id}" title="Remove">×</button></div>`).join("") : '<p class="muted" style="margin-top:10px">Quiet for now — start a sound below.</p>'}</div><label class="toggle-row" style="margin-top:12px"><span><strong>Link to timer</strong><small>Auto-start the mix with focus · fade to a hush on breaks</small></span><input type="checkbox" id="link-sound"${state.linkSound ? " checked" : ""}></label>${entries.length ? '<button class="ghost" id="stop-mix" style="margin-top:10px">Stop everything</button>' : ""}</div>`;
}

function bindMixer(t) {
  const master = $("[data-master-vol]", t);
  if (master) {
    master.oninput = () => {
      setMasterVolume(master.value / 100);
      const pct = $("[data-master-pct]", t);
      if (pct) pct.textContent = `${master.value}%`;
    };
    master.onchange = () => persist();
  }
  $$("[data-layer-vol]", t).forEach((slider) => {
    slider.oninput = () => {
      const id = slider.dataset.layerVol;
      const v = slider.value / 100;
      state.soundMix[id] = v;
      const layer = ambientLayers[id];
      if (layer) {
        layer.vol = v;
        applyLayerGain(id);
      }
      const pct = $(`[data-layer-pct="${id}"]`, t);
      if (pct) pct.textContent = `${slider.value}%`;
    };
    slider.onchange = () => persist();
  });
  $$("[data-layer-remove]", t).forEach(
    (b) =>
      (b.onclick = () => {
        stopLayer(b.dataset.layerRemove);
        delete state.soundMix[b.dataset.layerRemove];
        persist();
        renderSounds();
      }),
  );
  const link = $("#link-sound", t);
  if (link)
    link.onchange = () => {
      state.linkSound = link.checked;
      persist();
      applyLinkToTimer();
      notify(
        state.linkSound
          ? "Soundscape linked to your timer"
          : "Timer link off",
      );
    };
  const stopAll = $("#stop-mix", t);
  if (stopAll)
    stopAll.onclick = () => {
      stopAllLayers();
      state.soundMix = {};
      persist();
      renderSounds();
    };
}

const songBlobs = new Map();

const songUrls = new Map();

let reimportTargetId = null;

let songDbPromise = null;

async function clearSongDatabase() {
  try {
    const db = await songDb();
    if (db) db.close();
  } catch {
    /* ignore */
  }
  songDbPromise = null;
  if (typeof indexedDB === "undefined") return true;
  await new Promise((res, rej) => {
    try {
      const req = indexedDB.deleteDatabase("studyflow");
      req.onsuccess = () => res(true);
      req.onerror = () => rej(req.error);
      req.onblocked = () => res(true);
    } catch (e) {
      rej(e);
    }
  });
  return true;
}
function songDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!songDbPromise) {
    songDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open("studyflow", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("songs");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return songDbPromise;
}

// Throws on failure so callers (e.g. import) can tell the user instead of
// silently keeping a memory-only copy that vanishes on the next page load.
async function songBlobPut(id, blob) {
  songBlobs.set(id, blob);
  const db = await songDb();
  if (!db) return; // no IndexedDB here: memory-only, works until the page closes
  await new Promise((res, rej) => {
    try {
      const tx = db.transaction("songs", "readwrite");
      tx.objectStore("songs").put(blob, id);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error || new Error("IndexedDB write failed"));
      tx.onabort = () => rej(tx.error || new Error("IndexedDB write aborted"));
    } catch (e) {
      rej(e);
    }
  });
}

async function songBlobGet(id) {
  if (songBlobs.has(id)) return songBlobs.get(id);
  try {
    const db = await songDb();
    if (!db) return null;
    const blob = await new Promise((res, rej) => {
      const tx = db.transaction("songs", "readonly");
      const rq = tx.objectStore("songs").get(id);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => rej(rq.error);
    });
    if (blob) songBlobs.set(id, blob);
    return blob;
  } catch {
    return null;
  }
}

async function songBlobDelete(id) {
  songBlobs.delete(id);
  const url = songUrls.get(id);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    songUrls.delete(id);
  }
  try {
    const db = await songDb();
    if (!db) return;
    await new Promise((res) => {
      const tx = db.transaction("songs", "readwrite");
      tx.objectStore("songs").delete(id);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    });
  } catch {
    /* ignore */
  }
}

// Mints a fresh, valid object URL every call and retires the previous one for
// the same id — callers can never receive a stale or revoked URL.
function songObjectUrl(id, blob) {
  const stale = songUrls.get(id);
  if (stale) {
    try {
      URL.revokeObjectURL(stale);
    } catch {
      /* ignore */
    }
    songUrls.delete(id);
  }
  const url = URL.createObjectURL(blob);
  songUrls.set(id, url);
  return url;
}

async function songHasAudio(id) {
  return Boolean(await songBlobGet(id));
}

// Ask the browser to keep our IndexedDB audio out of eviction. Without this,
// long-idle libraries can lose audio data under storage pressure.
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persisted && navigator.storage?.persist) {
      if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    }
  } catch {
    /* not supported — best-effort only */
  }
}

// Boot-time repair: blob: URLs and "playing" flags from a previous session are
// meaningless now, and the browser may have evicted some audio. Clean up so
// every track either plays from IndexedDB or is visibly marked as missing.
async function repairSongLibrary() {
  requestPersistentStorage();
  let changed = false;
  for (const s of state.songs || []) {
    if (s.blobUrl) {
      delete s.blobUrl;
      changed = true;
    }
    if (s.playing) {
      s.playing = false;
      changed = true;
    }
    if (await songHasAudio(s.id)) {
      if (s.missing) {
        delete s.missing;
        changed = true;
      }
    } else if (!s.missing) {
      s.missing = true;
      changed = true;
    }
  }
  if (changed) {
    persist();
    if (state.tab === "sounds") renderSongList();
  }
}

async function migrateSongs() {
  let changed = false;
  for (const s of state.songs || []) {
    if (s.url && String(s.url).startsWith("data:")) {
      try {
        const blob = await fetch(s.url).then((r) => r.blob());
        await songBlobPut(s.id, blob);
        if (s.missing) {
          delete s.missing;
        }
      } catch {
        /* keep metadata; audio re-importable */
      }
      delete s.url;
      changed = true;
    }
  }
  if (changed) persist();
}

const AUDIO_EXTS = ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "webm", "mp4"];

function validateAudioFile(file) {
  if (!file) return "No file chosen";
  const ext = (String(file.name || "").split(".").pop() || "").toLowerCase();
  const okType =
    String(file.type || "").startsWith("audio/") ||
    AUDIO_EXTS.includes(ext) ||
    String(file.type || "").startsWith("video/mp4");
  if (!okType) return `"${file.name}" doesn't look like audio — try MP3, WAV or OGG`;
  if (!file.size) return `"${file.name}" is empty`;
  if (file.size > 30 * 1024 * 1024)
    return `"${file.name}" is over 30 MB — pick a smaller file`;
  return "";
}

function cleanSongName(name) {
  return String(name || "Untitled track")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .slice(0, 80);
}

async function playSong(id) {
  const song = (state.songs || []).find((s) => s.id === id);
  if (!song) return;
  const blob = await songBlobGet(id);
  if (!blob) {
    song.missing = true;
    persist();
    renderSounds();
    notify("This track's audio was removed by the browser to free space — re-import it");
    return;
  }
  if (song.missing) {
    delete song.missing;
    persist();
    renderSounds();
  }
  song.blobUrl = songObjectUrl(id, blob);
  playSongFromList(id);
}

function toggleSong(id) {
  const song = (state.songs || []).find((s) => s.id === id);
  if (!song) return;
  const st = getPlaybackState();
  if (st.current && st.current.id === id) {
    // Resume keeps the position; resumePlayback also handles the fresh-session
    // case where no source is loaded yet (it restarts the track).
    if (st.playing) pausePlayback();
    else resumePlayback();
  } else {
    playSong(id);
  }
}

function resumeTrack(song) {
  resumePlayback();
}

function advanceTrack(dir) {
  advance(dir);
}

function stopPlayback() {
  clearNowPlaying();
}

function probeDuration(id) {
  songBlobGet(id).then((blob) => {
    if (!blob) return;
    try {
      const url = URL.createObjectURL(blob);
      const probe = new Audio();
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        const song = state.songs.find((s) => s.id === id);
        if (song && probe.duration && Number.isFinite(probe.duration)) {
          song.duration = Math.round(probe.duration);
          persist();
          if (state.tab === "sounds") renderSounds();
          renderNowPlaying();
        }
        URL.revokeObjectURL(url);
      };
      probe.onerror = () => URL.revokeObjectURL(url);
      probe.src = url;
    } catch {
      /* ignore */
    }
  });
}

function songFormat(s) {
  const fromType =
    s.type && s.type.startsWith("audio/")
      ? s.type.slice(6).toUpperCase().split(";")[0]
      : "";
  if (fromType) return fromType === "MPEG" ? "MP3" : fromType;
  const ext = (String(s.name || "").split(".").pop() || "").toUpperCase();
  return ext && ext !== String(s.name || "").toUpperCase() ? ext : "";
}

function renderNowPlaying() {
  let bar = $("#now-playing");
  let mini = $("#np-mini");
  const st = getPlaybackState();
  const track = st.current;
  if (!track) {
    bar?.remove();
    mini?.remove();
    updateBarPadding();
    return;
  }
  if (state.playerHidden) {
    bar?.remove();
    renderMiniPlayer(track, st);
    return;
  }
  mini?.remove();
  const p = getPlayerState();
  const paused = !st.playing;
  const pct = st.duration > 0 ? Math.round((st.currentTime / st.duration) * 1000) : 0;
  const repeatIcon = p.repeat === "one" ? sicon("repeat-one") : p.repeat === "all" ? sicon("repeat") : sicon("repeat");
  const repeatLabel = p.repeat === "one" ? "Repeat One" : p.repeat === "all" ? "Repeat All" : "Repeat Off";
  const favIcon = isFavorite(track.id) ? "heart-filled" : "heart";

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "now-playing";
    document.body.append(bar);
  }
  bar.classList.remove("np-shuffle-on", "np-repeat-on");
  bar.innerHTML = `
    <div class="np-controls">
      <button class="np-btn" data-np-prev title="Previous">${sicon("skip-back")}</button>
      <button class="np-btn np-main" data-np-toggle title="${paused ? "Play" : "Pause"}">${paused ? sicon("play") : sicon("pause")}</button>
      <button class="np-btn" data-np-next title="Next">${sicon("skip-forward")}</button>
    </div>
    <div class="np-progress">
      <span class="np-time" data-np-current>${fmtClock(st.currentTime)}</span>
      <input class="np-seek" data-np-seek type="range" min="0" max="1000" value="${pct}" aria-label="Seek">
      <span class="np-time" data-np-duration>${fmtClock(st.duration)}</span>
    </div>
    <div class="np-meta">
      <span class="np-track" title="${esc(track.title)}">${esc(track.title)}</span>
      ${track.artist ? `<span class="np-artist">${esc(track.artist)}</span>` : ""}
    </div>
    <div class="np-extras">
      <button class="np-btn${isFavorite(track.id) ? " liked" : ""}" data-np-fav title="${isFavorite(track.id) ? "Unlike" : "Like"}" aria-pressed="${isFavorite(track.id)}">${sicon(favIcon)}</button>
      <button class="np-btn" data-np-repeat title="${repeatLabel}">${repeatIcon}</button>
      <button class="np-btn" data-np-shuffle title="${p.shuffle ? "Shuffle On" : "Shuffle Off"}">${sicon("shuffle")}</button>
      <button class="np-btn" data-np-speed title="Speed ${p.speed}x">${sicon("timer")}</button>
      <div class="np-vol-wrap">
        <button class="np-btn" data-np-mute title="Mute">${sicon(p.muted ? "volume-x" : "volume-2")}</button>
        <input class="np-vol" data-np-vol type="range" min="0" max="100" value="${Math.round(p.volume * 100)}" aria-label="Volume">
      </div>
      <button class="np-btn" data-np-queue title="Queue">${sicon("list")}</button>
      <button class="np-btn np-close" data-np-close title="Hide player">${sicon("x")}</button>
    </div>
  `;
  if (p.shuffle) bar.classList.add("np-shuffle-on");
  if (p.repeat !== "off") bar.classList.add("np-repeat-on");
  bindNowPlaying(bar);
  makeDraggable(bar, bar.querySelector(".np-controls") || bar);
  updateBarPadding();
}

function renderMiniPlayer(track, st) {
  let mini = $("#np-mini");
  if (!mini) {
    mini = document.createElement("div");
    mini.id = "np-mini";
    document.body.append(mini);
  }
  const paused = !st.playing;
  mini.innerHTML = `
    <button class="np-mini-btn" data-np-mini-toggle title="${paused ? "Play" : "Pause"}">${paused ? sicon("play") : sicon("pause")}</button>
    <span class="np-mini-title" data-np-mini-title title="${esc(track.title)}">${esc(track.title)}</span>
    <button class="np-mini-btn" data-np-mini-open title="Open player">${sicon("music")}</button>
  `;
  $("[data-np-mini-toggle]", mini).onclick = () => {
    if (st.playing) pausePlayback();
    else resumePlayback();
  };
  $("[data-np-mini-open]", mini).onclick = () => {
    state.playerHidden = false;
    renderNowPlaying();
  };
  makeDraggable(mini, mini);
  updateBarPadding();
}

function bindNowPlaying(bar) {
  $("[data-np-toggle]", bar).onclick = () => {
    const st = getPlaybackState();
    if (st.playing) pausePlayback();
    else resumePlayback();
  };
  $("[data-np-prev]", bar).onclick = () => skipToPrevious();
  $("[data-np-next]", bar).onclick = () => skipToNext();
  $("[data-np-fav]", bar).onclick = (e) => {
    const st = getPlaybackState();
    if (st.current) toggleFavorite(st.current.id);
    renderNowPlaying();
  };
  $("[data-np-repeat]", bar).onclick = () => { toggleRepeat(); renderNowPlaying(); };
  $("[data-np-shuffle]", bar).onclick = () => { toggleShuffle(); renderNowPlaying(); };
  $("[data-np-speed]", bar).onclick = () => { cycleSpeed(); applyPlaybackSettings(); renderNowPlaying(); };
  $("[data-np-mute]", bar).onclick = () => { toggleMute(); applyPlaybackSettings(); renderNowPlaying(); };
  $("[data-np-queue]", bar).onclick = () => openQueueModal();
  $("[data-np-close]", bar).onclick = () => {
    state.playerHidden = true;
    renderNowPlaying();
  };
  const seek = $("[data-np-seek]", bar);
  if (seek) {
    seek.oninput = () => { seek.dataset.scrub = "1"; };
    seek.onchange = () => {
      delete seek.dataset.scrub;
      seekPercent(seek.value / 10);
    };
  }
  const vol = $("[data-np-vol]", bar);
  if (vol) {
    vol.oninput = () => { setVolume(vol.value / 100); applyPlaybackSettings(); };
    vol.onchange = () => persist();
  }
}

function openQueueModal() {
  document.querySelectorAll("[data-queue-backdrop]").forEach((m) => m.remove());
  const st = getPlaybackState();
  const p = getPlayerState();
  const items = st.queue;
  let html = `<div class="modal-backdrop" data-queue-backdrop style="z-index:60"><div class="queue-modal"><div class="queue-head"><h2>Up Next</h2><div style="display:flex;gap:8px"><button class="ghost" data-queue-clear${items.length ? "" : " disabled"}>Clear</button><button class="ghost" data-queue-close>${sicon("x")}</button></div></div>`;
  if (!items.length) {
    html += `<div class="queue-empty"><p class="muted">Queue is empty — your library keeps playing on loop.</p></div>`;
  } else {
    html += `<div class="queue-list">`;
    items.forEach((song, i) => {
      const isCurrent = i === p.index;
      const played = p.index >= 0 && i < p.index;
      const art = song.title || song.name || "Untitled";
      html += `<div class="queue-item${isCurrent ? " current" : ""}${played ? " played" : ""}" data-queue-item="${i}" data-queue-play="${i}" draggable="true">
        <span class="queue-grip" data-queue-grip title="Drag to reorder">${sicon("grip-vertical")}</span>
        <div class="queue-info"><strong>${esc(art)}</strong><small>${song.artist ? esc(song.artist) + " · " : ""}${song.duration ? fmtClock(song.duration) : "--:--"}</small></div>
        ${isCurrent ? `<span class="tag" style="font-size:10px">Now</span>` : ""}
        <span class="queue-move">
          <button class="queue-shift" data-queue-up="${i}" title="Move up" aria-label="Move up"${i === 0 ? " disabled" : ""}>${sicon("chevron-up")}</button>
          <button class="queue-shift" data-queue-down="${i}" title="Move down" aria-label="Move down"${i === items.length - 1 ? " disabled" : ""}>${sicon("chevron-down")}</button>
        </span>
        <button class="queue-remove" data-queue-rm="${i}" title="Remove">${sicon("x")}</button>
      </div>`;
    });
    html += `</div>`;
    html += `<p class="muted" style="margin:6px 16px 0;font-size:11px">Drag rows (or use the arrows) to rearrange the order.</p>`;
  }
  html += `<div class="queue-actions"><span class="muted" style="font-size:12px">${items.length} song${items.length !== 1 ? "s" : ""}${p.shuffle ? " · shuffle on" : ""}${p.repeat !== "off" ? " · repeat " + p.repeat : ""}</span></div></div></div>`;
  const backdrop = document.createElement("div");
  backdrop.innerHTML = html;
  const el = backdrop.firstElementChild;
  document.body.append(el);
  bindQueueModal(el);
}

function bindQueueModal(el) {
  // el IS the [data-queue-backdrop] element — querySelector only sees
  // descendants, so the old code got null here and threw, leaving every
  // control after the close button permanently dead.
  el.onclick = (e) => {
    if (e.target === el) el.remove();
  };
  const close = el.querySelector("[data-queue-close]");
  if (close) close.onclick = () => el.remove();
  const clear = el.querySelector("[data-queue-clear]");
  if (clear)
    clear.onclick = () => {
      // Keep the music playing: the current track finishes, then the whole
      // library loops on as the queue (handled in engine advance()).
      clearQueue();
      el.remove();
      renderNowPlaying();
      if (state.tab === "sounds") renderSounds();
    };
  el.querySelectorAll("[data-queue-play]").forEach((btn) => {
    btn.onclick = (e) => {
      if (e.target.closest("[data-queue-rm], [data-queue-up], [data-queue-down], [data-queue-grip]")) return;
      const idx = parseInt(btn.dataset.queuePlay, 10);
      const p = getPlayerState();
      if (p.queue[idx]) {
        savePlayerState({ index: idx });
        startPlayback(p.queue[idx], { startInQueue: false });
        el.remove();
      }
    };
  });
  el.querySelectorAll("[data-queue-rm]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.queueRm, 10);
      removeFromQueue(idx);
      openQueueModal(); // re-render with fresh indices
      renderNowPlaying();
    };
  });
  el.querySelectorAll("[data-queue-up]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const i = parseInt(btn.dataset.queueUp, 10);
      if (i > 0) {
        reorderQueue(i, i - 1);
        openQueueModal();
        renderNowPlaying();
      }
    };
  });
  el.querySelectorAll("[data-queue-down]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const i = parseInt(btn.dataset.queueDown, 10);
      const p = getPlayerState();
      if (i < p.queue.length - 1) {
        reorderQueue(i, i + 1);
        openQueueModal();
        renderNowPlaying();
      }
    };
  });
  bindQueueDrag(el);
}

// Drag-and-drop reordering for the Up Next list.
function bindQueueDrag(el) {
  let dragIdx = -1;
  const rows = () => [...el.querySelectorAll("[data-queue-item]")];
  rows().forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragIdx = parseInt(row.dataset.queueItem, 10);
      row.classList.add("dragging");
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(dragIdx));
      } catch { /* ignore */ }
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      rows().forEach((r) => r.classList.remove("drop-above", "drop-below"));
      dragIdx = -1;
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (dragIdx < 0) return;
      try { e.dataTransfer.dropEffect = "move"; } catch { /* ignore */ }
      const target = parseInt(row.dataset.queueItem, 10);
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      row.classList.toggle("drop-above", before && target !== dragIdx);
      row.classList.toggle("drop-below", !before && target !== dragIdx);
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-above", "drop-below"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragIdx < 0) return;
      const target = parseInt(row.dataset.queueItem, 10);
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      let to = before ? target : target + 1;
      if (to > dragIdx) to -= 1;
      if (to !== dragIdx) {
        reorderQueue(dragIdx, to);
        openQueueModal();
        renderNowPlaying();
      }
    });
  });
}

function updateNowPlaying() {
  const bar = $("#now-playing");
  if (!bar) return;
  const st = getPlaybackState();
  const track = st.current;
  if (!track) { bar.remove(); return; }
  const toggle = $("[data-np-toggle]", bar);
  if (toggle) {
    const paused = !st.playing;
    toggle.innerHTML = paused ? sicon("play") : sicon("pause");
    toggle.title = paused ? "Play" : "Pause";
  }
  const time = $("[data-np-current]", bar);
  if (time) time.textContent = fmtClock(st.currentTime);
  const dur = $("[data-np-duration]", bar);
  if (dur) dur.textContent = fmtClock(st.duration || track.duration);
  const seek = $("[data-np-seek]", bar);
  if (seek && !seek.dataset.scrub && st.duration > 0) {
    seek.value = Math.round((st.currentTime / st.duration) * 1000);
  }
}

let songQuery = "";
function songHaystack(s) {
  return `${s.title || ""} ${s.artist || ""} ${s.album || ""} ${s.fileName || s.name || ""}`.toLowerCase();
}
function visibleSongs() {
  const q = songQuery.trim().toLowerCase();
  const tab = state.songFilter || "all";
  let list = state.songs || [];
  if (tab === "favorites") list = list.filter((s) => isFavorite(s.id));
  else if (tab === "recent") {
    const p = getPlayerState();
    list = (p.history || []).map((id) => list.find((s) => s.id === id)).filter(Boolean);
  }
  if (!q) return list;
  return list.filter((s) => {
    try { return songHaystack(s).includes(q); } catch { return true; }
  });
}
function songRow(s) {
  const st = getPlaybackState();
  const isCurrent = st.current && st.current.id === s.id;
  const isPlaying = isCurrent && st.playing;
  const sub = s.missing
    ? "Audio missing — the browser removed it to free space"
    : `${s.artist ? esc(s.artist) + " · " : ""}${s.duration ? fmtClock(s.duration) : "--:--"}`;
  const playBtn = s.missing
    ? `<button class="ghost" data-song-reimport="${s.id}">Re-import</button>`
    : `<button class="ghost" data-song-play="${s.id}">${isPlaying ? "Pause" : "Play"}</button>`;
  const dlBtn = s.missing
    ? ""
    : `<button class="ghost" data-song-dl="${s.id}" title="Download">⤓</button>`;
  const queueBtns = s.missing
    ? ""
    : `<button class="ghost" data-song-next="${s.id}" title="Play next">${sicon("skip-forward")} Next</button><button class="ghost" data-song-queue="${s.id}" title="Add to queue">${sicon("list")} Queue</button>`;
  return `<div class="song${isCurrent ? " active" : ""}${s.missing ? " missing" : ""}"><span class="song-art" aria-hidden="true">${sicon(s.missing ? "warn" : "music")}</span><span class="song-meta"><strong class="song-title" title="${esc(s.title)}">${esc(s.title)}</strong><small class="muted">${sub}</small></span><span class="song-dur">${s.missing ? "⚠" : s.duration ? fmtClock(s.duration) : "--:--"}</span><span class="song-btns">${playBtn}${queueBtns}${dlBtn}<button class="ghost" data-song-del="${s.id}" title="Remove from library">×</button></span></div>`;
}

function songListMarkup() {
  const total = (state.songs || []).length;
  if (!total) return '<p class="muted">No personal songs imported yet.</p>';
  const shown = visibleSongs();
  if (!shown.length) return `<div class="empty-state song-empty"><div class="emoji">${sicon("search")}</div><h3>No songs found</h3><p class="muted">Nothing in your library matches "${esc(songQuery.trim())}". Try a different title, artist, or file name.</p></div>`;
  return shown.map(songRow).join("");
}
function renderSongList() {
  const box = $("#song-list");
  if (!box) return;
  box.innerHTML = songListMarkup();
  bindSongRows(box);
}

function renderSounds() {
  const t = $("#tab-sounds");
  if (!t) return;
  const searchHadFocus = document.activeElement?.id === "song-search";
  const visible =
    state.soundFilter === "All"
      ? sounds
      : sounds.filter((s) => s[3] === state.soundFilter);
  const favCount = getFavorites().length;
  const recentCount = getRecentlyPlayed().length;
  const p = getPlayerState();
  t.innerHTML = `${viewHead("Sound studio", "Layer ambient sound, keep your own music close, and build an environment that helps your attention settle.")}${mixerMarkup()}<div class="sound-layout"><div><div class="filter-bar">${["All", "Nature", "Noise", "Binaural"].map((x) => `<button class="filter ${state.soundFilter === x ? "active" : ""}" data-sound-filter="${x}">${x}</button>`).join("")}</div><div class="grid">${visible.map((s) => `<div class="card sound-card"><div class="sound-icon">${s[1].startsWith("Rain") ? sicon("rain") : s[2]}</div><div><h3>${s[1]}</h3><p class="muted">${s[3]} soundscape for study</p></div><div class="sound-controls">${iconStar("sound-" + s[0])}<button class="icon-btn" data-sound="${s[0]}">${state.soundMix[s[0]] != null ? "Ⅱ" : sicon("play")}</button></div></div>`).join("")}</div></div><div class="card"><div class="section-row"><h2>Song library</h2><label class="primary" style="font-size:12px;padding:9px 12px">Import songs<input id="song-input" type="file" accept="audio/*" multiple hidden></label></div><p class="muted">Bring your own music into the focus desk. Files are stored in this browser and kept between visits.</p><div class="song-search"><span class="song-search-ico" aria-hidden="true">${sicon("search")}</span><input class="input" id="song-search" placeholder="Search your songs…" value="${esc(songQuery)}" aria-label="Search imported songs" autocomplete="off"><button class="icon-btn song-search-clear" data-song-clear title="Clear search" aria-label="Clear search"${songQuery.trim() ? "" : " hidden"}>${sicon("x")}</button></div><div class="song-list" id="song-list">${songListMarkup()}</div><div class="song-tabs"><button class="filter ${(state.songFilter || "all") === "all" ? "active" : ""}" data-song-tab="all">All (${(state.songs || []).length})</button><button class="filter ${state.songFilter === "favorites" ? "active" : ""}" data-song-tab="favorites">Favorites (${favCount})</button><button class="filter ${state.songFilter === "recent" ? "active" : ""}" data-song-tab="recent">Recently Played (${recentCount})</button></div></div></div></div>`;
  $$("[data-sound-filter]", t).forEach(
    (b) =>
      (b.onclick = () => {
        state.soundFilter = b.dataset.soundFilter;
        renderSounds();
      }),
  );
  $$("[data-sound]", t).forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.sound;
        if (state.soundMix[id] != null) {
          stopLayer(id);
          delete state.soundMix[id];
        } else if (startLayer(id, 0.7)) {
          state.soundMix[id] = 0.7;
        }
        persist();
        renderSounds();
      }),
  );
  $$("[data-song-tab]", t).forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.songTab;
      if (tab === "favorites") state.songFilter = "favorites";
      else if (tab === "recent") state.songFilter = "recent";
      else state.songFilter = "all";
      renderSounds();
    };
  });
  bindMixer(t);
  bindFavorites(t);
  $("#song-input", t).onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    requestPersistentStorage();
    for (const file of files) {
      const problem = validateAudioFile(file);
      if (problem) { notify(problem); continue; }
      // Re-importing replaces the missing track in place (same id) so queue,
      // favorites and history entries keep working.
      const replaceIdx = reimportTargetId
        ? (state.songs || []).findIndex((s) => s.id === reimportTargetId)
        : -1;
      const id = replaceIdx >= 0 ? reimportTargetId : uid();
      reimportTargetId = null;
      try {
        await songBlobPut(id, file);
      } catch {
        // The write genuinely failed — say so instead of keeping a memory-only
        // copy that would vanish on the next page load.
        notify(`Couldn't store "${esc(cleanSongName(file.name))}" — free up space and try again`);
        continue;
      }
      if (replaceIdx >= 0) {
        const entry = state.songs[replaceIdx];
        entry.size = file.size;
        entry.type = file.type || "";
        entry.duration = 0;
        entry.playing = false;
        delete entry.missing;
      } else {
        state.songs.push({
          id,
          name: cleanSongName(file.name),
          title: cleanSongName(file.name),
          fileName: file.name,
          size: file.size,
          type: file.type || "",
          duration: 0,
          playing: false,
          imported: true,
        });
      }
      persist();
      probeDuration(id);
      renderSounds();
      renderNowPlaying();
      notify(`Imported "${esc(cleanSongName(file.name))}"`);
    }
  };
  bindSongRows(t);
  const searchInput = $("#song-search", t);
  const clearBtn = $("[data-song-clear]", t);
  const syncClear = () => {
    if (clearBtn) clearBtn.hidden = !songQuery.trim();
  };
  if (searchInput) {
    searchInput.oninput = () => {
      songQuery = searchInput.value;
      renderSongList();
      syncClear();
    };
    if (clearBtn) clearBtn.onclick = () => {
      songQuery = "";
      searchInput.value = "";
      renderSongList();
      syncClear();
      searchInput.focus();
    };
  }
  if (searchHadFocus && songQuery) {
    const si = $("#song-search", t);
    if (si) {
      si.focus();
      try { si.setSelectionRange(si.value.length, si.value.length); } catch { /* ignore */ }
    }
  }
}
function bindSongRows(root) {
  $$("[data-song-play]", root).forEach(
    (b) => (b.onclick = () => toggleSong(b.dataset.songPlay)),
  );
  $$("[data-song-next]", root).forEach(
    (b) =>
      (b.onclick = () => {
        playNextInQueue(b.dataset.songNext);
        notify("Playing next");
        renderNowPlaying();
      }),
  );
  $$("[data-song-queue]", root).forEach(
    (b) =>
      (b.onclick = () => {
        addToQueue(b.dataset.songQueue);
        notify("Added to queue");
        renderNowPlaying();
      }),
  );
  $$("[data-song-dl]", root).forEach(
    (b) =>
      (b.onclick = async () => {
        const song = state.songs.find((s) => s.id === b.dataset.songDl);
        if (!song) return;
        const blob = await songBlobGet(song.id);
        if (!blob) return notify("Audio data is missing — please re-import");
        try {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = song.name;
          document.body.append(a);
          a.click();
          setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
          }, 4000);
        } catch {
          notify("Download failed in this browser");
        }
      }),
  );
  $$("[data-song-del]", root).forEach(
    (b) =>
      (b.onclick = () =>
        confirmBox("Remove this track?", "The audio file leaves your library for good.", async () => {
          const song = state.songs.find((s) => s.id === b.dataset.songDel);
          if (!song) return;
          if (song.playing) stopPlayback();
          await songBlobDelete(song.id);
          state.songs = state.songs.filter((s) => s.id !== song.id);
          persist();
          renderSounds();
          renderNowPlaying();
        })),
  );
  $$("[data-song-reimport]", root).forEach((btn) => {
    btn.onclick = () => {
      const input = $("#song-input");
      if (!input) return notify("Open the Sounds tab to re-import");
      reimportTargetId = btn.dataset.songReimport;
      input.click();
    };
  });
}

function ambientReady() {
  try {
    if (!ambientContext) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      ambientContext = new Ctor();
      ambientMaster = ambientContext.createGain();
      ambientMaster.gain.value = state.soundVolume ?? 0.8;
      ambientMaster.connect(ambientContext.destination);
      const len = ambientContext.sampleRate * 2;
      const white = ambientContext.createBuffer(1, len, ambientContext.sampleRate);
      const brown = ambientContext.createBuffer(1, len, ambientContext.sampleRate);
      const wd = white.getChannelData(0);
      const bd = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        wd[i] = w;
        last = (last + 0.02 * w) / 1.02;
        bd[i] = last * 3.5;
      }
      noiseBufs = { white, brown };
    }
    if (ambientContext.state === "suspended") ambientContext.resume();
    return true;
  } catch {
    return false;
  }
}

function noiseSource(kind) {
  const src = ambientContext.createBufferSource();
  src.buffer = kind === "brown" ? noiseBufs.brown : noiseBufs.white;
  src.loop = true;
  return src;
}

function newLayer(recipeGain) {
  const g = ambientContext.createGain();
  g.gain.value = 0;
  g.connect(ambientMaster);
  const layer = {
    gain: g,
    vol: 0.7,
    recipe: recipeGain,
    timers: [],
    nodes: [],
    stop() {
      layer.timers.forEach((id) => {
        clearInterval(id);
        clearTimeout(id);
      });
      layer.nodes.forEach((n) => {
        try {
          if (n.stop) n.stop();
        } catch {
          /* already stopped */
        }
        try {
          n.disconnect();
        } catch {
          /* already gone */
        }
      });
      try {
        g.disconnect();
      } catch {
        /* already gone */
      }
    },
  };
  return layer;
}

function recipeRain(layer) {
  const g = layer.gain;
  const track = (n) => {
    layer.nodes.push(n);
    return n;
  };
  const src = track(noiseSource("white"));
  src.start();
  const bp = track(ambientContext.createBiquadFilter());
  bp.type = "bandpass";
  bp.frequency.value = 2600;
  bp.Q.value = 0.45;
  src.connect(bp);
  bp.connect(g);
  const hiss = track(noiseSource("white"));
  hiss.start();
  const hp = track(ambientContext.createBiquadFilter());
  hp.type = "highpass";
  hp.frequency.value = 6500;
  const hissG = track(ambientContext.createGain());
  hissG.gain.value = 0.12;
  hiss.connect(hp);
  hp.connect(hissG);
  hissG.connect(g);
  const lfo = track(ambientContext.createOscillator());
  lfo.type = "sine";
  lfo.frequency.value = 0.13;
  const lfoG = track(ambientContext.createGain());
  lfoG.gain.value = 0.08;
  lfo.connect(lfoG);
  lfoG.connect(g.gain);
  lfo.start();
  layer.recipe = 0.5;
}

function recipeFire(layer) {
  const g = layer.gain;
  const track = (n) => {
    layer.nodes.push(n);
    return n;
  };
  const low = track(noiseSource("brown"));
  low.start();
  const lp = track(ambientContext.createBiquadFilter());
  lp.type = "lowpass";
  lp.frequency.value = 420;
  low.connect(lp);
  lp.connect(g);
  const crackle = track(noiseSource("white"));
  crackle.start();
  const hp = track(ambientContext.createBiquadFilter());
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const popBus = track(ambientContext.createGain());
  popBus.gain.value = 0;
  crackle.connect(hp);
  hp.connect(popBus);
  popBus.connect(g);
  layer.timers.push(
    setInterval(() => {
      if (!ambientContext) return;
      if (Math.random() < 0.55) {
        const t = ambientContext.currentTime;
        const peak = 0.15 + Math.random() * 0.5;
        try {
          popBus.gain.cancelScheduledValues(t);
          popBus.gain.setValueAtTime(Math.max(0.0001, popBus.gain.value), t);
          popBus.gain.linearRampToValueAtTime(peak, t + 0.015);
          popBus.gain.exponentialRampToValueAtTime(
            0.0001,
            t + 0.09 + Math.random() * 0.12,
          );
        } catch {
          /* busy */
        }
      }
    }, 110),
  );
  layer.recipe = 0.55;
}

function recipeOcean(layer) {
  const g = layer.gain;
  const track = (n) => {
    layer.nodes.push(n);
    return n;
  };
  const src = track(noiseSource("brown"));
  src.start();
  const lp = track(ambientContext.createBiquadFilter());
  lp.type = "lowpass";
  lp.frequency.value = 480;
  lp.Q.value = 0.5;
  src.connect(lp);
  lp.connect(g);
  const lfo = track(ambientContext.createOscillator());
  lfo.type = "sine";
  lfo.frequency.value = 0.07;
  const lfoG = track(ambientContext.createGain());
  lfoG.gain.value = 0.22;
  lfo.connect(lfoG);
  lfoG.connect(g.gain);
  lfo.start();
  layer.recipe = 0.6;
}

function recipeForest(layer) {
  const g = layer.gain;
  const track = (n) => {
    layer.nodes.push(n);
    return n;
  };
  const src = track(noiseSource("white"));
  src.start();
  const lp = track(ambientContext.createBiquadFilter());
  lp.type = "lowpass";
  lp.frequency.value = 900;
  src.connect(lp);
  lp.connect(g);
  const chirp = () => {
    try {
      const osc = ambientContext.createOscillator();
      const env = ambientContext.createGain();
      const base = 2400 + Math.random() * 1200;
      const t = ambientContext.currentTime;
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.72, t + 0.22);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.09, t + 0.04);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(env);
      env.connect(g);
      osc.onended = () => {
        [osc, env].forEach((n) => {
          const i = layer.nodes.indexOf(n);
          if (i > -1) layer.nodes.splice(i, 1);
        });
      };
      layer.nodes.push(osc, env);
      osc.start(t);
      osc.stop(t + 0.35);
    } catch {
      /* busy */
    }
  };
  const schedule = () => {
    if (Math.random() < 0.65) chirp();
    layer.timers.push(setTimeout(schedule, 2800 + Math.random() * 5200));
  };
  schedule();
  layer.recipe = 0.32;
}

function recipeNoise(layer, kind) {
  const src = noiseSource(kind === "brown" ? "brown" : "white");
  layer.nodes.push(src);
  src.start();
  if (kind === "pink") {
    const lp = ambientContext.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3500;
    layer.nodes.push(lp);
    src.connect(lp);
    lp.connect(layer.gain);
    layer.recipe = 0.1;
  } else if (kind === "brown") {
    src.connect(layer.gain);
    layer.recipe = 0.25;
  } else {
    src.connect(layer.gain);
    layer.recipe = 0.06;
  }
}

function recipeBinaural(layer, beat) {
  const base = beat === "gamma" ? 180 : 200;
  const diff = beat === "gamma" ? 40 : 10;
  const mk = (freq, pan) => {
    const osc = ambientContext.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const p = ambientContext.createStereoPanner
      ? ambientContext.createStereoPanner()
      : null;
    layer.nodes.push(osc);
    osc.start();
    if (p) {
      p.pan.value = pan;
      layer.nodes.push(p);
      osc.connect(p);
      p.connect(layer.gain);
    } else {
      osc.connect(layer.gain);
    }
  };
  mk(base, -0.9);
  mk(base + diff, 0.9);
  layer.recipe = beat === "gamma" ? 0.045 : 0.05;
}

const SOUND_EQUIP = {
  "rain-pack": "rain",
  campfire: "fire",
  "forest-pack": "forest",
  "brown-pack": "brown",
  "ocean-pack": "ocean",
  thunder: "thunder",
};

function recipeThunder(layer) {
  const g = layer.gain;
  const track = (n) => {
    layer.nodes.push(n);
    return n;
  };
  const src = track(noiseSource("brown"));
  src.start();
  const lp = track(ambientContext.createBiquadFilter());
  lp.type = "lowpass";
  lp.frequency.value = 200;
  src.connect(lp);
  lp.connect(g);
  const boom = () => {
    try {
      const osc = ambientContext.createOscillator();
      const env = ambientContext.createGain();
      const t = ambientContext.currentTime;
      osc.type = "sine";
      osc.frequency.setValueAtTime(58, t);
      osc.frequency.exponentialRampToValueAtTime(34, t + 1.1);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      osc.connect(env);
      env.connect(g);
      osc.onended = () => {
        [osc, env].forEach((n) => {
          const i = layer.nodes.indexOf(n);
          if (i > -1) layer.nodes.splice(i, 1);
        });
      };
      layer.nodes.push(osc, env);
      osc.start(t);
      osc.stop(t + 1.8);
    } catch {
      /* busy */
    }
    layer.timers.push(setTimeout(boom, 7000 + Math.random() * 9000));
  };
  boom();
  layer.recipe = 0.5;
}

function buildLayer(id) {
  const layer = newLayer(0.3);
  if (id === "rain") recipeRain(layer);
  else if (id === "fire") recipeFire(layer);
  else if (id === "ocean") recipeOcean(layer);
  else if (id === "forest") recipeForest(layer);
  else if (id === "white" || id === "pink" || id === "brown") recipeNoise(layer, id);
  else if (id === "alpha") recipeBinaural(layer, "alpha");
  else if (id === "gamma") recipeBinaural(layer, "gamma");
  else if (id === "thunder") recipeThunder(layer);
  else {
    layer.stop();
    return null;
  }
  return layer;
}

function applyLayerGain(id) {
  const layer = ambientLayers[id];
  if (!layer || !ambientContext) return;
  const target = layer.recipe * layer.vol * (mixDucked ? DUCK_LEVEL : 1);
  try {
    layer.gain.gain.setTargetAtTime(target, ambientContext.currentTime, 0.5);
  } catch {
    /* busy */
  }
}

function startLayer(id, vol) {
  if (!ambientReady()) {
    notify("Audio is unavailable in this browser");
    return false;
  }
  stopLayer(id);
  const layer = buildLayer(id);
  if (!layer) return false;
  layer.vol = vol ?? 0.7;
  ambientLayers[id] = layer;
  applyLayerGain(id);
  return true;
}

function stopLayer(id) {
  const layer = ambientLayers[id];
  if (!layer) return;
  try {
    layer.gain.gain.setTargetAtTime(0, ambientContext.currentTime, 0.15);
  } catch {
    /* busy */
  }
  setTimeout(() => {
    try {
      layer.stop();
    } catch {
      /* already gone */
    }
  }, 600);
  delete ambientLayers[id];
}

function stopAllLayers() {
  Object.keys(ambientLayers).forEach(stopLayer);
}

function setDuck(ducked) {
  mixDucked = Boolean(ducked);
  Object.keys(ambientLayers).forEach(applyLayerGain);
}

function ensureMixPlaying() {
  if (!ambientReady()) return;
  Object.entries(state.soundMix || {}).forEach(([id, vol]) => {
    if (!ambientLayers[id]) startLayer(id, vol);
  });
  Object.keys(ambientLayers).forEach((id) => {
    if (state.soundMix[id] == null) stopLayer(id);
  });
}

function applyLinkToTimer() {
  if (!state.linkSound) return;
  ensureMixPlaying();
  setDuck(state.mode !== "focus");
}

function setMasterVolume(v) {
  state.soundVolume = Math.min(1, Math.max(0, v));
  if (ambientMaster && ambientContext) {
    try {
      ambientMaster.gain.setTargetAtTime(
        state.soundVolume,
        ambientContext.currentTime,
        0.2,
      );
    } catch {
      /* busy */
    }
  }
}

function stopAmbient() {
  stopAllLayers();
}

function startAmbient(soundId) {
  if (startLayer(soundId, 0.7)) state.activeSound = soundId;
}

export {
  chimeCtx, warmAudio, CHIMES, playChime, ambientContext, ambientMaster,
  noiseBufs, ambientLayers, mixDucked, DUCK_LEVEL, mixerMarkup, bindMixer,
  songBlobs, songUrls, songDbPromise, songDb, songBlobPut, songBlobGet,
  songBlobDelete, songObjectUrl, migrateSongs, AUDIO_EXTS, validateAudioFile,
  cleanSongName, playSong, toggleSong, resumeTrack, advanceTrack, stopPlayback,
  probeDuration, songFormat, renderNowPlaying, bindNowPlaying, updateNowPlaying,
  renderSounds, sounds, ambientReady, noiseSource, newLayer, recipeRain, recipeFire,
  recipeOcean, recipeForest, recipeNoise, recipeBinaural, SOUND_EQUIP,
  recipeThunder, buildLayer, applyLayerGain, startLayer, stopLayer, stopAllLayers,
  setDuck, ensureMixPlaying, applyLinkToTimer, setMasterVolume, stopAmbient,
  startAmbient, resumeLiveAudio, clearSongDatabase,
};
