import { createClient } from "@supabase/supabase-js"

import { validateImageFile, IMAGE_FORMAT_ERROR } from "./image-validate.js"

const url = import.meta.env.VITE_SUPABASE_URL

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const backendConfigured = Boolean(url && anonKey)

export const supabase = backendConfigured ? createClient(url, anonKey) : null

const turnServers = (import.meta.env.VITE_TURN_SERVERS || "")

  .split(",")

  .map((entry) => entry.trim())

  .filter(Boolean)

  .map((urls) => ({
    urls,

    username: import.meta.env.VITE_TURN_USERNAME,

    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  }))

// Translate raw Supabase/network errors into clear, user-friendly copy.

// Used by every auth surface so users never see "Invalid login credentials"

// or "Failed to fetch" verbatim.

export function friendlyAuthError(error) {
  const msg = String(error?.message || error || "")

  if (
    /failed to fetch|networkerror|network request failed|load failed/i.test(msg)
  )
    return "Can't reach the server — check your internet connection and try again."

  if (/invalid login credentials/i.test(msg))
    return "Email or password is incorrect. Try again or reset your password."

  if (/email not confirmed/i.test(msg))
    return "Please confirm your email first — check your inbox for the verification link."

  if (/user already registered|already exists/i.test(msg))
    return "An account with this email already exists — sign in instead."

  if (/password should be at least|weak password/i.test(msg))
    return "Your password is too short — use at least 6 characters."

  if (/rate limit|too many requests/i.test(msg))
    return "Too many attempts — wait a minute and try again."

  if (/signup requires a valid password/i.test(msg))
    return "Please enter a stronger password (at least 6 characters)."

  if (/unable to validate email|invalid email/i.test(msg))
    return "That email address doesn't look valid — double-check it."

  if (
    /anonymous sign-ins|provider is not enabled|unsupported provider/i.test(msg)
  )
    return "This sign-in method isn't available yet — use email and password."

  if (/supabase is not configured|backend is not configured/i.test(msg))
    return "Cloud services aren't set up on this deployment — contact support."

  if (/session missing|refresh_token_not_found|invalid claim/i.test(msg))
    return "Your session expired — please sign in again."

  return msg.length > 160 ? "Something went wrong — please try again." : msg
}

export async function signUpWithEmail(email, password, profile = {}) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") }

  return supabase.auth.signUp({ email, password, options: { data: profile } })
}

export async function signInWithEmail(email, password) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") }

  return supabase.auth.signInWithPassword({ email, password })
}

export async function resendVerification(email) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") }

  return supabase.auth.resend({ type: "signup", email })
}

export async function searchUsers(query, limit = 8) {
  if (!supabase)
    return { data: [], error: new Error("Supabase is not configured") }

  const q = String(query || "")
    .trim()
    .replace(/[%_]/g, "")
    .slice(0, 60)

  if (q.length < 2) return { data: [], error: null }

  // Locked-down directory: the search_users RPC returns identity fields

  // only (id/handle/name/avatar/bio) and hides blocked users. Raw table

  // reads would expose private profile columns — never query profiles here.

  return supabase.rpc("search_users", {
    q,

    p_limit: Math.min(Math.max(limit || 8, 1), 20),
  })
}

export async function sendGiftNotification(userId, title, text) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") }

  return supabase.from("notifications").insert({
    user_id: userId,

    title,

    text: text || "",
  })
}

export async function requestPasswordReset(
  email,

  redirectTo = window.location.origin,
) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") }

  return supabase.auth.resetPasswordForEmail(email, { redirectTo })
}

export async function updatePassword(newPassword) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") }

  return supabase.auth.updateUser({ password: newPassword })
}

export async function signInWithProvider(provider) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") }

  return supabase.auth.signInWithOAuth({
    provider,

    options: { redirectTo: window.location.origin },
  })
}

export async function deleteMyBackendData() {
  if (!supabase) return { ok: true, signedIn: false, deleted: [], failures: [] }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: true, signedIn: false, deleted: [], failures: [] }

  const uid = user.id

  const deleted = []

  const failures = []

  const missingTable = (err) =>
    /does not exist|not find|schema cache|relation .* does not exist/i.test(
      err?.message || "",
    )

  async function wipe(table, build, label) {
    try {
      let query = supabase.from(table).delete()

      query = build(query)

      const { error } = await query

      if (error) {
        if (missingTable(error)) {
          deleted.push(`${label} (not provisioned)`)

          return
        }

        failures.push(`${label}: ${error.message}`)

        return
      }

      deleted.push(label)
    } catch (err) {
      failures.push(`${label}: ${err?.message || "failed"}`)
    }
  }

  const eq = (col) => (q) => q.eq(col, uid)

  // Order matters: participants before the calls that cascade them,

  // owned groups before the rows that reference them.

  await wipe("call_participants", eq("user_id"), "call participations")

  await wipe("call_history", eq("initiator_id"), "call history")

  await wipe("story_views", eq("viewer_id"), "story views")

  await wipe("stories", eq("user_id"), "stories")

  await wipe("community_blocks", eq("blocker_id"), "blocks")

  // Group avatar files live under groups/{groupId}/ — outside the user's own

  // folder, so they need prefix cleanup before the owned groups go away.

  try {
    const { data: owned } = await supabase
      .from("groups")
      .select("id")
      .eq("owner_id", uid)

    const avatars = supabase.storage.from("studyflow-groups")

    for (const g of owned || []) {
      const listed = await avatars.list(`groups/${g.id}`).catch(() => null)

      const files = (listed?.data || [])
        .map((e) => `groups/${g.id}/${e.name}`)
        .filter((p) => !p.endsWith("/"))

      if (files.length) await avatars.remove(files).catch(() => null)
    }
  } catch {
    /* storage avatar cleanup is best-effort */
  }

  await wipe("groups", eq("owner_id"), "owned groups")

  await wipe("group_memberships", eq("user_id"), "group memberships")

  await wipe(
    "friendships",
    (q) => q.or(`user_id.eq.${uid},friend_id.eq.${uid}`),
    "friendships",
  )

  await wipe("messages", eq("sender_id"), "sent messages")

  await wipe("message_reactions", eq("user_id"), "message reactions")

  await wipe("message_receipts", eq("user_id"), "message receipts")

  await wipe("notifications", eq("user_id"), "notifications")

  await wipe("purchases", eq("buyer_id"), "purchase records")

  await wipe("coin_transactions", eq("user_id"), "coin transactions")

  await wipe("user_balances", eq("user_id"), "coin balance")

  await wipe("user_inventory", eq("user_id"), "inventory")

  await wipe("user_achievements", eq("user_id"), "achievements")

  await wipe("streaks", eq("user_id"), "streak")

  await wipe("mystery_box_openings", eq("user_id"), "mystery-box history")

  await wipe("reports", eq("reporter_id"), "reports")

  await wipe("book_highlights", eq("user_id"), "book highlights")

  await wipe("book_bookmarks", eq("user_id"), "book bookmarks")

  await wipe("book_progress", eq("user_id"), "reading progress")

  await wipe("book_favorites", eq("user_id"), "book favorites")

  await wipe("books", eq("owner_id"), "uploaded books")

  await wipe("tasks", eq("user_id"), "tasks")

  await wipe("music_playlist_tracks", eq("user_id"), "playlist memberships")

  await wipe("music_playlists", eq("user_id"), "playlists")

  await wipe("music_tracks", eq("user_id"), "music metadata")

  await wipe("favorites", eq("user_id"), "favorites")

  await wipe("user_progress", eq("user_id"), "progress and coins")

  await wipe("user_settings", eq("user_id"), "settings")

  await wipe("user_state", eq("user_id"), "synced app state")

  await wipe("profiles", (q) => q.eq("id", uid), "profile")

  // Storage: every file under this user's folder, in each app bucket.

  try {
    for (const bucketName of [
      "studyflow-files",
      "studyflow-books",
      "studyflow-avatars",
      "studyflow-stories",
      "studyflow-docs",
    ]) {
      const bucket = supabase.storage.from(bucketName)

      const paths = []

      const top = await bucket.list(uid)

      if (top.error) {
        if (!missingTable(top.error) && top.error.message !== "Not Found")
          failures.push(`storage (${bucketName}): ${top.error.message}`)

        continue
      }

      for (const entry of top.data || []) {
        if (entry?.id) {
          paths.push(`${uid}/${entry.name}`)

          continue
        }

        const sub = await bucket.list(`${uid}/${entry.name}`)

        if (!sub.error) {
          for (const f of sub.data || []) {
            if (f?.id || (f?.name || "").includes("."))
              paths.push(`${uid}/${entry.name}/${f.name}`)
          }
        }
      }

      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await bucket.remove(paths.slice(i, i + 100))

        if (error && !missingTable(error)) {
          failures.push(`storage (${bucketName}): ${error.message}`)

          break
        }
      }

      if (!failures.some((f) => f.startsWith("storage:")))
        deleted.push(`storage files (${bucketName}, ${paths.length})`)
    }
  } catch (err) {
    failures.push(`storage: ${err?.message || "failed"}`)
  }

  return { ok: failures.length === 0, signedIn: true, deleted, failures }
}

export async function reportUser({ reportedUserId, reasons, details }) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user)
    return { data: null, error: new Error("Sign in to submit a report") }

  if (!Array.isArray(reasons) || !reasons.length)
    return { data: null, error: new Error("Choose at least one reason") }

  return supabase.from("reports").insert({
    reporter_id: user.id,

    reported_user_id: reportedUserId || null,

    reasons: reasons.slice(0, 8),

    details: String(details || "").slice(0, 2000),
  })
}

export async function signOut() {
  if (!supabase) return { error: null }

  return supabase.auth.signOut({ scope: "global" })
}

export async function getCurrentUser() {
  if (!supabase) return null

  const { data } = await supabase.auth.getUser()

  return data.user ?? null
}

// True only when a usable session exists (signUp with "confirm email" on

// returns a user but no session — callers must not treat that as signed in).

export async function hasActiveSession() {
  if (!supabase) return false

  const { data } = await supabase.auth.getSession()

  return Boolean(data?.session?.access_token)
}

export function onAuthStateChange(callback) {
  if (!supabase) return { unsubscribe: () => {} }

  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    callback(session?.user ?? null),
  )

  return data.subscription
}

// The profiles table only has these columns — sending anything else

// (e.g. the photo data-URL) makes the upsert fail with a PGRST204 error.

const PROFILE_COLUMNS = [
  "name",

  "handle",

  "bio",

  "avatar",

  "photo_path",

  "email",

  "country",

  "phone",

  "university",

  "subjects",

  "profile_visibility",

  "activity_visibility",

  "searchable",
]

function toProfileRow(profile = {}) {
  const row = {}

  const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

  for (const col of PROFILE_COLUMNS) {
    const v = profile[col] ?? profile[camel(col)]

    if (v !== undefined) row[col] = v
  }

  if (typeof row.handle === "string") row.handle = row.handle.slice(0, 60)

  if (typeof row.name === "string") row.name = row.name.slice(0, 120)

  if (typeof row.bio === "string") row.bio = row.bio.slice(0, 500)

  if (typeof row.avatar === "string") row.avatar = row.avatar.slice(0, 8)

  if (typeof row.photo_path === "string")
    row.photo_path = row.photo_path.slice(0, 500)

  if (typeof row.email === "string") row.email = row.email.slice(0, 200)

  if (typeof row.country === "string") row.country = row.country.slice(0, 80)

  if (typeof row.phone === "string") row.phone = row.phone.slice(0, 40)

  if (typeof row.university === "string")
    row.university = row.university.slice(0, 160)

  if (row.subjects !== undefined && !Array.isArray(row.subjects))
    row.subjects = []
  else if (Array.isArray(row.subjects))
    row.subjects = row.subjects.slice(0, 12).map((s) => String(s).slice(0, 80))

  return row
}

export async function syncProfile(profile) {
  const user = await getCurrentUser()

  if (!supabase || !user)
    return { data: null, error: new Error("Sign in to sync your profile") }

  let row = toProfileRow(profile)

  if (!Object.keys(row).length) return { data: null, error: null }

  // Resilient save: if the project's migrations lag behind the app (e.g. a

  // newer column like photo_path doesn't exist yet), drop the offending

  // column and retry instead of failing the whole save.

  let last = null

  for (let attempt = 0; attempt <= PROFILE_COLUMNS.length; attempt++) {
    const res = await supabase

      .from("profiles")

      .upsert({ id: user.id, ...row, updated_at: new Date().toISOString() })

    if (!res.error) return res

    last = res

    const m =
      /could not find the '([a-z_]+)' column|column "([a-z_]+)" does not exist/i.exec(
        res.error.message || "",
      )

    const col = m && (m[1] || m[2])

    if (!col || !(col in row)) return res

    delete row[col]

    if (!Object.keys(row).length) return res
  }

  return last
}

export async function loadOwnProfile() {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user)
    return { data: null, error: new Error("Sign in to load your profile") }

  return supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
}

// --- Avatar photos (studyflow-avatars bucket, public read, owner write) ------

const AVATAR_BUCKET = "studyflow-avatars"

export function avatarPublicUrl(path) {
  if (!supabase || !path) return null

  try {
    return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data
      .publicUrl
  } catch {
    return null
  }
}

export async function uploadAvatar(file) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user)
    return { data: null, error: new Error("Sign in to upload a photo") }

  const ext =
    String(file.name || "")

      .split(".")

      .pop()

      .toLowerCase()

      .replace(/[^a-z0-9]/g, "")

      .slice(0, 8) || "jpg"

  const path = `${user.id}/avatar-${Date.now()}.${ext}`

  const { error } = await supabase.storage

    .from(AVATAR_BUCKET)

    .upload(path, file, {
      upsert: true,

      contentType: file.type || "image/jpeg",
    })

  if (error) return { data: null, error }

  return { data: { path }, error: null }
}

export async function removeAvatar(path) {
  if (!supabase || !path) return { error: null }

  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path])

  return { error }
}

// --- User settings (user_settings table, self-only RLS) ----------------------

export async function loadUserSettings() {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { data: null, error: new Error("Sign in to load settings") }

  return supabase

    .from("user_settings")

    .select("*")

    .eq("user_id", user.id)

    .maybeSingle()
}

export async function saveUserSettings(patch) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { data: null, error: new Error("Sign in to save settings") }

  const row = { user_id: user.id, updated_at: new Date().toISOString() }

  for (const k of ["theme", "notifications", "timer", "display", "music"]) {
    if (patch && patch[k] !== undefined) row[k] = patch[k]
  }

  if (typeof row.theme === "string")
    row.theme = row.theme.slice(0, 64) || "system"

  return supabase.from("user_settings").upsert(row)
}

export async function loadCloudState(table, userId) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") }

  return supabase.from(table).select("*").eq("user_id", userId)
}

export async function loadUserState(userId) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") }

  return supabase

    .from("user_state")

    .select("state, version, updated_at")

    .eq("user_id", userId)

    .maybeSingle()
}

export async function syncUserState(userId, state) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") }

  return supabase

    .from("user_state")

    .upsert({
      user_id: userId,

      state,

      version: Date.now(),

      updated_at: new Date().toISOString(),
    })

    .select()

    .single()
}

export async function syncProgress(userId, progress) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") }

  return supabase.from("user_progress").upsert({
    user_id: userId,

    ...progress,

    updated_at: new Date().toISOString(),
  })
}

export async function uploadUserFile(userId, file, folder = "uploads") {
  if (!supabase || !userId)
    return { data: null, error: new Error("Sign in to upload files") }

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-")

  const path = `${userId}/${folder}/${crypto.randomUUID()}-${safeName}`

  const result = await supabase.storage

    .from("studyflow-files")

    .upload(path, file, { upsert: false, contentType: file.type || undefined })

  return result.error ? result : { data: { path }, error: null }
}

export async function getUserFileUrl(path) {
  if (!supabase || !path)
    return { data: null, error: new Error("Storage is not configured") }

  return supabase.storage.from("studyflow-files").createSignedUrl(path, 3600)
}

const BOOK_BUCKET = "studyflow-books"

async function bookOwnerId() {
  if (!supabase)
    return { userId: null, error: new Error("Backend is not configured") }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user)
    return { userId: null, error: new Error("Sign in to use the book library") }

  return { userId: user.id, error: null }
}

export async function uploadBookFile(userId, file, folder = "books") {
  if (!supabase || !userId)
    return { data: null, error: new Error("Sign in to upload books") }

  const safeName = (file.name || "book")
    .replace(/[^a-z0-9._-]/gi, "-")
    .slice(0, 120)

  const path = `${userId}/${folder}/${crypto.randomUUID()}-${safeName}`

  const result = await supabase.storage

    .from(BOOK_BUCKET)

    .upload(path, file, { upsert: false, contentType: file.type || undefined })

  return result.error ? result : { data: { path }, error: null }
}

export async function getBookFileUrl(path, expiresIn = 3600) {
  if (!supabase || !path)
    return { data: null, error: new Error("Storage is not configured") }

  return supabase.storage.from(BOOK_BUCKET).createSignedUrl(path, expiresIn)
}

export async function downloadBookFile(path) {
  if (!supabase || !path)
    return { data: null, error: new Error("Storage is not configured") }

  return supabase.storage.from(BOOK_BUCKET).download(path)
}

export async function removeBookFile(path) {
  if (!supabase || !path) return { error: null }

  const { error } = await supabase.storage.from(BOOK_BUCKET).remove([path])

  return { error }
}

export async function createBook(row) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  return supabase
    .from("books")
    .insert({ ...row, owner_id: userId })
    .select()
    .single()
}

export async function updateBook(id, patch) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  return supabase
    .from("books")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", userId)
    .select()
    .single()
}

export async function deleteBook(id) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  return supabase.from("books").delete().eq("id", id).eq("owner_id", userId)
}

export async function listMyBooks() {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: [], error }

  return supabase
    .from("books")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(200)
}

// Cheap reachability probe for the Book Library pill: a head-only count query

// transfers zero rows — PostgREST just answers with a status.

export async function probeBooksBackend() {
  if (!supabase) return { error: new Error("Backend is not configured") }

  try {
    const { error } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })

    return error ? { error } : { error: null }
  } catch (err) {
    return { error: err }
  }
}

export async function listPublicBooks(limit = 60) {
  if (!supabase)
    return { data: [], error: new Error("Backend is not configured") }

  return supabase
    .from("books")
    .select(
      "id,title,author,description,category,tags,cover_path,file_path,file_type,file_size,page_count,word_count,allow_download,created_at,owner_id",
    )
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit)
}

export async function getBook(id, userId) {
  if (!supabase || !id)
    return { data: null, error: new Error("Backend is not configured") }

  let q = supabase.from("books").select("*").eq("id", id)

  if (userId) q = q.or(`visibility.eq.public,owner_id.eq.${userId}`)
  else q = q.eq("visibility", "public")

  return q.maybeSingle()
}

export async function toggleBookFavorite(bookId, on) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  if (on)
    return supabase
      .from("book_favorites")
      .upsert({ user_id: userId, book_id: bookId })

  return supabase
    .from("book_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("book_id", bookId)
}

export async function listBookFavorites() {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: [], error }

  return supabase
    .from("book_favorites")
    .select(
      "book_id,books(id,title,author,description,category,cover_path,file_type,allow_download,owner_id)",
    )
    .eq("user_id", userId)
}

export async function saveBookProgress(bookId, position) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  const pos = Math.min(1, Math.max(0, Number(position) || 0))

  return supabase
    .from("book_progress")
    .upsert({ user_id: userId, book_id: bookId, position: pos })
}

export async function listBookProgress() {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: [], error }

  return supabase
    .from("book_progress")
    .select("book_id,position,updated_at")
    .eq("user_id", userId)
}

export async function listBookBookmarks(bookId) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: [], error }

  return supabase
    .from("book_bookmarks")
    .select("*")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .order("created_at", { ascending: true })
}

export async function addBookBookmark(bookId, label, locator) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  return supabase
    .from("book_bookmarks")
    .insert({
      user_id: userId,
      book_id: bookId,
      label: String(label || "").slice(0, 200),
      locator: String(locator || "").slice(0, 2000),
    })
    .select()
    .single()
}

export async function removeBookBookmark(id) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  return supabase
    .from("book_bookmarks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
}

export async function listBookHighlights(bookId) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: [], error }

  return supabase
    .from("book_highlights")
    .select("*")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .order("created_at", { ascending: true })
}

export async function addBookHighlight(
  bookId,
  { color, excerpt, prefix, suffix, note },
) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  const colors = ["yellow", "green", "blue", "pink", "purple"]

  return supabase
    .from("book_highlights")
    .insert({
      user_id: userId,
      book_id: bookId,

      color: colors.includes(color) ? color : "yellow",

      excerpt: String(excerpt || "").slice(0, 2000),

      prefix: String(prefix || "").slice(0, 500),

      suffix: String(suffix || "").slice(0, 500),

      note: String(note || "").slice(0, 4000),
    })
    .select()
    .single()
}

export async function updateBookHighlight(id, patch) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  const clean = {}

  if (patch.color) {
    const colors = ["yellow", "green", "blue", "pink", "purple"]

    if (colors.includes(patch.color)) clean.color = patch.color
  }

  if (typeof patch.note === "string") clean.note = patch.note.slice(0, 4000)

  if (!Object.keys(clean).length)
    return { data: null, error: new Error("Nothing to update") }

  clean.updated_at = new Date().toISOString()

  return supabase
    .from("book_highlights")
    .update(clean)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single()
}

export async function removeBookHighlight(id) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  return supabase
    .from("book_highlights")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
}

// --- Phase 6: book metadata sync + standalone notes ---------------------------

// Local book rows are keyed by client UUIDs (same id space as books.id), so

// offline-created books upsert back without remapping. Audio binaries never

// leave IndexedDB; only metadata rows sync here.

const bookSyncRow = (userId, b) => ({
  id: String(b.id),

  owner_id: userId,

  title: String(b.title || "Untitled").slice(0, 300),

  author: String(b.author || "").slice(0, 200),

  description: String(b.description || "").slice(0, 4000),

  category: String(b.category || "General").slice(0, 120),

  tags: Array.isArray(b.tags)
    ? b.tags.slice(0, 12).map((x) => String(x).slice(0, 40))
    : [],

  isbn: String(b.isbn || "").slice(0, 32),

  publisher: String(b.publisher || "").slice(0, 200),

  published_year: b.year ?? null,

  page_count: b.pageCount ?? null,

  word_count: b.wordCount ?? null,

  cover_path: b.coverPath || null,

  file_path: b.filePath || null,

  file_type: String(b.fileType || "").slice(0, 120),

  file_size: Number(b.fileSize) || 0,

  fingerprint: String(b.fingerprint || "").slice(0, 160),

  visibility: "private",

  allow_download: Boolean(b.allowDownload),

  client_updated_at: b.updatedAt
    ? new Date(b.updatedAt).toISOString()
    : new Date().toISOString(),
})

export async function cloudUpsertBook(book) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  return supabase
    .from("books")
    .upsert(bookSyncRow(userId, book), { onConflict: "id" })
    .select()
    .single()
}

export async function cloudUpsertBooks(books) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  if (!books?.length) return { data: null, error: null }

  const { error: e } = await supabase

    .from("books")

    .upsert(
      books.map((b) => bookSyncRow(userId, b)),
      { onConflict: "id" },
    )

  return e ? { data: null, error: e } : { data: true, error: null }
}

export async function cloudListBooks() {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  const { data, error: e } = await supabase

    .from("books")

    .select(
      "id,title,author,description,category,tags,isbn,publisher,published_year,page_count,word_count,cover_path,file_path,file_type,file_size,fingerprint,visibility,allow_download,created_at,client_updated_at",
    )

    .eq("owner_id", userId)

    .order("created_at", { ascending: false })

    .limit(200)

  if (e) return { data: null, error: e }

  return {
    data: (data || []).map((r) => ({
      id: r.id,

      title: r.title,
      author: r.author,
      description: r.description,

      category: r.category,
      tags: r.tags || [],
      isbn: r.isbn || "",

      publisher: r.publisher || "",
      year: r.published_year ?? null,

      pageCount: r.page_count ?? null,
      wordCount: r.word_count ?? null,

      coverPath: r.cover_path || "",
      filePath: r.file_path || "",

      fileType: r.file_type || "",
      fileSize: r.file_size || 0,

      fingerprint: r.fingerprint || "",

      visibility: "private",
      allowDownload: Boolean(r.allow_download),

      createdAt: new Date(r.created_at).getTime() || Date.now(),

      clientUpdatedAt: r.client_updated_at,
    })),

    error: null,
  }
}

const NOTE_KINDS = ["general", "page", "bookmark"]

export async function listBookNotes(bookId) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: [], error }

  return supabase
    .from("book_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .order("created_at", { ascending: true })
}

export async function addBookNote(bookId, { kind, label, locator, body }) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  if (!String(body || "").trim())
    return { data: null, error: new Error("Note is empty") }

  return supabase
    .from("book_notes")
    .insert({
      user_id: userId,
      book_id: bookId,

      kind: NOTE_KINDS.includes(kind) ? kind : "general",

      label: String(label || "").slice(0, 200),

      locator: String(locator || "").slice(0, 2000),

      body: String(body || "").slice(0, 4000),
    })
    .select()
    .single()
}

export async function updateBookNote(id, patch) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  const clean = {}

  if (typeof patch.body === "string") {
    if (!patch.body.trim())
      return { data: null, error: new Error("Note is empty") }

    clean.body = patch.body.slice(0, 4000)
  }

  if (typeof patch.label === "string") clean.label = patch.label.slice(0, 200)

  if (typeof patch.locator === "string")
    clean.locator = patch.locator.slice(0, 2000)

  if (!Object.keys(clean).length)
    return { data: null, error: new Error("Nothing to update") }

  clean.updated_at = new Date().toISOString()

  return supabase
    .from("book_notes")
    .update(clean)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single()
}

export async function removeBookNote(id) {
  const { userId, error } = await bookOwnerId()

  if (error) return { data: null, error }

  return supabase.from("book_notes").delete().eq("id", id).eq("user_id", userId)
}

// ---------- groups (public, user-created) ----------

async function groupOwnerId() {
  if (!supabase)
    return { userId: null, error: new Error("Backend is not configured") }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { userId: null, error: new Error("Sign in to use groups") }

  return { userId: user.id, error: null }
}

export async function createCloudGroup(row) {
  const { userId, error } = await groupOwnerId()

  if (error) return { data: null, error }

  return supabase.from("groups").upsert({
    id: row.id,

    owner_id: userId,

    name: String(row.name || "Group").slice(0, 120),

    description: String(row.description || "").slice(0, 500),

    logo: row.logo || "📚",

    focus_topics: Array.isArray(row.focus_topics)
      ? row.focus_topics.slice(0, 8)
      : [],

    visibility: "public",
  })
}

export async function listPublicGroups(limit = 200) {
  if (!supabase)
    return { data: [], error: new Error("Backend is not configured") }

  const res = await supabase

    .from("groups")

    .select(
      "id,owner_id,name,description,logo,focus_topics,visibility,avatar_path,group_memberships(count)",
    )

    .eq("visibility", "public")

    .order("created_at", { ascending: false })

    .limit(limit)

  if (!res.error) return res

  // Degraded-project fallback: if the count embed itself fails server-side

  // (e.g. a 500 from a stale/broken schema cache or a recursive policy on

  // the embedded relation — Postgres 42P17), retry without it so group

  // discovery keeps working; member counts fall back to "—".

  const embedFailed =
    /500|internal|embed|relationship|recursion/i.test(
      res.error.message || "",
    ) || res.error.code === "42P17"

  if (embedFailed) {
    const retry = await supabase

      .from("groups")

      .select(
        "id,owner_id,name,description,logo,focus_topics,visibility,avatar_path",
      )

      .eq("visibility", "public")

      .order("created_at", { ascending: false })

      .limit(limit)

    if (!retry.error) return { ...retry, degraded: true }
  }

  return res
}

export async function joinCloudGroup(groupId, role = "member") {
  const { userId, error } = await groupOwnerId()

  if (error) return { data: null, error }

  return supabase

    .from("group_memberships")

    .upsert({
      group_id: groupId,
      user_id: userId,
      role: role === "owner" ? "owner" : "member",
    })
}

export async function leaveCloudGroup(groupId) {
  const { userId, error } = await groupOwnerId()

  if (error) return { data: null, error }

  return supabase

    .from("group_memberships")

    .delete()

    .eq("group_id", groupId)

    .eq("user_id", userId)
}

export async function deleteCloudGroup(groupId) {
  const { userId, error } = await groupOwnerId()

  if (error) return { data: null, error }

  return supabase
    .from("groups")
    .delete()
    .eq("id", groupId)
    .eq("owner_id", userId)
}

export function subscribeToPresence(channelName, userInfo, onSync) {
  if (!supabase) return { untrack: () => {} }

  const channel = supabase

    .channel(channelName)

    .on("presence", { event: "sync" }, () => {
      try {
        const joined = Object.values(channel.presenceState()).flat()

        onSync?.(joined)
      } catch {
        /* ignore */
      }
    })

    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.track({
            ...userInfo,

            online_at: new Date().toISOString(),
          })
        } catch {
          /* ignore */
        }
      }
    })

  return { untrack: () => supabase.removeChannel(channel) }
}

export function subscribeToConversation({
  groupId,

  recipientId,

  myUserId,

  onMessage,

  onUpdate,

  onTyping,

  onRead,
}) {
  if (!supabase) return { unsubscribe: () => {}, sendTyping: async () => {} }

  // DM channels must be DETERMINISTIC per conversation — both sides join the

  // same channel (sorted id pair) or broadcasts (typing) never cross over:

  // each side used to sit on its own privately-named channel.

  const channelName = groupId
    ? `studyflow-messages:group:${groupId}`
    : `studyflow-messages:dm:${[myUserId, recipientId].filter(Boolean).sort().join("--")}`

  // Realtime filters: ONE simple column per listener. The old nested

  // `or(and(...),and(...))` DM filter matched nothing on several realtime

  // versions — the channel stayed healthy (typing broadcasts worked) but

  // every INSERT was silently dropped, so recipients only saw new messages

  // after a full history reload. Two single-column listeners + a client-side

  // scope guard are universally supported and equivalent:

  //   recipient = me   → incoming (guard: the other person sent it to me)

  //   recipient = them → my own echo (guard: I sent it to them)

  const dmSpecs =
    myUserId && recipientId
      ? [
          {
            filter: `recipient_id=eq.${myUserId}`,
            guard: (r) =>
              r.sender_id === recipientId && r.recipient_id === myUserId,
          },

          {
            filter: `recipient_id=eq.${recipientId}`,
            guard: (r) =>
              r.sender_id === myUserId && r.recipient_id === recipientId,
          },
        ]
      : [{ filter: `recipient_id=eq.${recipientId}`, guard: null }]

  const specs = groupId
    ? [
        {
          filter: `group_id=eq.${groupId}`,
          guard: (r) => r.group_id === groupId,
        },
      ]
    : dmSpecs

  let channel = null

  let retried = false

  const join = () => {
    channel = supabase.channel(channelName)

    for (const spec of specs) {
      channel

        .on(
          "postgres_changes",

          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: spec.filter,
          },

          (payload) => {
            const row = payload.new

            if (!row || (spec.guard && !spec.guard(row))) return

            onMessage?.(row)
          },
        )

        .on(
          "postgres_changes",

          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: spec.filter,
          },

          (payload) => {
            const row = payload.new

            if (!row || (spec.guard && !spec.guard(row))) return

            onUpdate?.(row)
          },
        )
    }

    channel

      .on(
        "postgres_changes",

        { event: "UPDATE", schema: "public", table: "message_receipts" },

        (payload) => onRead?.(payload.new),
      )

      .on("broadcast", { event: "typing" }, ({ payload }) =>
        onTyping?.(payload),
      )

      .subscribe((status) => {
        // A dead channel must not silently swallow live messages: retry the

        // join once, then give up (history/polling still cover delivery).

        if (
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
          !retried
        ) {
          retried = true

          setTimeout(
            () => {
              try {
                supabase.removeChannel(channel)
              } catch {
                /* already gone */
              }

              join()
            },
            3500,
          )
        }
      })
  }

  join()

  return {
    sendTyping: (userId, isTyping) =>
      channel?.send({
        type: "broadcast",

        event: "typing",

        payload: { userId, isTyping },
      }),

    unsubscribe: () => {
      if (channel) supabase.removeChannel(channel)

      channel = null
    },
  }
}

export async function sendCloudMessage(message) {
  if (!supabase)
    return {
      data: null,

      error: new Error("Realtime messaging is not configured"),
    }

  // DMs go through the server-validated RPC (023) — friendship and blocks

  // are re-checked database-side, and the inserted row comes back so the

  // sender can stamp the cloud id. Groups keep the plain insert.

  if (
    message &&
    !message.group_id &&
    message.recipient_id &&
    (message.kind == null || message.kind === "text")
  ) {
    const { data, error } = await supabase
      .rpc("sf_direct_message", {
        p_recipient: message.recipient_id,

        p_text: String(message.text || ""),

        p_metadata:
          message.metadata && typeof message.metadata === "object"
            ? message.metadata
            : {},
      })
      .single()

    if (error && isMissingRpc(error)) {
      // Raw insert keeps the client id — the RPC fallback must NOT, or the

      // INSERT..RETURNING on that id would come back empty under the delete

      // policy and this very fallback would fire again (duplicate rows).

      const { id: _ignored, ...rest } = message

      const cid = crypto.randomUUID()

      const ins = await supabase.from("messages").insert({ ...rest, id: cid })

      // Plain insert (no .select()): PostgREST RETURNING runs through the

      // row-security SELECT policy, which can't see the just-inserted row —

      // it would report an error for a row that actually landed. We know

      // the id we assigned, so hand it back directly.

      return ins.error ? ins : { data: { id: cid }, error: null }
    }

    return { data, error }
  }

  return supabase.from("messages").insert(message).select().single()
}

export async function markMessageRead(messageId, userId) {
  if (!supabase)
    return {
      data: null,

      error: new Error("Realtime messaging is not configured"),
    }

  return supabase.from("message_receipts").upsert({
    message_id: messageId,

    user_id: userId,

    read_at: new Date().toISOString(),
  })
}

export async function recordCall(call) {
  if (!supabase)
    return { data: null, error: new Error("Call history is not configured") }

  return supabase.from("call_history").insert(call).select().single()
}

export async function getCallById(callId) {
  if (!supabase || !callId)
    return { data: null, error: new Error("Call history is not configured") }

  return supabase
    .from("call_history")
    .select("*")
    .eq("id", callId)
    .maybeSingle()
}

export async function listCallParticipants(callId) {
  if (!supabase || !callId)
    return { data: [], error: new Error("Call history is not configured") }

  return supabase

    .from("call_participants")

    .select("user_id,status,joined_at")

    .eq("call_id", callId)

    .limit(24)
}

// Poll fallback: rings I should be seeing right now (recipient OR participant).

// Realtime can miss an INSERT during tab sleep / a dropped channel — this

// keeps one-sided calls from requiring both sides to press Call together.

export async function listMyRingingCalls(userId) {
  if (!supabase || !userId) return { data: [], error: null }

  try {
    const [asRecipient, parts] = await Promise.all([
      supabase

        .from("call_history")

        .select("*")

        .eq("recipient_id", userId)

        .eq("status", "ringing")

        .order("started_at", { ascending: false })

        .limit(5),

      supabase

        .from("call_participants")

        .select("call_id")

        .eq("user_id", userId)

        .eq("status", "ringing")

        .limit(10),
    ])

    const rows = asRecipient.data || []

    const known = new Set(rows.map((r) => r.id))

    const missing = [...new Set((parts.data || []).map((p) => p.call_id))]

      .filter((id) => id && !known.has(id))

    if (missing.length) {
      const extra = await supabase

        .from("call_history")

        .select("*")

        .in("id", missing)

        .eq("status", "ringing")

        .limit(5)

      rows.push(...(extra.data || []))
    }

    return { data: rows, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

export async function updateCall(callId, updates) {
  if (!supabase)
    return { data: null, error: new Error("Call history is not configured") }

  return supabase.from("call_history").update(updates).eq("id", callId)
}

export async function upsertCallParticipant(participant) {
  if (!supabase)
    return { data: null, error: new Error("Call history is not configured") }

  return supabase.from("call_participants").upsert(participant)
}

export function subscribeToUserState(userId, onChange) {
  if (!supabase || !userId) return { unsubscribe: () => {} }

  const channel = supabase

    .channel(`studyflow-state:${userId}`)

    .on(
      "postgres_changes",

      {
        event: "*",

        schema: "public",

        table: "user_state",

        filter: `user_id=eq.${userId}`,
      },

      // Version included so callers can tell their own echoes (same or older

      // version) apart from genuinely newer cross-device writes.

      (payload) =>
        onChange({
          state: payload.new?.state ?? null,
          version: payload.new?.version ?? 0,
        }),
    )

    .subscribe()

  return { unsubscribe: () => supabase.removeChannel(channel) }
}

export function createSignalingRoom(roomId, userId, onSignal) {
  if (!supabase)
    return {
      send: async () => ({
        error: new Error("Realtime signaling is not configured"),
      }),

      close: () => {},
    }

  const channel = supabase.channel(`studyflow-call:${roomId}`, {
    config: { broadcast: { self: false } },
  })

  channel

    .on("broadcast", { event: "signal" }, ({ payload }) => {
      if (payload?.senderId !== userId) onSignal(payload)
    })

    .subscribe()

  return {
    send: (signal) =>
      channel.send({
        type: "broadcast",

        event: "signal",

        payload: { ...signal, senderId: userId },
      }),

    close: () => supabase.removeChannel(channel),
  }
}

// Sorted-pair room id — both sides of a 1:1 must join the SAME channel or

// offers/answers never cross (each side used to sit on its own peer id).

export function dmCallRoomId(a, b) {
  return [a, b].filter(Boolean).sort().join("--")
}

export async function createWebRtcPeer({
  roomId,

  userId,

  initiator,

  stream,

  onTrack,

  onStateChange,

  peerId = null, // remote user id — used as targetId for group mesh routing
}) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }, ...turnServers],
  })

  // Candidates that arrive before setRemoteDescription must be queued —

  // addIceCandidate throws (or is dropped) without a remote description.

  const pendingCandidates = []

  let hasRemoteDesc = false

  const drainCandidates = async () => {
    while (pendingCandidates.length) {
      try {
        await peer.addIceCandidate(pendingCandidates.shift())
      } catch {
        /* skip poisoned candidate */
      }
    }
  }

  const target = peerId ? { targetId: peerId } : {}

  const room = createSignalingRoom(roomId, userId, async (signal) => {
    // Mesh rooms are shared: only process signals addressed to us.

    if (signal.targetId && signal.targetId !== userId) return

    try {
      if (signal.type === "offer") {
        await peer.setRemoteDescription(signal.description)

        hasRemoteDesc = true

        await drainCandidates()

        const answer = await peer.createAnswer()

        await peer.setLocalDescription(answer)

        await room.send({
          type: "answer",
          description: peer.localDescription,
          ...target,
          targetId: signal.senderId,
        })
      } else if (signal.type === "answer") {
        await peer.setRemoteDescription(signal.description)

        hasRemoteDesc = true

        await drainCandidates()
      } else if (signal.type === "candidate" && signal.candidate) {
        if (!hasRemoteDesc) pendingCandidates.push(signal.candidate)
        else await peer.addIceCandidate(signal.candidate)
      }
    } catch {
      /* renegotiation glitch — connection state callback surfaces real failures */
    }
  })

  peer.onicecandidate = ({ candidate }) =>
    candidate &&
    room.send({
      type: "candidate",
      candidate,
      ...target,
      targetId: peerId || undefined,
    })

  peer.ontrack = (event) => onTrack?.(event.streams[0])

  peer.onconnectionstatechange = () => onStateChange?.(peer.connectionState)

  stream?.getTracks().forEach((track) => peer.addTrack(track, stream))

  if (initiator) {
    const offer = await peer.createOffer()

    await peer.setLocalDescription(offer)

    await room.send({
      type: "offer",
      description: peer.localDescription,
      ...target,
      targetId: peerId || undefined,
    })
  }

  return {
    peer,

    peerId,

    addStream: (mediaStream) =>
      mediaStream

        .getTracks()

        .forEach((track) => peer.addTrack(track, mediaStream)),

    close: () => {
      room.close()

      peer.close()
    },
  }
}

// Ring/accept: watch for calls where I am the recipient and/or a participant

// row is waiting on me. Returns an unsubscribe handle.

export function subscribeToIncomingCalls(
  myUserId,
  { onRinging, onAccepted, onCancelled } = {},
) {
  if (!supabase || !myUserId) return { unsubscribe: () => {} }

  const channel = supabase

    .channel(`studyflow-calls-in:${myUserId}`)

    .on(
      "postgres_changes",

      {
        event: "INSERT",
        schema: "public",
        table: "call_history",
        filter: `recipient_id=eq.${myUserId}`,
      },

      (payload) => {
        const row = payload.new

        if (row && row.status === "ringing") onRinging?.(row)
      },
    )

    .on(
      "postgres_changes",

      {
        event: "UPDATE",
        schema: "public",
        table: "call_history",
        filter: `recipient_id=eq.${myUserId}`,
      },

      (payload) => {
        const row = payload.new

        if (!row) return

        if (
          row.status === "connecting" ||
          row.status === "connected" ||
          row.status === "accepted"
        )
          onAccepted?.(row)
        else if (
          row.status === "ended" ||
          row.status === "missed" ||
          row.status === "failed" ||
          row.status === "declined" ||
          row.status === "cancelled"
        )
          onCancelled?.(row)
      },
    )

    .on(
      "postgres_changes",

      { event: "UPDATE", schema: "public", table: "call_history" },

      (payload) => {
        // Initiator side: callee accepted/declined.

        const row = payload.new

        if (!row || row.initiator_id !== myUserId) return

        if (
          row.status === "connecting" ||
          row.status === "connected" ||
          row.status === "accepted"
        )
          onAccepted?.(row)
        else if (
          row.status === "ended" ||
          row.status === "missed" ||
          row.status === "failed" ||
          row.status === "declined" ||
          row.status === "cancelled"
        )
          onCancelled?.(row)
      },
    )

    .on(
      "postgres_changes",

      {
        event: "INSERT",
        schema: "public",
        table: "call_participants",
        filter: `user_id=eq.${myUserId}`,
      },

      (payload) => {
        const row = payload.new

        if (row && row.status === "ringing")
          onRinging?.({ id: row.call_id, _fromParticipant: true })
      },
    )

    .subscribe()

  return { unsubscribe: () => supabase.removeChannel(channel) }
}

// --- Phase 4: secure rewards & progression ----------------------------------

// Every valuable mutation runs inside a SECURITY DEFINER RPC that derives the

// user from auth.uid(), reads the authoritative price/odds from the database,

// and is idempotent via caller-supplied reference keys. The browser never

// writes balances, prices or rewards directly. All helpers return

// { data, error } like the rest of this module.

function rewardsUnavailable() {
  return {
    data: null,
    error: new Error(
      "Rewards need the Phase 4 database update — run migration 012 in Supabase",
    ),
  }
}

const missingFn = (err) =>
  /could not find|not exist|schema cache|PGRST202/i.test(err?.message || "")

export function friendlyRewardError(error) {
  const msg = String(error?.message || error || "")

  if (missingFn(error))
    return "Rewards aren't provisioned yet — run migration 012_phase4_rewards.sql in Supabase."

  if (/NOT_SIGNED_IN/i.test(msg)) return "Sign in to use rewards."

  if (/INSUFFICIENT_COINS/i.test(msg)) return "Not enough coins for that."

  if (/INVALID_REWARD|REWARD_UNAVAILABLE/i.test(msg))
    return "That reward is no longer available."

  if (/INVALID_QTY/i.test(msg)) return "That quantity isn't allowed."

  if (/OUT_OF_STOCK/i.test(msg)) return "That reward is out of stock."

  if (/RECIPIENT_NOT_FOUND/i.test(msg))
    return "Couldn't find that user anymore."

  if (/INVALID_RECIPIENT/i.test(msg)) return "You can't send a gift there."

  if (/NOT_OWNED/i.test(msg))
    return "You don't own that anymore — syncing your collection."

  if (/ALREADY_CLAIMED/i.test(msg))
    return "Already claimed — your next box lands after midnight UTC."

  if (
    /INVALID_AMOUNT|INVALID_REASON|INVALID_REF|INVALID_DAY|INVALID_BOX|INVALID_ACHIEVEMENT/i.test(
      msg,
    )
  )
    return "That request didn't look right — please try again."

  if (/DAILY_CAP/i.test(msg))
    return "Daily earning limit reached — impressive grind. Come back tomorrow."

  if (
    /failed to fetch|networkerror|network request failed|load failed/i.test(msg)
  )
    return "You're offline — it'll sync when you reconnect."

  return msg.length > 160 ? "Something went wrong — please try again." : msg
}

async function callRewardsFn(name, args) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") }

  try {
    const { data, error } = await supabase.rpc(name, args)

    if (error) return { data: null, error }

    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function fetchBalance() {
  return callRewardsFn("sf_balance", {})
}

export async function awardCoinsRpc(amount, reason, refKey, metadata = {}) {
  return callRewardsFn("sf_award_coins", {
    p_amount: amount,

    p_reason: String(reason || "").slice(0, 120),

    p_ref_key: String(refKey || "").slice(0, 128),

    p_metadata: metadata || {},
  })
}

export async function purchaseRewardRpc(rewardId, qty, idempotencyKey) {
  return callRewardsFn("sf_purchase", {
    p_reward_id: rewardId,

    p_qty: Math.max(1, Math.min(99, Math.floor(Number(qty) || 1))),

    p_idempotency_key: String(idempotencyKey || "").slice(0, 128),
  })
}

export async function giftRewardRpc(
  rewardId,
  qty,
  recipientId,
  idempotencyKey,
) {
  return callRewardsFn("sf_gift", {
    p_reward_id: rewardId,

    p_qty: Math.max(1, Math.min(99, Math.floor(Number(qty) || 1))),

    p_recipient_id: recipientId,

    p_idempotency_key: String(idempotencyKey || "").slice(0, 128),
  })
}

export async function purchaseDealRpc(rewardId, idempotencyKey) {
  return callRewardsFn("sf_purchase_deal", {
    p_reward_id: rewardId,

    p_idempotency_key: String(idempotencyKey || "").slice(0, 128),
  })
}

export async function consumeRewardRpc(rewardId, qty, sellBack, refKey) {
  return callRewardsFn("sf_consume", {
    p_reward_id: rewardId,

    p_qty: Math.max(1, Math.min(99, Math.floor(Number(qty) || 1))),

    p_sell_back: sellBack === true,

    p_ref_key: refKey ? String(refKey).slice(0, 128) : null,
  })
}

export async function loadDailyDeals() {
  if (!supabase)
    return { data: [], error: new Error("Backend is not configured") }

  try {
    const { data, error } = await supabase.rpc("sf_daily_deals")

    if (error) return { data: [], error }

    return { data: data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

export async function unlockAchievementRpc(achievementId, refKey) {
  return callRewardsFn("sf_unlock_achievement", {
    p_achievement_id: achievementId,

    p_ref_key: String(refKey || "").slice(0, 128),
  })
}

export async function recordStreakDayRpc(refKey, day = null) {
  // p_day must be OMITTED when null — passing it as JSON null overrides the

  // SQL default CURRENT_DATE and sf_streak_day raises INVALID_DAY, which

  // silently failed every cloud streak sync.

  const args = { p_ref_key: String(refKey || "").slice(0, 128) }

  if (day != null && day !== "") args.p_day = day

  return callRewardsFn("sf_streak_day", args)
}

export async function openMysteryBoxRpc(boxType, refKey) {
  return callRewardsFn("sf_open_box", {
    p_box_type: boxType,

    p_ref_key: String(refKey || "").slice(0, 128),
  })
}

// --- Phase 4 reads (self-only RLS on every table) ----------------------------

async function rewardsRead(table, orderCol) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") }

  try {
    let q = supabase.from(table).select("*")

    if (orderCol) q = q.order(orderCol, { ascending: false })

    const { data, error } = await q.limit(200)

    if (error) return { data: null, error }

    return { data: data || [], error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function loadRewardCatalog() {
  if (!supabase)
    return { data: [], error: new Error("Backend is not configured") }

  try {
    const { data, error } = await supabase

      .from("rewards")

      .select("id,name,category,emoji,price,description,active,rarity,stock")

      .eq("active", true)

      .order("price", { ascending: true })

      .limit(300)

    if (error) return { data: [], error }

    return { data: data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

export async function loadAchievementDefs() {
  if (!supabase)
    return { data: [], error: new Error("Backend is not configured") }

  try {
    const { data, error } = await supabase

      .from("achievement_defs")

      .select("id,name,description,icon,requirement,reward_coins")

      .eq("active", true)

    if (error) return { data: [], error }

    return { data: data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

export const loadCoinTransactions = () =>
  rewardsRead("coin_transactions", "created_at")

export const loadPurchaseHistory = () => rewardsRead("purchases", "created_at")

export const loadInventory = () => rewardsRead("user_inventory", "acquired_at")

export const loadUserAchievements = () =>
  rewardsRead("user_achievements", "unlocked_at")

export const loadBoxOpenings = () =>
  rewardsRead("mystery_box_openings", "opened_at")

export async function loadStreak() {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { data: null, error: new Error("Not signed in") }

    const { data, error } = await supabase

      .from("streaks")

      .select("current_streak,longest_streak,last_activity_date")

      .eq("user_id", user.id)

      .maybeSingle()

    if (error) return { data: null, error }

    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// --- Phase 3: core productivity data (tasks, notes, techniques) -------------

// Every helper resolves the user from the authenticated Supabase session —

// never from a client-supplied id — and returns { data, error } like the rest

// of this module. RLS on each table is the real ownership enforcement; these

// functions simply never query outside the session user's rows.

async function requireUserId() {
  if (!supabase)
    return { userId: null, error: new Error("Cloud sync is not configured") }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { userId: null, error: new Error("Not signed in") }

  return { userId: user.id, error: null }
}

const iso = (v) => (v ? new Date(v).toISOString() : null)

// Tasks ----------------------------------------------------------------------

export async function cloudListTasks() {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const { data, error: e } = await supabase

    .from("tasks")

    .select(
      "id,text,desc,done,pomodoros,due_at,client_created_at,client_updated_at",
    )

    .eq("user_id", userId)

  if (e) return { data: null, error: e }

  return {
    data: (data || []).map((r) => ({
      id: r.id,

      text: r.text,

      desc: r.desc || "",

      done: Boolean(r.done),

      pomodoros: r.pomodoros || 0,

      dueAt: r.due_at,

      clientCreatedAt: r.client_created_at,

      clientUpdatedAt: r.client_updated_at,
    })),

    error: null,
  }
}

const taskRow = (userId, t) => ({
  user_id: userId,

  id: String(t.id).slice(0, 64),

  text: String(t.text || "").slice(0, 500),

  desc: String(t.desc || "").slice(0, 2000),

  done: Boolean(t.done),

  pomodoros: Math.max(0, Number(t.pomodoros) || 0),

  due_at: t.dueAt ? iso(t.dueAt) : null,

  client_created_at: iso(t.created ?? t.clientCreatedAt),

  client_updated_at: iso(t.updated ?? t.clientUpdatedAt),
})

// Upsert = offline-created tasks (already keyed by their client id) sync back

// without remapping or duplication.

export async function cloudUpsertTasks(tasks) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (!tasks?.length) return { data: null, error: null }

  const { error: e } = await supabase

    .from("tasks")

    .upsert(
      tasks.map((t) => taskRow(userId, t)),
      { onConflict: "user_id,id" },
    )

  return e ? { data: null, error: e } : { data: true, error: null }
}

export async function cloudDeleteTask(id) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const { error: e } = await supabase

    .from("tasks")

    .delete()

    .eq("user_id", userId)

    .eq("id", String(id).slice(0, 64))

  return e ? { data: null, error: e } : { data: true, error: null }
}

// Notes ----------------------------------------------------------------------

export async function cloudListNotes() {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const { data, error: e } = await supabase

    .from("user_notes")

    .select("id,kind,title,payload,client_created_at,client_updated_at")

    .eq("user_id", userId)

  if (e) return { data: null, error: e }

  return {
    data: (data || []).map((r) => ({
      id: r.id,

      kind: r.kind,

      title: r.title,

      payload: r.payload || {},

      clientCreatedAt: r.client_created_at,

      clientUpdatedAt: r.client_updated_at,
    })),

    error: null,
  }
}

const NOTE_TITLES = {
  cornell: (p) => p.title || "Untitled",

  feynman: (p) => p.topic || "Untitled",

  mindmap: (p) => p.title || "Untitled",
}

export async function cloudUpsertNotes(kind, notes) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (!notes?.length) return { data: null, error: null }

  const rows = notes.map((n) => ({
    user_id: userId,

    id: String(n.id).slice(0, 64),

    kind,

    title: String(NOTE_TITLES[kind]?.(n) ?? n.title ?? "").slice(0, 300),

    payload: n,

    client_created_at: iso(n.created ?? n.clientCreatedAt),

    client_updated_at: iso(n.updated ?? n.clientUpdatedAt),
  }))

  const { error: e } = await supabase

    .from("user_notes")

    .upsert(rows, { onConflict: "user_id,id" })

  return e ? { data: null, error: e } : { data: true, error: null }
}

export async function cloudDeleteNote(kind, id) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const { error: e } = await supabase

    .from("user_notes")

    .delete()

    .eq("user_id", userId)

    .eq("kind", kind)

    .eq("id", String(id).slice(0, 64))

  return e ? { data: null, error: e } : { data: true, error: null }
}

// Technique assessment -------------------------------------------------------

export async function cloudGetAssessment() {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const { data, error: e } = await supabase

    .from("technique_assessments")

    .select("done,skipped,answers,scores,top,signals,taken_at")

    .eq("user_id", userId)

    .maybeSingle()

  if (e) return { data: null, error: e }

  return {
    data: data
      ? {
          done: Boolean(data.done),

          skipped: Boolean(data.skipped),

          answers: data.answers || [],

          scores: data.scores || {},

          top: data.top || [],

          signals: data.signals || {},

          takenAt: data.taken_at,
        }
      : null,

    error: null,
  }
}

export async function cloudSaveAssessment(techCheck) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const row = {
    user_id: userId,

    done: Boolean(techCheck?.done),

    skipped: Boolean(techCheck?.skipped),

    answers: Array.isArray(techCheck?.answers) ? techCheck.answers : [],

    scores: techCheck?.scores || {},

    top: Array.isArray(techCheck?.top) ? techCheck.top : [],

    signals: techCheck?.signals || {},

    taken_at: techCheck?.date ? iso(techCheck.date) : new Date().toISOString(),

    updated_at: new Date().toISOString(),
  }

  const { error: e } = await supabase

    .from("technique_assessments")

    .upsert(row, { onConflict: "user_id" })

  return e ? { data: null, error: e } : { data: true, error: null }
}

// Technique usage ------------------------------------------------------------

export async function cloudGetTechniqueUsage() {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const { data, error: e } = await supabase

    .from("technique_usage")

    .select("technique_id,uses,focus_minutes")

    .eq("user_id", userId)

  if (e) return { data: null, error: e }

  const uses = {}

  const minutes = {}

  ;(data || []).forEach((r) => {
    uses[r.technique_id] = r.uses || 0

    minutes[r.technique_id] = r.focus_minutes || 0
  })

  return { data: { uses, minutes }, error: null }
}

export async function cloudSaveTechniqueUsage(uses, minutes) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const ids = [
    ...new Set([...Object.keys(uses || {}), ...Object.keys(minutes || {})]),
  ]

  if (!ids.length) return { data: true, error: null }

  const rows = ids.map((id) => ({
    user_id: userId,

    technique_id: String(id).slice(0, 64),

    uses: Math.max(0, Number(uses?.[id]) || 0),

    focus_minutes: Math.max(0, Number(minutes?.[id]) || 0),

    updated_at: new Date().toISOString(),
  }))

  const { error: e } = await supabase

    .from("technique_usage")

    .upsert(rows, { onConflict: "user_id,technique_id" })

  return e ? { data: null, error: e } : { data: true, error: null }
}

// --- Phase 5: music library metadata + playlists ------------------------------

// Audio binaries stay device-local in IndexedDB; only lightweight metadata

// and user-curated playlists sync. Same conventions as Phase 3: the user

// always comes from the session (never a client-supplied id), rows are keyed

// by client id so offline creates upsert back without remapping.

// Tracks ---------------------------------------------------------------------

const trackRow = (userId, t) => ({
  user_id: userId,

  id: String(t.id).slice(0, 64),

  title: String(t.title || t.name || "Untitled track").slice(0, 160),

  artist: String(t.artist || "").slice(0, 160),

  album: String(t.album || "").slice(0, 160),

  file_name: String(t.fileName || t.name || "").slice(0, 300),

  mime: String(t.type || "").slice(0, 120),

  size_bytes: Math.max(0, Number(t.size) || 0),

  duration_sec: Math.max(0, Math.round(Number(t.duration) || 0)),

  fingerprint: String(t.fingerprint || "").slice(0, 160),

  client_created_at: iso(t.created ?? t.clientCreatedAt),

  client_updated_at: iso(t.updated ?? t.clientUpdatedAt),
})

export async function cloudListMusicTracks() {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const { data, error: e } = await supabase

    .from("music_tracks")

    .select(
      "id,title,artist,album,file_name,mime,size_bytes,duration_sec,fingerprint,client_created_at,client_updated_at",
    )

    .eq("user_id", userId)

  if (e) return { data: null, error: e }

  return {
    data: (data || []).map((r) => ({
      id: r.id,

      title: r.title || "Untitled track",

      name: r.title || "Untitled track",

      artist: r.artist || "",

      album: r.album || "",

      fileName: r.file_name || "",

      type: r.mime || "",

      size: r.size_bytes || 0,

      duration: r.duration_sec || 0,

      fingerprint: r.fingerprint || "",

      imported: true,

      missing: true, // audio is device-local; presence is verified per device

      clientCreatedAt: r.client_created_at,

      clientUpdatedAt: r.client_updated_at,
    })),

    error: null,
  }
}

export async function cloudUpsertMusicTracks(tracks) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (!tracks?.length) return { data: null, error: null }

  const { error: e } = await supabase

    .from("music_tracks")

    .upsert(
      tracks.map((t) => trackRow(userId, t)),
      { onConflict: "user_id,id" },
    )

  return e ? { data: null, error: e } : { data: true, error: null }
}

export async function cloudDeleteMusicTrack(id) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const { error: e } = await supabase

    .from("music_tracks")

    .delete()

    .eq("user_id", userId)

    .eq("id", String(id).slice(0, 64))

  return e ? { data: null, error: e } : { data: true, error: null }
}

// Playlists ------------------------------------------------------------------

export async function cloudListPlaylists() {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const [{ data: lists, error: e1 }, { data: links, error: e2 }] =
    await Promise.all([
      supabase

        .from("music_playlists")

        .select("id,name,description,cover,client_created_at,client_updated_at")

        .eq("user_id", userId),

      supabase

        .from("music_playlist_tracks")

        .select("playlist_id,track_id,position")

        .eq("user_id", userId)

        .order("position", { ascending: true }),
    ])

  if (e1) return { data: null, error: e1 }

  if (e2) return { data: null, error: e2 }

  const byList = {}

  ;(links || []).forEach((l) => {
    ;(byList[l.playlist_id] = byList[l.playlist_id] || []).push(l.track_id)
  })

  return {
    data: (lists || []).map((r) => ({
      id: r.id,

      name: r.name,

      description: typeof r.description === "string" ? r.description : "",

      cover: typeof r.cover === "string" && r.cover ? r.cover : "sunset",

      songIds: byList[r.id] || [],

      clientCreatedAt: r.client_created_at,

      clientUpdatedAt: r.client_updated_at,
    })),

    error: null,
  }
}

export async function cloudUpsertPlaylists(playlists) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (!playlists?.length) return { data: null, error: null }

  const rows = playlists.map((p) => ({
    user_id: userId,

    id: String(p.id).slice(0, 64),

    name: String(p.name || "Untitled playlist").slice(0, 80),

    description: String(p.description || "").slice(0, 300),

    cover: String(p.cover || "sunset").slice(0, 40),

    client_created_at: iso(p.createdAt ?? p.clientCreatedAt),

    client_updated_at: iso(p.updatedAt ?? p.clientUpdatedAt),
  }))

  const { error: e } = await supabase

    .from("music_playlists")

    .upsert(rows, { onConflict: "user_id,id" })

  if (e) return { data: null, error: e }

  // Membership is small: rewrite the full ordered link set per playlist.

  for (const p of playlists) {
    const pid = String(p.id).slice(0, 64)

    const del = await supabase

      .from("music_playlist_tracks")

      .delete()

      .eq("user_id", userId)

      .eq("playlist_id", pid)

    if (del.error) return { data: null, error: del.error }

    const ids = [
      ...new Set((p.songIds || []).map((s) => String(s).slice(0, 64))),
    ]

    if (!ids.length) continue

    const ins = await supabase.from("music_playlist_tracks").insert(
      ids.map((tid, i) => ({
        user_id: userId,
        playlist_id: pid,
        track_id: tid,
        position: i,
      })),
    )

    if (ins.error) return { data: null, error: ins.error }
  }

  return { data: true, error: null }
}

export async function cloudDeletePlaylist(id) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const pid = String(id).slice(0, 64)

  const { error: e } = await supabase

    .from("music_playlists")

    .delete()

    .eq("user_id", userId)

    .eq("id", pid)

  return e ? { data: null, error: e } : { data: true, error: null }
}

// Song favorites (020 widened the generic favorites table to item_type='song').

// Discrete user gestures only — never per-play writes.

export async function cloudSetSongFavorite(songId, on) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const itemId = String(songId || "").slice(0, 160)

  if (!itemId) return { data: null, error: new Error("Pick a song first") }

  if (on) {
    return supabase

      .from("favorites")

      .upsert({ user_id: userId, item_id: itemId, item_type: "song" }, {
        onConflict: "user_id,item_id",
      })
  }

  return supabase

    .from("favorites")

    .delete()

    .eq("user_id", userId)

    .eq("item_id", itemId)

    .eq("item_type", "song")
}

export async function cloudListSongFavorites() {
  const { userId, error } = await requireUserId()

  if (error) return { data: [], error }

  const res = await supabase

    .from("favorites")

    .select("item_id")

    .eq("user_id", userId)

    .eq("item_type", "song")

    .limit(500)

  if (res.error) {
    if (/does not exist|schema cache/i.test(res.error.message || ""))
      return { data: [], error: null }

    return res
  }

  return {
    data: (res.data || []).map((r) => r.item_id).filter(Boolean),
    error: null,
  }
}

// --- Phase 7: community, groups, stories & notifications ----------------------

// Role enforcement, ownership transfer, notification fan-out and the directory

// lockdown all live in migration 016 SECURITY DEFINER RPCs. The browser calls

// those RPCs and performs only self-scoped direct reads/writes that RLS

// allows. Every helper returns { data, error }.

// Callers should treat "Community needs the Phase 7 database update" as

// "offline / legacy project" and fall back to local-only behavior.

function phase7Unavailable() {
  return {
    data: null,

    error: new Error(
      "Community needs the Phase 7 database update — run migration 016 in Supabase",
    ),
  }
}

function isMissingRpc(error) {
  return /not find|does not exist|schema cache|function .* does not exist|not found in schema cache|Could not find the function/i.test(
    error?.message || "",
  )
}

function cleanId(id) {
  return String(id || "").slice(0, 64)
}

// --- secure directory (identity fields only, blocks hidden server-side) ------

export async function getPublicProfiles(ids) {
  if (!supabase)
    return { data: [], error: new Error("Backend is not configured") }

  const list = [
    ...new Set((ids || []).map((v) => String(v)).filter(Boolean)),
  ].slice(0, 100)

  if (!list.length) return { data: [], error: null }

  return supabase.rpc("get_public_profiles", { p_ids: list })
}

// Another user's accepted friends (+ mutual flag vs the caller). Needs the

// list_user_friends RPC (migration 026) — without it the profile friends

// section simply stays hidden.

export async function listUserFriends(userId) {
  if (!supabase)
    return { data: [], error: new Error("Backend is not configured") }

  if (!userId) return { data: [], error: null }

  const res = await supabase.rpc("list_user_friends", {
    p_user: String(userId),
  })

  if (res.error && isMissingRpc(res.error))
    return {
      data: null,
      error: new Error("Friends list needs migration 026 in Supabase"),
    }

  return res
}

// --- groups (private + public, owner/admin/member roles) ---------------------

export async function groupCreate({
  name,
  description = "",
  logo = "book",
  topics = [],
  visibility = "private",
} = {}) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const id = `g-${Date.now().toString(36)}-${String(userId).slice(0, 8)}`

  const res = await supabase.rpc("sf_group_create", {
    p_id: id,

    p_name: String(name || "Group"),

    p_description: String(description || ""),

    p_logo: String(logo || "book").slice(0, 8),

    p_topics: Array.isArray(topics) ? topics.map((t) => String(t)) : [],

    p_visibility: visibility === "public" ? "public" : "private",
  })

  if (res.error) {
    if (isMissingRpc(res.error)) return phase7Unavailable()

    return res
  }

  return { data: { id }, error: null }
}

export async function groupAddMember(groupId, userId, role = "member") {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_group_add_member", {
    p_group_id: cleanId(groupId),

    p_user_id: userId,

    p_role: role === "admin" ? "admin" : "member",
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function groupSetMember(groupId, userId, action) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_group_set_member", {
    p_group_id: cleanId(groupId),

    p_user_id: userId,

    p_action: action,
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function groupLeave(groupId) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_group_leave", {
    p_group_id: cleanId(groupId),
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function groupTransfer(groupId, userId) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_group_transfer", {
    p_group_id: cleanId(groupId),

    p_user_id: userId,
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function groupDelete(groupId) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_group_delete", {
    p_group_id: cleanId(groupId),
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function groupUpdate(groupId, patch = {}) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_group_update", {
    p_group_id: cleanId(groupId),

    p_name: patch.name ?? null,

    p_description: patch.description ?? null,

    p_logo: patch.logo ?? null,

    p_topics: Array.isArray(patch.topics)
      ? patch.topics.map((t) => String(t))
      : null,

    p_avatar_path: patch.avatarPath ?? null,

    p_visibility: patch.visibility ?? null,
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function groupRole(groupId) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") }

  const res = await supabase.rpc("sf_group_role", {
    p_group_id: cleanId(groupId),
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

// Groups the signed-in user belongs to, with their role.

export async function getMyGroups() {
  const { userId, error } = await requireUserId()

  if (error) return { data: [], error }

  const res = await supabase

    .from("group_memberships")

    .select(
      "role,joined_at,muted_at,groups(id,owner_id,name,description,logo,focus_topics,visibility,avatar_path,created_at)",
    )

    .eq("user_id", userId)

    .order("joined_at", { ascending: false })

    .limit(200)

  if (res.error) {
    if (/does not exist|schema cache/i.test(res.error.message || ""))
      return { data: [], error: null }

    return res
  }

  return {
    data: (res.data || [])
      .filter((r) => r.groups)
      .map((r) => ({
        ...r.groups,
        myRole: r.role,
        joinedAt: r.joined_at,
        mutedAt: r.muted_at,
      })),

    error: null,
  }
}

// Member roster with public identity fields merged in.

export async function getGroupMembers(groupId) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: [], error: authError }

  const res = await supabase

    .from("group_memberships")

    .select("user_id,role,joined_at")

    .eq("group_id", cleanId(groupId))

    .order("joined_at", { ascending: true })

    .limit(500)

  if (res.error) return res

  const rows = res.data || []

  const { data: profiles } = await getPublicProfiles(rows.map((r) => r.user_id))

  const byId = new Map((profiles || []).map((p) => [p.id, p]))

  return {
    data: rows.map((r) => ({
      ...r,
      ...(byId.get(r.user_id) || { id: r.user_id }),
    })),

    error: null,
  }
}

// --- messaging history / edit / soft-delete ----------------------------------

const MESSAGE_COLUMNS =
  "id,group_id,sender_id,recipient_id,text,attachment_path,kind,metadata,created_at,edited_at"

export async function loadConversation({
  groupId,
  recipientId,
  limit = 60,
  before = null,
} = {}) {
  const { userId, error } = await requireUserId()

  if (error) return { data: [], error }

  let q = supabase

    .from("messages")

    .select(MESSAGE_COLUMNS)

    .is("deleted_at", null)

    .order("created_at", { ascending: false })

    .limit(Math.min(Math.max(limit || 60, 1), 100))

  if (groupId) {
    q = q.eq("group_id", cleanId(groupId))
  } else if (recipientId) {
    q = q.or(
      `and(sender_id.eq.${userId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${userId})`,
    )
  } else {
    return { data: [], error: new Error("Pick a conversation first") }
  }

  if (before) q = q.lt("created_at", before)

  const res = await q

  if (res.error) {
    if (/does not exist|schema cache/i.test(res.error.message || ""))
      return { data: [], error: null }

    return res
  }

  return { data: (res.data || []).reverse(), error: null }
}

export async function editCloudMessage(messageId, text) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const clean = String(text || "").slice(0, 4000)

  if (!clean.trim()) return { data: null, error: new Error("Message is empty") }

  return supabase

    .from("messages")

    .update({ text: clean, edited_at: new Date().toISOString() })

    .eq("id", messageId)

    .eq("sender_id", userId)

    .select(MESSAGE_COLUMNS)

    .maybeSingle()
}

export async function deleteCloudMessage(messageId) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_message_delete", {
    p_message_id: messageId,
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

// --- message reactions (021): toggle is server-verified, reads are RLS ----

const REACT_EMOJI = ["heart", "thumbsUp", "laugh", "wow", "cry", "clap"]

export async function reactToMessage(messageId, emoji) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  if (!REACT_EMOJI.includes(emoji))
    return { data: null, error: new Error("Unknown reaction") }

  const res = await supabase.rpc("sf_react_toggle", {
    p_message_id: messageId,
    p_emoji: emoji,
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function loadMessageReactions(messageIds) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: [], error: authError }

  const ids = [...new Set((messageIds || []).filter(Boolean))].slice(0, 300)

  if (!ids.length) return { data: [], error: null }

  const res = await supabase

    .from("message_reactions")

    .select("message_id,user_id,emoji")

    .in("message_id", ids)

    .limit(2000)

  if (res.error) {
    if (/does not exist|schema cache/i.test(res.error.message || ""))
      return { data: [], error: null }

    return res
  }

  return res
}

// --- friendships ---------------------------------------------------------------

export async function listFriendships() {
  const { userId, error } = await requireUserId()

  if (error) return { data: [], error }

  const res = await supabase

    .from("friendships")

    .select("id,user_id,friend_id,status,created_at")

    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

    .order("created_at", { ascending: false })

    .limit(500)

  if (res.error) {
    if (/does not exist|schema cache/i.test(res.error.message || ""))
      return { data: [], error: null }

    return res
  }

  return res
}

export async function sendFriendRequest(friendId) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (!friendId || friendId === userId)
    return { data: null, error: new Error("Pick another user first") }

  // Plain insert first: the INSERT..SELECT in an upsert+select returns the

  // written row under its own SELECT policies, which rejected the mirrored

  // 'accepted' row and failed the whole request (42501) — the flaw that made

  // friend adds silently do nothing for the other user.

  const res = await supabase

    .from("friendships")

    .insert({ user_id: userId, friend_id: friendId, status: "pending" })

    .select("id,user_id,friend_id,status")

    .single()

  if (res.error && !/duplicate|unique|409/i.test(res.error.message || ""))
    return res

  // Row exists (re-request, or they already added us): converge to accepted —

  // this UPDATE is now legal for the requester (023 requester-accept policy).

  return supabase

    .from("friendships")

    .update({ status: "accepted" })

    .eq("user_id", userId)

    .eq("friend_id", friendId)

    .select("id,user_id,friend_id,status")

    .maybeSingle()
}

export async function respondFriendRequest(requestId, accept) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (accept) {
    const res = await supabase

      .from("friendships")

      .update({ status: "accepted" })

      .eq("id", requestId)

      .eq("friend_id", userId)

      .select("id,user_id,friend_id,status")

      .maybeSingle()

    if (!res.error && res.data) {
      // Best-effort connection nudge; a missing RPC must not fail the accept.

      try {
        await supabase.rpc("sf_notify", {
          p_type: "connection",

          p_event_key: `conn:${res.data.user_id}:${userId}`,

          p_entity_id: null,

          p_metadata: {},

          p_group_id: null,

          p_user_id: res.data.user_id,
        })
      } catch {
        /* ignore */
      }
    }

    return res
  }

  return supabase
    .from("friendships")
    .delete()
    .eq("id", requestId)
    .eq("friend_id", userId)
}

export async function removeFriend(otherUserId) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  return supabase

    .from("friendships")

    .delete()

    .or(
      `and(user_id.eq.${userId},friend_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},friend_id.eq.${userId})`,
    )
}

// --- blocks --------------------------------------------------------------------

export async function listBlocks() {
  const { userId, error } = await requireUserId()

  if (error) return { data: [], error }

  const res = await supabase

    .from("community_blocks")

    .select("blocked_id,created_at")

    .eq("blocker_id", userId)

    .order("created_at", { ascending: false })

    .limit(500)

  if (res.error) {
    if (/does not exist|schema cache/i.test(res.error.message || ""))
      return { data: [], error: null }

    return res
  }

  return res
}

export async function blockUser(blockedId) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (!blockedId || blockedId === userId)
    return { data: null, error: new Error("Pick another user first") }

  const res = await supabase

    .from("community_blocks")

    .upsert({ blocker_id: userId, blocked_id: blockedId }, {
      onConflict: "blocker_id,blocked_id",
    })

  // Blocking severs the connection in both directions so DMs stop.

  await supabase

    .from("friendships")

    .delete()

    .or(
      `and(user_id.eq.${userId},friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},friend_id.eq.${userId})`,
    )

  return res
}

export async function unblockUser(blockedId) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  return supabase

    .from("community_blocks")

    .delete()

    .eq("blocker_id", userId)

    .eq("blocked_id", blockedId)
}

// --- notifications (server-templated via sf_notify) ------------------------------

export async function notifyEvent({
  type,
  eventKey,
  entityId = null,
  metadata = {},
  groupId = null,
  userId = null,
} = {}) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_notify", {
    p_type: type,

    p_event_key: String(eventKey || "").slice(0, 128),

    p_entity_id: entityId ? String(entityId).slice(0, 128) : null,

    p_metadata: metadata || {},

    p_group_id: groupId ? cleanId(groupId) : null,

    p_user_id: userId || null,
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function listNotifications(limit = 30) {
  const { userId, error } = await requireUserId()

  if (error) return { data: [], error }

  return supabase

    .from("notifications")

    .select("id,title,text,type,entity_id,metadata,read_at,created_at")

    .eq("user_id", userId)

    .order("created_at", { ascending: false })

    .limit(Math.min(Math.max(limit || 30, 1), 100))
}

export async function markNotificationRead(notificationId) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  return supabase

    .from("notifications")

    .update({ read_at: new Date().toISOString() })

    .eq("id", notificationId)

    .eq("user_id", userId)
}

export async function markAllNotificationsRead() {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  return supabase

    .from("notifications")

    .update({ read_at: new Date().toISOString() })

    .eq("user_id", userId)

    .is("read_at", null)
}

// --- stories (24h, public/connections/private) -------------------------------------

// Optional presentation/music metadata (031). Always a plain object; unknown

// keys stripped so a client bug can never bloat the row. Empty object for

// legacy rows / no extras — never null (column is NOT NULL default '{}').

function cleanStoryMeta(meta) {
  if (!meta || typeof meta !== "object") return {}

  const out = {}

  const cap = meta.captionPos

  if (["bottom", "center", "top"].includes(cap)) out.captionPos = cap

  const bg = meta.bgStyle

  if (typeof bg === "string" && bg.length <= 32) out.bgStyle = bg

  const al = meta.textAlign

  if (["left", "center", "right"].includes(al)) out.textAlign = al

  const ts = meta.textSize

  if (["sm", "md", "lg"].includes(ts)) out.textSize = ts

  const st = meta.textStyle

  if (["plain", "shadow", "stroke"].includes(st)) out.textStyle = st

  const em = meta.emoji

  if (typeof em === "string" && em.length <= 8) out.emoji = em

  const vv = Number(meta.videoVol)

  if (Number.isFinite(vv) && vv >= 0 && vv <= 1)
    out.videoVol = Math.round(vv * 100) / 100

  const m = meta.music

  if (m && typeof m === "object") {
    const path = typeof m.path === "string" ? m.path.slice(0, 500) : ""

    if (path) {
      out.music = {
        path,

        title: String(m.title || "").slice(0, 160),

        artist: String(m.artist || "").slice(0, 160),

        start: Math.max(0, Math.min(Number(m.start) || 0, 3600)),

        end: Math.max(0, Math.min(Number(m.end) || 0, 3600)),

        vol: Math.max(0, Math.min(Number(m.vol ?? 0.7), 1)),
      }
    }
  }

  return out
}

export async function createStory({
  text = "",
  mediaPath = null,
  kind = "text",
  visibility = "connections",
  meta = null,
} = {}) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const clean = String(text || "").slice(0, 500)

  if (!clean.trim() && !mediaPath)
    return {
      data: null,
      error: new Error("Write something, add a photo, or attach a video first"),
    }

  if (!["public", "connections", "private"].includes(visibility))
    visibility = "connections"

  if (!["text", "image", "video"].includes(kind))
    kind = mediaPath ? "image" : "text"

  if (kind === "text" && mediaPath) kind = "image"

  if (kind !== "text" && !mediaPath) kind = "text"

  return supabase

    .from("stories")

    .insert({
      user_id: userId,

      kind,

      text: clean,

      media_path: mediaPath ? String(mediaPath).slice(0, 500) : null,

      visibility,

      meta: cleanStoryMeta(meta),

      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    })

    .select(
      "id,user_id,kind,text,media_path,visibility,expires_at,created_at,meta",
    )

    .single()
}

export async function listStories(limit = 60) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: [], error: authError }

  const res = await supabase

    .from("stories")

    .select(
      "id,user_id,kind,text,media_path,visibility,expires_at,created_at,meta",
    )

    .gt("expires_at", new Date().toISOString())

    .order("created_at", { ascending: false })

    .limit(Math.min(Math.max(limit || 60, 1), 100))

  if (res.error) {
    // Pre-031 schema: retry without meta so statuses still load after a

    // partial deploy (meta simply comes back undefined → treated as {}).

    if (/meta|column/i.test(res.error.message || "")) {
      const legacy = await supabase

        .from("stories")

        .select(
          "id,user_id,kind,text,media_path,visibility,expires_at,created_at",
        )

        .gt("expires_at", new Date().toISOString())

        .order("created_at", { ascending: false })

        .limit(Math.min(Math.max(limit || 60, 1), 100))

      if (!legacy.error)
        return {
          data: (legacy.data || []).map((r) => ({ ...r, meta: {} })),
          error: null,
        }
    }

    if (/does not exist|schema cache/i.test(res.error.message || ""))
      return { data: [], error: null }

    return res
  }

  return res
}

export async function viewStory(storyId) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_story_view", { p_story_id: storyId })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function deleteStory(storyId) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  return supabase
    .from("stories")
    .delete()
    .eq("id", storyId)
    .eq("user_id", userId)
}

// --- Phase 7 completion: group avatars, story photos, mute sync ---------------

// Private buckets (studyflow-groups / studyflow-stories), so reads go through

// short-lived signed URLs cached in memory — never object URLs (nothing to

// revoke), never base64 in localStorage, never blobs in text columns.

const GROUP_BUCKET = "studyflow-groups"

const STORY_BUCKET = "studyflow-stories"

const GROUP_AVATAR_MAX = 2 * 1024 * 1024

const STORY_PHOTO_MAX = 50 * 1024 * 1024

export { validateImageFile, IMAGE_FORMAT_ERROR }

export const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

// "Muted forever" sentinel: a real timestamptz so expiry comparisons keep

// working on every client (matches 017_phase7_completion.sql).

export const MUTE_FOREVER_AT = "9999-12-31T00:00:00.000Z"

const signedUrlCache = new Map() // "bucket:path" -> { url, exp }

function cacheSignedUrl(bucket, path, url, expiresIn = 3600) {
  const key = `${bucket}:${path}`

  if (signedUrlCache.size >= 120) {
    const oldest = signedUrlCache.keys().next().value

    signedUrlCache.delete(oldest)
  }

  signedUrlCache.set(key, {
    url,
    exp: Date.now() + Math.max(60, expiresIn - 120) * 1000,
  })
}

async function cachedSignedUrl(bucket, path, expiresIn = 3600) {
  if (!supabase || !path)
    return { data: null, error: new Error("Storage is not configured") }

  const key = `${bucket}:${path}`

  const hit = signedUrlCache.get(key)

  if (hit && hit.exp > Date.now())
    return { data: { signedUrl: hit.url }, error: null }

  signedUrlCache.delete(key)

  const res = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (!res.error && res.data?.signedUrl)
    cacheSignedUrl(bucket, path, res.data.signedUrl, expiresIn)

  return res
}

export function dropCachedUrl(bucket, path) {
  signedUrlCache.delete(`${bucket}:${path}`)
}

function extFor(file) {
  const byType = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/pjpeg": "jpg",

    "image/png": "png",
    "image/x-png": "png",

    "image/webp": "webp",
    "image/gif": "gif",

    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",

    "video/x-m4v": "m4v",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",

    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",

    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/flac": "flac",

    "audio/opus": "opus",
    "audio/webm": "weba",
  }

  const t =
    byType[
      String(file.type || "")
        .toLowerCase()
        .trim()
    ]

  if (t) return t

  const ext = String(file.name || "")
    .split(/[?#]/)[0]
    .split(".")
    .pop()

    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8)

  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return ext

  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return ext

  if (["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"].includes(ext))
    return ext

  return "jpg"
}

// Group avatar: path groups/{groupId}/avatar.{ext} — storage RLS allows

// owner/admin writes and member reads; the DB (sf_group_update / policies)

// stays authoritative for who may change it.

export async function uploadGroupAvatar(groupId, file) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (!userId)
    return {
      data: null,
      error: new Error("Sign in to change the group avatar"),
    }

  const bad = await validateImageFile(
    file,
    GROUP_AVATAR_MAX,
    "upload-group-avatar",
  )

  if (bad) return { data: null, error: new Error(bad) }

  const gid = cleanId(groupId)

  if (!gid) return { data: null, error: new Error("Pick a group first") }

  const role = await supabase
    .rpc("sf_group_role", { p_group_id: gid })
    .catch(() => ({ data: null }))

  if (role?.data !== "owner" && role?.data !== "admin")
    return {
      data: null,
      error: new Error(
        "Only the group owner or an admin can change the avatar",
      ),
    }

  const path = `groups/${gid}/avatar.${extFor(file)}`

  const res = await supabase.storage.from(GROUP_BUCKET).upload(path, file, {
    upsert: true,

    contentType: file.type || undefined,
  })

  if (res.error) return { data: null, error: res.error }

  dropCachedUrl(GROUP_BUCKET, path)

  return { data: { path }, error: null }
}

export async function removeGroupAvatar(path) {
  if (!supabase || !path) return { error: null }

  dropCachedUrl(GROUP_BUCKET, path)

  const { error } = await supabase.storage.from(GROUP_BUCKET).remove([path])

  return { error }
}

export async function getGroupAvatarUrl(path, expiresIn = 3600) {
  return cachedSignedUrl(GROUP_BUCKET, path, expiresIn)
}

// Story photo: user-scoped path {uid}/{storyId}.{ext} — 009 owner RLS covers

// writes, 016 visible-read covers reads through a live story row.

export async function uploadStoryPhoto(file) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  const bad = await validateImageFile(
    file,
    STORY_PHOTO_MAX,
    "upload-story-photo",
  )

  if (bad) return { data: null, error: new Error(bad) }

  const sid = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const path = `${userId}/${sid}.${extFor(file)}`

  // The validated File above is the exact upload payload: same object, same

  // bytes, same MIME (contentType preserves file.type verbatim).

  const res = await supabase.storage.from(STORY_BUCKET).upload(path, file, {
    upsert: false,

    contentType: file.type || undefined,
  })

  try {
    // Full error shape (DevTools only — plain object, no tokens): the

    // StorageApiError message alone ("database schema is invalid...") does

    // not say WHICH dependency failed, so status/code/details are kept.

    const e = res.error

    console.debug("[sf-story-upload] storage-result", {
      ok: !e,
      path,
      contentType: file.type || "(none)",

      error: e ? String(e.message || e) : null,

      name: e?.name || null,

      status: e?.statusCode ?? e?.status ?? null,

      code: e?.code || null,

      details: e?.details || null,

      hint: e?.hint || null,
    })
  } catch {
    /* diagnostics must never break uploads */
  }

  if (res.error) return { data: null, error: res.error }

  return { data: { path }, error: null }
}

// Story video: same bucket/RLS as photos, video MIME only, size-capped at

// STORY_PHOTO_MAX (50 MB, bucket has 64 MB headroom via 027). No image magic

// check — videos are validated by MIME + extension + size.

export const STORY_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/3gpp",
])

export const STORY_VIDEO_MAX = 50 * 1024 * 1024

export async function uploadStoryVideo(file) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (!file || typeof file.size !== "number" || !(file.size > 0))
    return { data: null, error: new Error("Choose a video file first") }

  if (file.size > STORY_VIDEO_MAX)
    return {
      data: null,
      error: new Error("Video is too large. Maximum size is 50 MB."),
    }

  const mime = String(file.type || "")
    .toLowerCase()
    .trim()

  const ext = String(file.name || "")
    .split(/[?#]/)[0]
    .split(".")
    .pop()
    .toLowerCase()

  if (
    !STORY_VIDEO_TYPES.has(mime) &&
    !["mp4", "webm", "mov", "m4v", "3gp"].includes(ext)
  )
    return { data: null, error: new Error("Use an MP4, WebM or MOV video.") }

  const sid = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const path = `${userId}/${sid}.${extFor(file)}`

  const res = await supabase.storage.from(STORY_BUCKET).upload(path, file, {
    upsert: false,

    contentType: file.type || mime || "video/mp4",
  })

  try {
    console.debug("[sf-story-upload] storage-result", {
      ok: !res.error,
      path,
      contentType: file.type || "(none)",
      kind: "video",

      error: res.error ? String(res.error.message || res.error) : null,
    })
  } catch {
    /* diagnostics must never break uploads */
  }

  if (res.error) return { data: null, error: res.error }

  return { data: { path }, error: null }
}

// Attached status music: user's OWN library track bytes (IndexedDB blob →

// storage) at a stable path {uid}/music/{hash}.{ext} with upsert so the same

// song is uploaded once and reused by every status that attaches it. Only the

// clip metadata lives on the story row (meta.music); viewers stream this

// object. Never fetches third-party/copyrighted URLs.

export async function uploadStoryMusic(file, musicId) {
  const { userId, error } = await requireUserId()

  if (error) return { data: null, error }

  if (!file || typeof file.size !== "number" || !(file.size > 0))
    return {
      data: null,
      error: new Error("That track has no audio data on this device"),
    }

  if (file.size > STORY_PHOTO_MAX)
    return {
      data: null,
      error: new Error("Track is too large to attach (max 50 MB)"),
    }

  const mid =
    String(musicId || "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64) ||
    (crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : String(Date.now()))

  const path = `${userId}/music/${mid}.${extFor(file)}`

  const res = await supabase.storage.from(STORY_BUCKET).upload(path, file, {
    upsert: true,

    contentType: file.type || "audio/mpeg",
  })

  if (res.error) return { data: null, error: res.error }

  dropCachedUrl(STORY_BUCKET, path)

  return { data: { path }, error: null }
}

export async function deleteStoryMedia(path) {
  if (!supabase || !path) return { error: null }

  dropCachedUrl(STORY_BUCKET, path)

  const { error } = await supabase.storage.from(STORY_BUCKET).remove([path])

  return { error }
}

export async function getStoryMediaUrl(path, expiresIn = 3600) {
  return cachedSignedUrl(STORY_BUCKET, path, expiresIn)
}

// Mute sync: the sf_mute_set RPC (017) updates ONLY muted_at on the caller's

// own membership row. mutedAtIso is an ISO string or null (unmute).

export async function setCloudMute(groupId, mutedAtIso) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: null, error: authError }

  const res = await supabase.rpc("sf_mute_set", {
    p_group_id: cleanId(groupId),

    p_muted_at: mutedAtIso || null,
  })

  if (res.error && isMissingRpc(res.error)) return phase7Unavailable()

  return res
}

export async function listStoryViews(storyId) {
  const { error: authError } = await requireUserId()

  if (authError) return { data: [], error: authError }

  const res = await supabase

    .from("story_views")

    .select("viewer_id,viewed_at")

    .eq("story_id", storyId)

    .order("viewed_at", { ascending: false })

    .limit(200)

  if (res.error) {
    if (/does not exist|schema cache/i.test(res.error.message || ""))
      return { data: [], error: null }

    return res
  }

  return res
}

// --- Storage diagnostics (DevTools console only, no UI) ----------------------

// window.__sfStorageDiag(): isolates "Storage upload" from "story creation".

// Uploads generated PNG bytes to {uid}/diag-{ts}.png, reports the full

// result, then deletes the object. Nothing persists. Call it from DevTools:

//   await window.__sfStorageDiag()

async function storageDiag() {
  const report = { at: new Date().toISOString(), steps: {} }

  try {
    if (!supabase) {
      report.steps.session = { ok: false, error: "Supabase is not configured" }

      return report
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    report.steps.session = { ok: Boolean(user), userId: user?.id || null }

    if (!user) return report

    const buckets = await supabase.storage.listBuckets()

    const rows = buckets.data || []

    const pick = (id) => rows.find((b) => b.id === id) || null

    const summarize = (b) =>
      b
        ? {
            id: b.id,
            name: b.name,
            public: b.public,
            owner: b.owner || null,

            file_size_limit: b.file_size_limit ?? null,

            allowed_mime_types: b.allowed_mime_types ?? null,
          }
        : null

    report.steps.buckets = {
      ok: !buckets.error,

      stories: summarize(pick(STORY_BUCKET)),

      avatars: summarize(pick("studyflow-avatars")),

      groups: summarize(pick(GROUP_BUCKET)),

      files: summarize(pick("studyflow-files")),

      storiesBucketPresent: Boolean(pick(STORY_BUCKET)),

      error: buckets.error
        ? String(buckets.error.message || buckets.error)
        : null,
    }

    // Minimal valid PNG (signature + IHDR): content is irrelevant to the

    // storage layer, but valid bytes rule out content sniffing entirely.

    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,

      0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0,
      0,
    ])

    const blob = new Blob([bytes], { type: "image/png" })

    const path = `${user.id}/diag-${Date.now()}.png`

    const up = await supabase.storage.from(STORY_BUCKET).upload(path, blob, {
      contentType: "image/png",

      upsert: false,
    })

    report.steps.upload = {
      ok: !up.error,
      path,

      error: up.error ? String(up.error.message || up.error) : null,

      name: up.error?.name || null,

      status: up.error?.statusCode ?? up.error?.status ?? null,

      code: up.error?.code || null,

      details: up.error?.details || null,

      hint: up.error?.hint || null,
    }

    if (!up.error) {
      const del = await supabase.storage.from(STORY_BUCKET).remove([path])

      report.steps.cleanup = {
        ok: !del.error,
        error: del.error ? String(del.error.message || del.error) : null,
      }
    }

    // Avatar-bucket control (§8): same bytes, same user, same mechanism.

    // stories=fail + avatars=ok  → bucket-specific (row metadata or a

    // stories-only policy). Both fail → shared dependency (some INSERT

    // policy evaluated for every bucket) or platform-level storage fault.

    const avPath = `${user.id}/diag-${Date.now()}.png`

    const av = await supabase.storage
      .from("studyflow-avatars")
      .upload(avPath, blob, {
        contentType: "image/png",

        upsert: false,
      })

    report.steps.avatarControl = {
      ok: !av.error,
      path: avPath,

      error: av.error ? String(av.error.message || av.error) : null,

      name: av.error?.name || null,

      status: av.error?.statusCode ?? av.error?.status ?? null,

      code: av.error?.code || null,
    }

    if (!av.error) {
      const del = await supabase.storage
        .from("studyflow-avatars")
        .remove([avPath])

      report.steps.avatarCleanup = {
        ok: !del.error,
        error: del.error ? String(del.error.message || del.error) : null,
      }
    }
  } catch (err) {
    report.steps.fatal = { ok: false, error: String(err?.message || err) }
  }

  try {
    if (typeof window !== "undefined") {
      window.__sfLastStorageDiag = report

      console.debug("[sf-story-upload] storage-diag", report)
    }
  } catch {
    /* ignore */
  }

  return report
}

try {
  if (typeof window !== "undefined") window.__sfStorageDiag = storageDiag
} catch {
  /* ignore */
}
