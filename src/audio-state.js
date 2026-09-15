import { state, save, persist, uid, get } from "./core.js";

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
};

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
  if (p.shuffle && p.queue.length > 1) {
    const currentId = p.queue[p.index];
    const others = p.queue.filter((_, i) => i !== p.index);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    p.queue = currentId ? [currentId, ...others] : others;
    p.index = currentId ? 0 : -1;
  }
  savePlayerStorage();
  return p.shuffle;
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
