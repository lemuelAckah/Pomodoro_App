import { state, save, persist, uid, get } from "./core.js";
import { mirrorSongFavorites } from "./services/music-sync.js";

export const PLAYER_DEFAULTS = {
  repeat: "off",
  shuffle: false,
  speed: 1,
  muted: false,
  volume: 0.8,
  queue: [],
  index: -1,
  favorites: [],
  history: [],
  playlists: {},
  resume: null, // { trackId, pos } — last paused position, for cross-session resume
};

const MAX_PLAYLISTS = 50;
const MAX_PLAYLIST_TRACKS = 500;
const MAX_PLAYLIST_NAME = 80;
const MAX_PLAYLIST_DESC = 300;

// Built-in cover art presets (gradient + icon, no uploads needed).
export const PLAYLIST_COVERS = [
  { id: "sunset", label: "Sunset" },
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
  { id: "grape", label: "Grape" },
  { id: "ember", label: "Ember" },
  { id: "slate", label: "Slate" },
  { id: "rose", label: "Rose" },
  { id: "gold", label: "Gold" },
];

export function validPlaylistCover(id) {
  return PLAYLIST_COVERS.some((c) => c.id === id) ? id : "sunset";
}

function cleanPlaylistName(name) {
  // Control characters and excess whitespace break card layouts — strip them.
  return String(name || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PLAYLIST_NAME);
}

function cleanPlaylistDesc(desc) {
  return String(desc || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_PLAYLIST_DESC);
}

function playlistsStore() {
  const p = ensurePlayerState();
  if (!p.playlists || typeof p.playlists !== "object") p.playlists = {};
  // Normalize legacy rows (pre-description/cover) without persisting —
  // callers persist on real mutations only, so this can't loop.
  for (const pl of Object.values(p.playlists)) {
    if (!pl || typeof pl !== "object") continue;
    if (typeof pl.name !== "string" || !pl.name) pl.name = "Untitled playlist";
    if (typeof pl.description !== "string") pl.description = "";
    if (typeof pl.cover !== "string" || !pl.cover) pl.cover = "sunset";
    if (!Array.isArray(pl.songIds)) pl.songIds = [];
  }
  return p.playlists;
}

function ensurePlayerState() {
  if (!state.player || typeof state.player !== "object") state.player = {};
  const p = state.player;
  p.repeat = ["off", "all", "one"].includes(p.repeat) ? p.repeat : "off";
  p.shuffle = Boolean(p.shuffle);
  p.speed = [0.5, 0.75, 1, 1.25, 1.5, 2].includes(p.speed) ? p.speed : 1;
  p.muted = Boolean(p.muted);
  p.volume = typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : (state.playerVol ?? 0.8);
  p.queue = Array.isArray(p.queue) ? p.queue : [];
  p.index = Number.isFinite(p.index) ? p.index : -1;
  p.history = Array.isArray(p.history) ? p.history.slice(-100) : [];
  p.playlists = p.playlists && typeof p.playlists === "object" ? p.playlists : {};
  if (p.resume && (typeof p.resume.trackId !== "string" || !Number.isFinite(+p.resume.pos))) p.resume = null;
  if (p.preShuffle && !Array.isArray(p.preShuffle.queue)) p.preShuffle = null;
  if (!Array.isArray(p.favorites)) p.favorites = [];
  return p;
}

export function getPlayerState() {
  return ensurePlayerState();
}

export function savePlayerState(patch = {}) {
  Object.assign(ensurePlayerState(), patch);
  state.player = ensurePlayerState();
  persist();
  savePlayerStorage();
}

export function savePlayerStorage() {
  const p = ensurePlayerState();
  save("sf-player", {
    vol: p.volume,
    track: (state.songs || []).find((s) => s.playing)?.id || state.playerTrack || null,
    repeat: p.repeat,
    shuffle: p.shuffle,
    speed: p.speed,
    muted: p.muted,
    volume: p.volume,
    index: p.index,
    queue: p.queue,
    favorites: p.favorites,
    history: p.history,
    playlists: p.playlists,
    resume: p.resume,
    preShuffle: p.preShuffle && Array.isArray(p.preShuffle.queue) ? p.preShuffle : null,
  });
}

export function hydratePlayerFromStorage() {
  const raw = get("sf-player", {});
  const p = ensurePlayerState();
  p.favorites = Array.isArray(raw.favorites) ? raw.favorites : [];
  p.repeat = ["off", "all", "one"].includes(raw.repeat) ? raw.repeat : "off";
  p.shuffle = Boolean(raw.shuffle);
  p.speed = [0.5, 0.75, 1, 1.25, 1.5, 2].includes(raw.speed) ? raw.speed : 1;
  p.muted = Boolean(raw.muted);
  p.volume = typeof raw.volume === "number" ? Math.min(1, Math.max(0, raw.volume)) : 0.8;
  p.queue = Array.isArray(raw.queue) ? raw.queue : [];
  p.index = Number.isFinite(raw.index) ? raw.index : -1;
  p.history = Array.isArray(raw.history) ? raw.history.slice(-100) : [];
  p.playlists = raw.playlists && typeof raw.playlists === "object" ? raw.playlists : {};
  p.resume =
    raw.resume && typeof raw.resume.trackId === "string" && Number.isFinite(+raw.resume.pos)
      ? { trackId: raw.resume.trackId, pos: Math.max(0, +raw.resume.pos) }
      : null;
  p.preShuffle =
    raw.preShuffle && Array.isArray(raw.preShuffle.queue) ? raw.preShuffle : null;
  state.player = p;
  state.playerVol = p.volume;
  if (p.queue[p.index]) state.playerTrack = p.queue[p.index];
}

export function toggleFavorite(songId) {
  const p = ensurePlayerState();
  const idx = p.favorites.indexOf(songId);
  if (idx >= 0) {
    p.favorites.splice(idx, 1);
  } else {
    p.favorites.push(songId);
  }
  const song = (state.songs || []).find((s) => s.id === songId);
  if (song) song.liked = isFavorite(songId);
  persist();
  savePlayerStorage();
  // Discrete user gesture: mirror the single row best-effort (never throws).
  try {
    mirrorSongFavorites(songId, isFavorite(songId));
  } catch {
    /* offline applies on next pull */
  }
  return isFavorite(songId);
}

export function isFavorite(songId) {
  const p = ensurePlayerState();
  return p.favorites.indexOf(songId) >= 0;
}

export function getFavorites() {
  const p = ensurePlayerState();
  return p.favorites.map((id) => (state.songs || []).find((s) => s.id === id)).filter(Boolean);
}

export function addToHistory(songId) {
  const p = ensurePlayerState();
  p.history = p.history.filter((id) => id !== songId);
  p.history.unshift(songId);
  if (p.history.length > 100) p.history = p.history.slice(0, 100);
  savePlayerStorage();
}

export function getRecentlyPlayed() {
  const p = ensurePlayerState();
  return p.history.map((id) => (state.songs || []).find((s) => s.id === id)).filter(Boolean);
}

export function setQueue(queue, index = 0) {
  const p = ensurePlayerState();
  p.queue = [...queue];
  p.index = Math.max(0, Math.min(index, Math.max(0, queue.length - 1)));
  savePlayerStorage();
}

export function addToQueue(songId) {
  const p = ensurePlayerState();
  p.queue.push(songId);
  if (p.index < 0) p.index = 0;
  savePlayerStorage();
}

// Insert a song right after the current one (no duplicates) — "Play next".
export function playNextInQueue(songId) {
  const p = ensurePlayerState();
  const without = p.queue.filter((id) => id !== songId);
  const at = p.index >= 0 ? Math.min(p.index + 1, without.length) : 0;
  without.splice(at, 0, songId);
  p.queue = without;
  if (p.index < 0) p.index = 0;
  savePlayerStorage();
}

export function removeFromQueue(index) {
  const p = ensurePlayerState();
  if (index < 0 || index >= p.queue.length) return;
  p.queue.splice(index, 1);
  if (index < p.index) {
    p.index -= 1;
  } else if (index === p.index && p.index >= p.queue.length) {
    p.index = Math.max(0, p.queue.length - 1);
  }
  if (p.queue.length === 0) p.index = -1;
  savePlayerStorage();
}

export function reorderQueue(fromIndex, toIndex) {
  const p = ensurePlayerState();
  if (fromIndex < 0 || fromIndex >= p.queue.length || toIndex < 0 || toIndex >= p.queue.length) return;
  const [item] = p.queue.splice(fromIndex, 1);
  p.queue.splice(toIndex, 0, item);
  if (p.index === fromIndex) {
    p.index = toIndex;
  } else if (fromIndex < p.index && toIndex >= p.index) {
    p.index -= 1;
  } else if (fromIndex > p.index && toIndex <= p.index) {
    p.index += 1;
  }
  savePlayerStorage();
}

export function clearQueue() {
  const p = ensurePlayerState();
  p.queue = [];
  p.index = -1;
  savePlayerStorage();
}

export function getQueue() {
  const p = ensurePlayerState();
  return p.queue.map((id) => (state.songs || []).find((s) => s.id === id)).filter(Boolean);
}

export function getCurrentQueueTrack() {
  const p = ensurePlayerState();
  if (p.index >= 0 && p.index < p.queue.length) {
    const id = p.queue[p.index];
    return (state.songs || []).find((s) => s.id === id) || null;
  }
  // Queue cleared (or index out of range): keep the bar anchored on the last
  // track that played instead of unmounting the whole player.
  return (state.songs || []).find((s) => s.id === state.playerTrack) || null;
}

export function toggleRepeat() {
  const p = ensurePlayerState();
  const cycle = { off: "all", all: "one", one: "off" };
  p.repeat = cycle[p.repeat] || "off";
  savePlayerStorage();
  return p.repeat;
}

export function toggleShuffle() {
  const p = ensurePlayerState();
  p.shuffle = !p.shuffle;
  if (p.shuffle) {
    if (p.queue.length > 1) {
      // Snapshot the predictable order so switching shuffle off restores it
      // exactly (current track keeps playing from its restored slot).
      p.preShuffle = { queue: [...p.queue], index: p.index };
      const currentId = p.queue[p.index];
      const others = p.queue.filter((_, i) => i !== p.index);
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      p.queue = currentId ? [currentId, ...others] : others;
      p.index = currentId ? 0 : -1;
    }
  } else if (p.preShuffle && Array.isArray(p.preShuffle.queue)) {
    const currentId = p.queue[p.index];
    p.queue = [...p.preShuffle.queue];
    const at = currentId ? p.queue.indexOf(currentId) : -1;
    // Current track may have left the queue meanwhile — clamp, never -1
    // while tracks remain (engine treats -1 as "nothing selected").
    p.index = at >= 0 ? at : Math.max(0, Math.min(p.index, p.queue.length - 1));
    if (!p.queue.length) p.index = -1;
    p.preShuffle = null;
  }
  savePlayerStorage();
  return p.shuffle;
}

// Last paused position, for resume-after-pause across sessions.
export function saveResumePos(trackId, pos) {
  const p = ensurePlayerState();
  if (!trackId || !Number.isFinite(+pos) || +pos <= 1) {
    p.resume = null;
  } else {
    p.resume = { trackId: String(trackId), pos: Math.max(0, +pos) };
  }
  savePlayerStorage();
}

export function getResumePos(trackId) {
  const p = ensurePlayerState();
  if (p.resume && p.resume.trackId === trackId && Number.isFinite(+p.resume.pos)) {
    return Math.max(0, +p.resume.pos);
  }
  return 0;
}

export function clearResumePos(trackId) {
  const p = ensurePlayerState();
  if (!trackId || p.resume?.trackId === trackId) {
    p.resume = null;
    savePlayerStorage();
  }
}

export function setSpeed(speed) {
  const s = [0.5, 0.75, 1, 1.25, 1.5, 2].includes(speed) ? speed : 1;
  savePlayerState({ speed: s });
  return s;
}

export function cycleSpeed() {
  const p = ensurePlayerState();
  const speeds = [1, 1.25, 1.5, 2, 0.75, 0.5];
  const idx = speeds.indexOf(p.speed);
  const next = speeds[(idx + 1) % speeds.length];
  return setSpeed(next);
}

export function setVolume(vol) {
  const v = Math.min(1, Math.max(0, vol));
  savePlayerState({ volume: v, muted: v === 0 });
  return v;
}

export function toggleMute() {
  const p = ensurePlayerState();
  const next = !p.muted;
  savePlayerState({ muted: next });
  return next;
}

// --- Playlists ---------------------------------------------------------------
// Shape: { [id]: { id, name, songIds: [], createdAt, updatedAt } }.
// Stored inside player state (localStorage sf-player) + mirrored to Supabase
// by music-sync.js. Duplicates inside one playlist are refused.

export function listPlaylists() {
  const store = playlistsStore();
  return Object.values(store).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function getPlaylist(id) {
  return playlistsStore()[id] || null;
}

export function createPlaylist(name, opts = {}) {
  const clean = cleanPlaylistName(name);
  if (!clean) return { ok: false, error: "Give the playlist a name" };
  const store = playlistsStore();
  if (Object.keys(store).length >= MAX_PLAYLISTS)
    return { ok: false, error: `Playlist limit reached (${MAX_PLAYLISTS})` };
  if (Object.values(store).some((p) => p.name.toLowerCase() === clean.toLowerCase()))
    return { ok: false, error: "A playlist with that name already exists" };
  const now = Date.now();
  const pl = {
    id: uid(),
    name: clean,
    description: cleanPlaylistDesc(opts.description),
    cover: validPlaylistCover(opts.cover),
    songIds: [],
    createdAt: now,
    updatedAt: now,
  };
  store[pl.id] = pl;
  savePlayerState({});
  return { ok: true, playlist: pl };
}

export function updatePlaylist(id, patch = {}) {
  const store = playlistsStore();
  const pl = store[id];
  if (!pl) return { ok: false, error: "Playlist not found" };
  if (patch.name !== undefined) {
    const clean = cleanPlaylistName(patch.name);
    if (!clean) return { ok: false, error: "Give the playlist a name" };
    if (Object.values(store).some((p) => p.id !== id && p.name.toLowerCase() === clean.toLowerCase()))
      return { ok: false, error: "A playlist with that name already exists" };
    pl.name = clean;
  }
  if (patch.description !== undefined) pl.description = cleanPlaylistDesc(patch.description);
  if (patch.cover !== undefined) pl.cover = validPlaylistCover(patch.cover);
  pl.updatedAt = Date.now();
  savePlayerState({});
  return { ok: true, playlist: pl };
}

export function renamePlaylist(id, name) {
  return updatePlaylist(id, { name });
}

export function deletePlaylist(id) {
  const store = playlistsStore();
  if (!store[id]) return false;
  delete store[id];
  savePlayerState({});
  return true;
}

export function addToPlaylist(playlistId, songId) {
  const store = playlistsStore();
  const pl = store[playlistId];
  if (!pl) return { ok: false, error: "Playlist not found" };
  const song = (state.songs || []).find((s) => s.id === songId);
  if (!song) return { ok: false, error: "Song not found" };
  if (pl.songIds.includes(songId)) return { ok: false, error: "Already in this playlist" };
  if (pl.songIds.length >= MAX_PLAYLIST_TRACKS)
    return { ok: false, error: `Playlist is full (${MAX_PLAYLIST_TRACKS} tracks)` };
  pl.songIds.push(songId);
  pl.updatedAt = Date.now();
  savePlayerState({});
  return { ok: true };
}

export function removeFromPlaylist(playlistId, songId) {
  const store = playlistsStore();
  const pl = store[playlistId];
  if (!pl) return false;
  const before = pl.songIds.length;
  pl.songIds = pl.songIds.filter((id) => id !== songId);
  if (pl.songIds.length === before) return false;
  pl.updatedAt = Date.now();
  savePlayerState({});
  return true;
}

export function moveInPlaylist(playlistId, from, to) {
  const store = playlistsStore();
  const pl = store[playlistId];
  if (!pl) return false;
  if (from < 0 || from >= pl.songIds.length || to < 0 || to >= pl.songIds.length) return false;
  if (from === to) return true;
  const [id] = pl.songIds.splice(from, 1);
  pl.songIds.splice(to, 0, id);
  pl.updatedAt = Date.now();
  savePlayerState({});
  return true;
}

export function playlistSongs(playlistId) {
  const pl = getPlaylist(playlistId);
  if (!pl) return [];
  return pl.songIds
    .map((id) => (state.songs || []).find((s) => s.id === id))
    .filter(Boolean);
}

// Remove every local reference to a song: queue, favorites, history,
// playlists. Callers still delete the blob + library row themselves.
export function purgeSongEverywhere(songId) {
  const p = ensurePlayerState();
  let touched = false;
  if (p.queue.includes(songId)) {
    const at = p.index >= 0 ? p.queue[p.index] : null;
    p.queue = p.queue.filter((id) => id !== songId);
    p.index = at ? p.queue.indexOf(at) : -1;
    if (p.index < -1) p.index = -1;
    if (!p.queue.length) p.index = -1;
    touched = true;
  }
  if (p.preShuffle && p.preShuffle.queue.includes(songId)) {
    p.preShuffle.queue = p.preShuffle.queue.filter((id) => id !== songId);
    touched = true;
  }
  const favAt = p.favorites.indexOf(songId);
  if (favAt >= 0) {
    p.favorites.splice(favAt, 1);
    touched = true;
  }
  if (p.history.includes(songId)) {
    p.history = p.history.filter((id) => id !== songId);
    touched = true;
  }
  Object.values(playlistsStore()).forEach((pl) => {
    if (pl.songIds.includes(songId)) {
      pl.songIds = pl.songIds.filter((id) => id !== songId);
      pl.updatedAt = Date.now();
      touched = true;
    }
  });
  if (p.resume?.trackId === songId) {
    p.resume = null;
    touched = true;
  }
  if (touched) savePlayerState({});
  return touched;
}
