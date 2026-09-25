/* music-sync.js — Phase 5 cloud persistence for track metadata + playlists.
 *
 * Model mirrors productivity-sync.js: localStorage + IndexedDB stay the
 * immediate store (offline-first UI unchanged); this layer mirrors the same
 * metadata to Supabase for signed-in users.
 *
 * Audio binaries NEVER leave the device (IndexedDB only, by product design).
 * Cloud rows carry metadata + playlist membership; per-device audio presence
 * is verified locally (tracks without local audio show as missing /
 * re-importable). The `missing` flag is therefore never merged from the
 * cloud — only the boot-time library repair sets it.
 *
 * - Mutations call mirrorMusicTracks()/mirrorPlaylists(): ONE debounced
 *   upsert per dataset.
 * - Deletes go through a durable queue (sf-music-outbox) so an offline
 *   delete still lands after reconnect.
 * - pullMusic() merges cloud rows with local by `updated` timestamp
 *   (last-writer-wins per row); rows are keyed by client id so two devices
 *   converge without duplicates.
 * - All failures are silent-safe: local data is never erased.
 */

import { state, get, save, persist } from "../core.js"
import { backendConfigured } from "./backend.js"
import {
  cloudListMusicTracks,
  cloudUpsertMusicTracks,
  cloudDeleteMusicTrack,
  cloudListPlaylists,
  cloudUpsertPlaylists,
  cloudDeletePlaylist,
  cloudSetSongFavorite,
  cloudListSongFavorites,
} from "./backend.js"

const OUTBOX_KEY = "sf-music-outbox"
const outbox = get(OUTBOX_KEY, { tracks: [], playlists: [] })
let flushTimer = null
const timers = {}
const inflight = {}

const online = () => navigator.onLine !== false
const canSync = () => backendConfigured && state.user && online()

// --- outbox (durable deletes) ------------------------------------------------

function queueOutbox(kind, id) {
  const list = outbox[kind] || (outbox[kind] = [])
  if (!list.includes(id)) list.push(id)
  save(OUTBOX_KEY, outbox)
  scheduleFlush()
}

async function flushOutbox() {
  if (!canSync()) return
  const trackIds = outbox.tracks || []
  const playlistIds = outbox.playlists || []
  if (!trackIds.length && !playlistIds.length) return
  outbox.tracks = []
  outbox.playlists = []
  save(OUTBOX_KEY, outbox)
  const results = await Promise.allSettled([
    ...trackIds.map((id) => cloudDeleteMusicTrack(id)),
    ...playlistIds.map((id) => cloudDeletePlaylist(id)),
  ])
  const stillDead = { tracks: [], playlists: [] }
  results.forEach((r, i) => {
    if (r.status === "rejected" || r.value?.error) {
      if (i < trackIds.length) stillDead.tracks.push(trackIds[i])
      else stillDead.playlists.push(playlistIds[i - trackIds.length])
    }
  })
  if (stillDead.tracks.length || stillDead.playlists.length) {
    outbox.tracks = [...(outbox.tracks || []), ...stillDead.tracks]
    outbox.playlists = [...(outbox.playlists || []), ...stillDead.playlists]
    save(OUTBOX_KEY, outbox)
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushOutbox().catch(() => {})
  }, 1200)
}

window.addEventListener("online", () => {
  scheduleFlush()
  syncMusic().catch(() => {})
})

// --- debounced mirror per dataset ---------------------------------------------

function schedule(dataset, fn, delay = 1500) {
  if (!canSync()) return // offline: local persistence already happened
  clearTimeout(timers[dataset])
  timers[dataset] = setTimeout(async () => {
    if (inflight[dataset]) return schedule(dataset, fn, 800)
    timers[dataset] = null
    inflight[dataset] = true
    try {
      await fn()
    } catch {
      /* best-effort; retried by the next mirror */
    } finally {
      inflight[dataset] = false
    }
  }, delay)
}

// --- public mirror API (called from audio.js mutation sites) ------------------

export function mirrorMusicTracks() {
  schedule("music-tracks", async () => {
    const res = await cloudUpsertMusicTracks(
      (state.songs || []).map((t) => ({
        ...t,
        updated: t.updated || Date.now(),
        created: t.created || t.updated || Date.now(),
      })),
    )
    if (res.error) throw res.error
  })
}

export function deleteTrackEverywhere(id) {
  queueOutbox("tracks", id)
  // Best-effort: drop the cloud favorite row too so it never resurrects.
  cloudSetSongFavorite(id, false).catch(() => {})
}

// Song favorites: discrete toggles only (never per-play writes). Pull unions
// cloud ids into the local set; a cross-device un-favorite can resurface on
// another device's next pull — accepted tradeoff, documented here.
export function mirrorSongFavorites(songId, on) {
  if (!canSync() || !songId) return
  cloudSetSongFavorite(songId, on).catch(() => {})
}

export async function pullSongFavorites() {
  if (!canSync()) return { ok: false, offline: true }
  try {
    const res = await cloudListSongFavorites()
    if (res.error) return { ok: false }
    const cloud = new Set(res.data || [])
    if (!cloud.size) return { ok: true }
    const raw = get("sf-player", {})
    const local = Array.isArray(raw.favorites) ? raw.favorites : []
    const merged = [...new Set([...local, ...cloud])].slice(-500)
    if (merged.length !== local.length) {
      save("sf-player", { ...raw, favorites: merged })
      if (state.player && typeof state.player === "object")
        state.player.favorites = merged
      persist()
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export function mirrorPlaylists() {
  schedule("music-playlists", async () => {
    const lists = Object.values(getPlaylistsStore())
    const res = await cloudUpsertPlaylists(
      lists.map((p) => ({
        ...p,
        updatedAt: p.updatedAt || Date.now(),
        createdAt: p.createdAt || p.updatedAt || Date.now(),
      })),
    )
    if (res.error) throw res.error
  })
}

export function deletePlaylistEverywhere(id) {
  queueOutbox("playlists", id)
}

function getPlaylistsStore() {
  const p = state.player || {}
  return p.playlists && typeof p.playlists === "object" ? p.playlists : {}
}

// --- pull + merge (login / refresh / reconnect) --------------------------------

const ts = (v) => new Date(v || 0).getTime()

function mergeById(localList, cloudList, readUpdated) {
  const byId = new Map(localList.map((item) => [item.id, item]))
  ;(cloudList || []).forEach((cloud) => {
    const clean = { ...cloud }
    // Device-local audio presence is never decided by the cloud.
    delete clean.missing
    delete clean.blobUrl
    delete clean._blob
    delete clean.playing
    const local = byId.get(clean.id)
    if (!local) {
      byId.set(clean.id, clean)
      return
    }
    if (ts(readUpdated(clean)) > ts(readUpdated(local)))
      byId.set(clean.id, { ...local, ...clean })
  })
  return [...byId.values()]
}

export async function pullMusic() {
  if (!canSync()) return { ok: false, offline: true }
  let ok = true
  try {
    const tracks = await cloudListMusicTracks()
    if (tracks.error) throw tracks.error
    state.songs = mergeById(
      state.songs || [],
      tracks.data || [],
      (t) => t.clientUpdatedAt || t.updated,
    )
    save("sf-songs", state.songs)
  } catch {
    ok = false
  }
  try {
    const lists = await cloudListPlaylists()
    if (lists.error) throw lists.error
    const store = getPlaylistsStore()
    const merged = mergeById(
      Object.values(store),
      lists.data || [],
      (p) => p.clientUpdatedAt || p.updatedAt,
    )
    const next = {}
    merged.forEach((p) => {
      next[p.id] = {
        id: p.id,
        name: String(p.name || "Untitled playlist").slice(0, 80),
        description:
          typeof p.description === "string" ? p.description.slice(0, 300) : "",
        cover:
          typeof p.cover === "string" && p.cover
            ? p.cover.slice(0, 40)
            : "sunset",
        songIds: [...new Set(p.songIds || [])],
        createdAt: p.createdAt ?? p.clientCreatedAt ?? Date.now(),
        updatedAt: p.updatedAt ?? p.clientUpdatedAt ?? Date.now(),
      }
    })
    state.player = { ...(state.player || {}), playlists: next }
    persist()
  } catch {
    ok = false
  }
  try {
    await pullSongFavorites()
  } catch {
    /* favorites merge is best-effort */
  }
  scheduleFlush()
  return { ok }
}

export async function pushAllMusic() {
  if (!canSync()) return
  try {
    await cloudUpsertMusicTracks(
      (state.songs || []).map((t) => ({
        ...t,
        updated: t.updated || Date.now(),
        created: t.created || t.updated || Date.now(),
      })),
    )
  } catch {
    /* retried by the next mirror */
  }
  try {
    await cloudUpsertPlaylists(Object.values(getPlaylistsStore()))
  } catch {
    /* retried by the next mirror */
  }
}

export async function syncMusic() {
  await pushAllMusic()
  return pullMusic()
}
