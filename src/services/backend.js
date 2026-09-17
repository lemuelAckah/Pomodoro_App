import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const backendConfigured = Boolean(url && anonKey);
export const supabase = backendConfigured ? createClient(url, anonKey) : null;
const turnServers = (import.meta.env.VITE_TURN_SERVERS || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((urls) => ({
    urls,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  }));

// Translate raw Supabase/network errors into clear, user-friendly copy.
// Used by every auth surface so users never see "Invalid login credentials"
// or "Failed to fetch" verbatim.
export function friendlyAuthError(error) {
  const msg = String(error?.message || error || "");
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg))
    return "Can't reach the server — check your internet connection and try again.";
  if (/invalid login credentials/i.test(msg))
    return "Email or password is incorrect. Try again or reset your password.";
  if (/email not confirmed/i.test(msg))
    return "Please confirm your email first — check your inbox for the verification link.";
  if (/user already registered|already exists/i.test(msg))
    return "An account with this email already exists — sign in instead.";
  if (/password should be at least|weak password/i.test(msg))
    return "Your password is too short — use at least 6 characters.";
  if (/rate limit|too many requests/i.test(msg))
    return "Too many attempts — wait a minute and try again.";
  if (/signup requires a valid password/i.test(msg))
    return "Please enter a stronger password (at least 6 characters).";
  if (/unable to validate email|invalid email/i.test(msg))
    return "That email address doesn't look valid — double-check it.";
  if (/anonymous sign-ins|provider is not enabled|unsupported provider/i.test(msg))
    return "This sign-in method isn't available yet — use email and password.";
  if (/supabase is not configured|backend is not configured/i.test(msg))
    return "Cloud services aren't set up on this deployment — contact support.";
  if (/session missing|refresh_token_not_found|invalid claim/i.test(msg))
    return "Your session expired — please sign in again.";
  return msg.length > 160 ? "Something went wrong — please try again." : msg;
}

export async function signUpWithEmail(email, password, profile = {}) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.signUp({ email, password, options: { data: profile } });
}

export async function signInWithEmail(email, password) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.signInWithPassword({ email, password });
}

export async function resendVerification(email) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.resend({ type: "signup", email });
}

export async function searchUsers(query) {
  if (!supabase)
    return { data: [], error: new Error("Supabase is not configured") };
  const q = String(query || "").trim().replace(/[%_]/g, "");
  if (q.length < 2) return { data: [], error: null };
  return supabase
    .from("profiles")
    .select("id, handle, name, avatar")
    .or(`handle.ilike.%${q}%,name.ilike.%${q}%`)
    .limit(8);
}

export async function sendGiftNotification(userId, title, text) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.from("notifications").insert({
    user_id: userId,
    title,
    text: text || "",
  });
}

export async function requestPasswordReset(
  email,
  redirectTo = window.location.origin,
) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function updatePassword(newPassword) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.updateUser({ password: newPassword });
}

export async function signInWithProvider(provider) {
  if (!supabase)
    return { data: null, error: new Error("Supabase is not configured") };
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
}

export async function recordStorePurchase({ rewardId, qty, price }) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { data: null, error: new Error("Sign in to record purchases") };
  return supabase.from("purchases").insert({
    buyer_id: user.id,
    reward_id: rewardId,
    price,
    qty: Math.max(1, Math.floor(Number(qty) || 1)),
  });
}
export async function deleteMyBackendData() {
  if (!supabase)
    return { ok: true, signedIn: false, deleted: [], failures: [] };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { ok: true, signedIn: false, deleted: [], failures: [] };
  const uid = user.id;
  const deleted = [];
  const failures = [];
  const missingTable = (err) =>
    /does not exist|not find|schema cache|relation .* does not exist/i.test(
      err?.message || "",
    );
  async function wipe(table, build, label) {
    try {
      let query = supabase.from(table).delete();
      query = build(query);
      const { error } = await query;
      if (error) {
        if (missingTable(error)) {
          deleted.push(`${label} (not provisioned)`);
          return;
        }
        failures.push(`${label}: ${error.message}`);
        return;
      }
      deleted.push(label);
    } catch (err) {
      failures.push(`${label}: ${err?.message || "failed"}`);
    }
  }
  const eq = (col) => (q) => q.eq(col, uid);
  // Order matters: participants before the calls that cascade them,
  // owned groups before the rows that reference them.
  await wipe("call_participants", eq("user_id"), "call participations");
  await wipe("call_history", eq("initiator_id"), "call history");
  await wipe("groups", eq("owner_id"), "owned groups");
  await wipe("group_memberships", eq("user_id"), "group memberships");
  await wipe("friendships", (q) => q.or(`user_id.eq.${uid},friend_id.eq.${uid}`), "friendships");
  await wipe("messages", eq("sender_id"), "sent messages");
  await wipe("message_receipts", eq("user_id"), "message receipts");
  await wipe("notifications", eq("user_id"), "notifications");
  await wipe("purchases", eq("buyer_id"), "purchase records");
  await wipe("reports", eq("reporter_id"), "reports");
  await wipe("book_highlights", eq("user_id"), "book highlights");
  await wipe("book_bookmarks", eq("user_id"), "book bookmarks");
  await wipe("book_progress", eq("user_id"), "reading progress");
  await wipe("book_favorites", eq("user_id"), "book favorites");
  await wipe("books", eq("owner_id"), "uploaded books");
  await wipe("tasks", eq("user_id"), "tasks");
  await wipe("favorites", eq("user_id"), "favorites");
  await wipe("user_progress", eq("user_id"), "progress and coins");
  await wipe("user_settings", eq("user_id"), "settings");
  await wipe("user_state", eq("user_id"), "synced app state");
  await wipe("profiles", (q) => q.eq("id", uid), "profile");
  // Storage: every file under this user's folder, in each app bucket.
    try {
      for (const bucketName of ["studyflow-files", "studyflow-books", "studyflow-avatars", "studyflow-stories", "studyflow-docs"]) {
      const bucket = supabase.storage.from(bucketName);
      const paths = [];
      const top = await bucket.list(uid);
      if (top.error) {
        if (!missingTable(top.error) && top.error.message !== "Not Found")
          failures.push(`storage (${bucketName}): ${top.error.message}`);
        continue;
      }
      for (const entry of top.data || []) {
        if (entry?.id) {
          paths.push(`${uid}/${entry.name}`);
          continue;
        }
        const sub = await bucket.list(`${uid}/${entry.name}`);
        if (!sub.error) {
          for (const f of sub.data || []) {
            if (f?.id || (f?.name || "").includes("."))
              paths.push(`${uid}/${entry.name}/${f.name}`);
          }
        }
      }
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await bucket.remove(paths.slice(i, i + 100));
        if (error && !missingTable(error)) {
          failures.push(`storage (${bucketName}): ${error.message}`);
          break;
        }
      }
      if (!failures.some((f) => f.startsWith("storage:")))
        deleted.push(`storage files (${bucketName}, ${paths.length})`);
    }
  } catch (err) {
    failures.push(`storage: ${err?.message || "failed"}`);
  }
  return { ok: failures.length === 0, signedIn: true, deleted, failures };
}
export async function reportUser({ reportedUserId, reasons, details }) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { data: null, error: new Error("Sign in to submit a report") };
  if (!Array.isArray(reasons) || !reasons.length)
    return { data: null, error: new Error("Choose at least one reason") };
  return supabase.from("reports").insert({
    reporter_id: user.id,
    reported_user_id: reportedUserId || null,
    reasons: reasons.slice(0, 8),
    details: String(details || "").slice(0, 2000),
  });
}
export async function signOut() {
  if (!supabase) return { error: null };
  return supabase.auth.signOut({ scope: "global" });
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

// True only when a usable session exists (signUp with "confirm email" on
// returns a user but no session — callers must not treat that as signed in).
export async function hasActiveSession() {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data?.session?.access_token);
}

export function onAuthStateChange(callback) {
  if (!supabase) return { unsubscribe: () => {} };
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    callback(session?.user ?? null),
  );
  return data.subscription;
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
];

function toProfileRow(profile = {}) {
  const row = {};
  const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  for (const col of PROFILE_COLUMNS) {
    const v = profile[col] ?? profile[camel(col)];
    if (v !== undefined) row[col] = v;
  }
  if (typeof row.handle === "string") row.handle = row.handle.slice(0, 60);
  if (typeof row.name === "string") row.name = row.name.slice(0, 120);
  if (typeof row.bio === "string") row.bio = row.bio.slice(0, 500);
  if (typeof row.avatar === "string") row.avatar = row.avatar.slice(0, 8);
  if (typeof row.photo_path === "string")
    row.photo_path = row.photo_path.slice(0, 500);
  if (typeof row.email === "string") row.email = row.email.slice(0, 200);
  if (typeof row.country === "string") row.country = row.country.slice(0, 80);
  if (typeof row.phone === "string") row.phone = row.phone.slice(0, 40);
  if (typeof row.university === "string") row.university = row.university.slice(0, 160);
  if (row.subjects !== undefined && !Array.isArray(row.subjects))
    row.subjects = [];
  else if (Array.isArray(row.subjects))
    row.subjects = row.subjects.slice(0, 12).map((s) => String(s).slice(0, 80));
  return row;
}

export async function syncProfile(profile) {
  const user = await getCurrentUser();
  if (!supabase || !user)
    return { data: null, error: new Error("Sign in to sync your profile") };
  let row = toProfileRow(profile);
  if (!Object.keys(row).length)
    return { data: null, error: null };
  // Resilient save: if the project's migrations lag behind the app (e.g. a
  // newer column like photo_path doesn't exist yet), drop the offending
  // column and retry instead of failing the whole save.
  let last = null;
  for (let attempt = 0; attempt <= PROFILE_COLUMNS.length; attempt++) {
    const res = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...row, updated_at: new Date().toISOString() });
    if (!res.error) return res;
    last = res;
    const m = /could not find the '([a-z_]+)' column|column "([a-z_]+)" does not exist/i.exec(
      res.error.message || "",
    );
    const col = m && (m[1] || m[2]);
    if (!col || !(col in row)) return res;
    delete row[col];
    if (!Object.keys(row).length) return res;
  }
  return last;
}

export async function loadOwnProfile() {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { data: null, error: new Error("Sign in to load your profile") };
  return supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
}

// --- Avatar photos (studyflow-avatars bucket, public read, owner write) ------
const AVATAR_BUCKET = "studyflow-avatars";

export function avatarPublicUrl(path) {
  if (!supabase || !path) return null;
  try {
    return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data
      .publicUrl;
  } catch {
    return null;
  }
}

export async function uploadAvatar(file) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { data: null, error: new Error("Sign in to upload a photo") };
  const ext = String(file.name || "")
    .split(".")
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8) || "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
  if (error) return { data: null, error };
  return { data: { path }, error: null };
}

export async function removeAvatar(path) {
  if (!supabase || !path) return { error: null };
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  return { error };
}

// --- User settings (user_settings table, self-only RLS) ----------------------
export async function loadUserSettings() {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { data: null, error: new Error("Sign in to load settings") };
  return supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
}

export async function saveUserSettings(patch) {
  if (!supabase)
    return { data: null, error: new Error("Backend is not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { data: null, error: new Error("Sign in to save settings") };
  const row = { user_id: user.id, updated_at: new Date().toISOString() };
  for (const k of ["theme", "notifications", "timer", "display"]) {
    if (patch && patch[k] !== undefined) row[k] = patch[k];
  }
  if (typeof row.theme === "string") row.theme = row.theme.slice(0, 64) || "system";
  return supabase.from("user_settings").upsert(row);
}

export async function loadCloudState(table, userId) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") };
  return supabase.from(table).select("*").eq("user_id", userId);
}

export async function loadUserState(userId) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") };
  return supabase
    .from("user_state")
    .select("state, version, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
}

export async function syncUserState(userId, state) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") };
  return supabase
    .from("user_state")
    .upsert({
      user_id: userId,
      state,
      version: Date.now(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
}

export async function syncProgress(userId, progress) {
  if (!supabase || !userId)
    return { data: null, error: new Error("Cloud sync is not configured") };
  return supabase.from("user_progress").upsert({
    user_id: userId,
    ...progress,
    updated_at: new Date().toISOString(),
  });
}

export async function uploadUserFile(userId, file, folder = "uploads") {
  if (!supabase || !userId)
    return { data: null, error: new Error("Sign in to upload files") };
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-");
  const path = `${userId}/${folder}/${crypto.randomUUID()}-${safeName}`;
  const result = await supabase.storage
    .from("studyflow-files")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  return result.error ? result : { data: { path }, error: null };
}

export async function getUserFileUrl(path) {
  if (!supabase || !path)
    return { data: null, error: new Error("Storage is not configured") };
  return supabase.storage.from("studyflow-files").createSignedUrl(path, 3600);
}

const BOOK_BUCKET = "studyflow-books";

async function bookOwnerId() {
  if (!supabase) return { userId: null, error: new Error("Backend is not configured") };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, error: new Error("Sign in to use the book library") };
  return { userId: user.id, error: null };
}

export async function uploadBookFile(userId, file, folder = "books") {
  if (!supabase || !userId)
    return { data: null, error: new Error("Sign in to upload books") };
  const safeName = (file.name || "book").replace(/[^a-z0-9._-]/gi, "-").slice(0, 120);
  const path = `${userId}/${folder}/${crypto.randomUUID()}-${safeName}`;
  const result = await supabase.storage
    .from(BOOK_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  return result.error ? result : { data: { path }, error: null };
}

export async function getBookFileUrl(path, expiresIn = 3600) {
  if (!supabase || !path)
    return { data: null, error: new Error("Storage is not configured") };
  return supabase.storage.from(BOOK_BUCKET).createSignedUrl(path, expiresIn);
}

export async function downloadBookFile(path) {
  if (!supabase || !path)
    return { data: null, error: new Error("Storage is not configured") };
  return supabase.storage.from(BOOK_BUCKET).download(path);
}

export async function removeBookFile(path) {
  if (!supabase || !path) return { error: null };
  const { error } = await supabase.storage.from(BOOK_BUCKET).remove([path]);
  return { error };
}

export async function createBook(row) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  return supabase.from("books").insert({ ...row, owner_id: userId }).select().single();
}

export async function updateBook(id, patch) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  return supabase.from("books").update(patch).eq("id", id).eq("owner_id", userId).select().single();
}

export async function deleteBook(id) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  return supabase.from("books").delete().eq("id", id).eq("owner_id", userId);
}

export async function listMyBooks() {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: [], error };
  return supabase.from("books").select("*").eq("owner_id", userId).order("created_at", { ascending: false }).limit(200);
}

export async function listPublicBooks(limit = 60) {
  if (!supabase)
    return { data: [], error: new Error("Backend is not configured") };
  return supabase.from("books").select("id,title,author,description,category,tags,cover_path,file_path,file_type,file_size,page_count,word_count,allow_download,created_at,owner_id").eq("visibility", "public").order("created_at", { ascending: false }).limit(limit);
}

export async function getBook(id, userId) {
  if (!supabase || !id)
    return { data: null, error: new Error("Backend is not configured") };
  let q = supabase.from("books").select("*").eq("id", id);
  if (userId) q = q.or(`visibility.eq.public,owner_id.eq.${userId}`);
  else q = q.eq("visibility", "public");
  return q.maybeSingle();
}

export async function toggleBookFavorite(bookId, on) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  if (on) return supabase.from("book_favorites").upsert({ user_id: userId, book_id: bookId });
  return supabase.from("book_favorites").delete().eq("user_id", userId).eq("book_id", bookId);
}

export async function listBookFavorites() {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: [], error };
  return supabase.from("book_favorites").select("book_id,books(id,title,author,description,category,cover_path,file_type,allow_download,owner_id)").eq("user_id", userId);
}

export async function saveBookProgress(bookId, position) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  const pos = Math.min(1, Math.max(0, Number(position) || 0));
  return supabase.from("book_progress").upsert({ user_id: userId, book_id: bookId, position: pos });
}

export async function listBookProgress() {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: [], error };
  return supabase.from("book_progress").select("book_id,position,updated_at").eq("user_id", userId);
}

export async function listBookBookmarks(bookId) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: [], error };
  return supabase.from("book_bookmarks").select("*").eq("user_id", userId).eq("book_id", bookId).order("created_at", { ascending: true });
}

export async function addBookBookmark(bookId, label, locator) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  return supabase.from("book_bookmarks").insert({ user_id: userId, book_id: bookId, label: String(label || "").slice(0, 200), locator: String(locator || "").slice(0, 2000) }).select().single();
}

export async function removeBookBookmark(id) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  return supabase.from("book_bookmarks").delete().eq("id", id).eq("user_id", userId);
}

export async function listBookHighlights(bookId) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: [], error };
  return supabase.from("book_highlights").select("*").eq("user_id", userId).eq("book_id", bookId).order("created_at", { ascending: true });
}

export async function addBookHighlight(bookId, { color, excerpt, prefix, suffix, note }) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  const colors = ["yellow", "green", "blue", "pink", "purple"];
  return supabase.from("book_highlights").insert({
    user_id: userId, book_id: bookId,
    color: colors.includes(color) ? color : "yellow",
    excerpt: String(excerpt || "").slice(0, 2000),
    prefix: String(prefix || "").slice(0, 500),
    suffix: String(suffix || "").slice(0, 500),
    note: String(note || "").slice(0, 4000),
  }).select().single();
}

export async function updateBookHighlight(id, patch) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  const clean = {};
  if (patch.color) {
    const colors = ["yellow", "green", "blue", "pink", "purple"];
    if (colors.includes(patch.color)) clean.color = patch.color;
  }
  if (typeof patch.note === "string") clean.note = patch.note.slice(0, 4000);
  if (!Object.keys(clean).length) return { data: null, error: new Error("Nothing to update") };
  clean.updated_at = new Date().toISOString();
  return supabase.from("book_highlights").update(clean).eq("id", id).eq("user_id", userId).select().single();
}

export async function removeBookHighlight(id) {
  const { userId, error } = await bookOwnerId();
  if (error) return { data: null, error };
  return supabase.from("book_highlights").delete().eq("id", id).eq("user_id", userId);
}

// ---------- groups (public, user-created) ----------
async function groupOwnerId() {
  if (!supabase) return { userId: null, error: new Error("Backend is not configured") };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, error: new Error("Sign in to use groups") };
  return { userId: user.id, error: null };
}

export async function createCloudGroup(row) {
  const { userId, error } = await groupOwnerId();
  if (error) return { data: null, error };
  return supabase.from("groups").upsert({
    id: row.id,
    owner_id: userId,
    name: String(row.name || "Group").slice(0, 120),
    description: String(row.description || "").slice(0, 500),
    logo: row.logo || "📚",
    focus_topics: Array.isArray(row.focus_topics) ? row.focus_topics.slice(0, 8) : [],
    visibility: "public",
  });
}

export async function listPublicGroups(limit = 200) {
  if (!supabase)
    return { data: [], error: new Error("Backend is not configured") };
  return supabase
    .from("groups")
    .select("id,owner_id,name,description,logo,focus_topics,visibility,group_memberships(count)")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function joinCloudGroup(groupId, role = "member") {
  const { userId, error } = await groupOwnerId();
  if (error) return { data: null, error };
  return supabase
    .from("group_memberships")
    .upsert({ group_id: groupId, user_id: userId, role: role === "owner" ? "owner" : "member" });
}

export async function leaveCloudGroup(groupId) {
  const { userId, error } = await groupOwnerId();
  if (error) return { data: null, error };
  return supabase
    .from("group_memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
}

export async function deleteCloudGroup(groupId) {
  const { userId, error } = await groupOwnerId();
  if (error) return { data: null, error };
  return supabase.from("groups").delete().eq("id", groupId).eq("owner_id", userId);
}

export function subscribeToPresence(channelName, userInfo, onSync) {
  if (!supabase) return { untrack: () => {} };
  const channel = supabase
    .channel(channelName)
    .on("presence", { event: "sync" }, () => {
      try {
        const joined = Object.values(channel.presenceState()).flat();
        onSync?.(joined);
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
          });
        } catch {
          /* ignore */
        }
      }
    });
  return { untrack: () => supabase.removeChannel(channel) };
}

export function subscribeToConversation({
  groupId,
  recipientId,
  onMessage,
  onTyping,
  onRead,
}) {
  if (!supabase) return { unsubscribe: () => {}, sendTyping: async () => {} };
  const channelName = groupId
    ? `studyflow-messages:group:${groupId}`
    : `studyflow-messages:dm:${recipientId}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        ...(groupId
          ? { filter: `group_id=eq.${groupId}` }
          : { filter: `recipient_id=eq.${recipientId}` }),
      },
      (payload) => onMessage?.(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "message_receipts" },
      (payload) => onRead?.(payload.new),
    )
    .on("broadcast", { event: "typing" }, ({ payload }) => onTyping?.(payload))
    .subscribe();
  return {
    sendTyping: (userId, isTyping) =>
      channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId, isTyping },
      }),
    unsubscribe: () => supabase.removeChannel(channel),
  };
}

export async function sendCloudMessage(message) {
  if (!supabase)
    return {
      data: null,
      error: new Error("Realtime messaging is not configured"),
    };
  return supabase.from("messages").insert(message).select().single();
}

export async function markMessageRead(messageId, userId) {
  if (!supabase)
    return {
      data: null,
      error: new Error("Realtime messaging is not configured"),
    };
  return supabase.from("message_receipts").upsert({
    message_id: messageId,
    user_id: userId,
    read_at: new Date().toISOString(),
  });
}

export async function recordCall(call) {
  if (!supabase)
    return { data: null, error: new Error("Call history is not configured") };
  return supabase.from("call_history").insert(call).select().single();
}

export async function updateCall(callId, updates) {
  if (!supabase)
    return { data: null, error: new Error("Call history is not configured") };
  return supabase.from("call_history").update(updates).eq("id", callId);
}

export async function upsertCallParticipant(participant) {
  if (!supabase)
    return { data: null, error: new Error("Call history is not configured") };
  return supabase.from("call_participants").upsert(participant);
}

export function subscribeToUserState(userId, onChange) {
  if (!supabase || !userId) return { unsubscribe: () => {} };
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
      (payload) => onChange(payload.new?.state ?? null),
    )
    .subscribe();
  return { unsubscribe: () => supabase.removeChannel(channel) };
}

export function createSignalingRoom(roomId, userId, onSignal) {
  if (!supabase)
    return {
      send: async () => ({
        error: new Error("Realtime signaling is not configured"),
      }),
      close: () => {},
    };
  const channel = supabase.channel(`studyflow-call:${roomId}`, {
    config: { broadcast: { self: false } },
  });
  channel
    .on("broadcast", { event: "signal" }, ({ payload }) => {
      if (payload?.senderId !== userId) onSignal(payload);
    })
    .subscribe();
  return {
    send: (signal) =>
      channel.send({
        type: "broadcast",
        event: "signal",
        payload: { ...signal, senderId: userId },
      }),
    close: () => supabase.removeChannel(channel),
  };
}

export async function createWebRtcPeer({
  roomId,
  userId,
  initiator,
  stream,
  onTrack,
  onStateChange,
}) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }, ...turnServers],
  });
  const room = createSignalingRoom(roomId, userId, async (signal) => {
    if (signal.type === "offer") {
      await peer.setRemoteDescription(signal.description);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await room.send({ type: "answer", description: peer.localDescription });
    } else if (signal.type === "answer") {
      await peer.setRemoteDescription(signal.description);
    } else if (signal.type === "candidate" && signal.candidate) {
      await peer.addIceCandidate(signal.candidate);
    }
  });
  peer.onicecandidate = ({ candidate }) =>
    candidate && room.send({ type: "candidate", candidate });
  peer.ontrack = (event) => onTrack?.(event.streams[0]);
  peer.onconnectionstatechange = () => onStateChange?.(peer.connectionState);
  stream?.getTracks().forEach((track) => peer.addTrack(track, stream));
  if (initiator) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await room.send({ type: "offer", description: peer.localDescription });
  }
  return {
    peer,
    addStream: (mediaStream) =>
      mediaStream
        .getTracks()
        .forEach((track) => peer.addTrack(track, mediaStream)),
    close: () => {
      room.close();
      peer.close();
    },
  };
}

// --- Phase 3: core productivity data (tasks, notes, techniques) -------------
// Every helper resolves the user from the authenticated Supabase session —
// never from a client-supplied id — and returns { data, error } like the rest
// of this module. RLS on each table is the real ownership enforcement; these
// functions simply never query outside the session user's rows.

async function requireUserId() {
  if (!supabase)
    return { userId: null, error: new Error("Cloud sync is not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, error: new Error("Not signed in") };
  return { userId: user.id, error: null };
}

const iso = (v) => (v ? new Date(v).toISOString() : null);

// Tasks ----------------------------------------------------------------------

export async function cloudListTasks() {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
  const { data, error: e } = await supabase
    .from("tasks")
    .select("id,text,desc,done,pomodoros,due_at,client_created_at,client_updated_at")
    .eq("user_id", userId);
  if (e) return { data: null, error: e };
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
  };
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
});

// Upsert = offline-created tasks (already keyed by their client id) sync back
// without remapping or duplication.
export async function cloudUpsertTasks(tasks) {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
  if (!tasks?.length) return { data: null, error: null };
  const { error: e } = await supabase
    .from("tasks")
    .upsert(tasks.map((t) => taskRow(userId, t)), { onConflict: "user_id,id" });
  return e ? { data: null, error: e } : { data: true, error: null };
}

export async function cloudDeleteTask(id) {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
  const { error: e } = await supabase
    .from("tasks")
    .delete()
    .eq("user_id", userId)
    .eq("id", String(id).slice(0, 64));
  return e ? { data: null, error: e } : { data: true, error: null };
}

// Notes ----------------------------------------------------------------------

export async function cloudListNotes() {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
  const { data, error: e } = await supabase
    .from("user_notes")
    .select("id,kind,title,payload,client_created_at,client_updated_at")
    .eq("user_id", userId);
  if (e) return { data: null, error: e };
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
  };
}

const NOTE_TITLES = {
  cornell: (p) => p.title || "Untitled",
  feynman: (p) => p.topic || "Untitled",
  mindmap: (p) => p.title || "Untitled",
};

export async function cloudUpsertNotes(kind, notes) {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
  if (!notes?.length) return { data: null, error: null };
  const rows = notes.map((n) => ({
    user_id: userId,
    id: String(n.id).slice(0, 64),
    kind,
    title: String((NOTE_TITLES[kind]?.(n) ?? n.title ?? "")).slice(0, 300),
    payload: n,
    client_created_at: iso(n.created ?? n.clientCreatedAt),
    client_updated_at: iso(n.updated ?? n.clientUpdatedAt),
  }));
  const { error: e } = await supabase
    .from("user_notes")
    .upsert(rows, { onConflict: "user_id,id" });
  return e ? { data: null, error: e } : { data: true, error: null };
}

export async function cloudDeleteNote(kind, id) {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
  const { error: e } = await supabase
    .from("user_notes")
    .delete()
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("id", String(id).slice(0, 64));
  return e ? { data: null, error: e } : { data: true, error: null };
}

// Technique assessment -------------------------------------------------------

export async function cloudGetAssessment() {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
  const { data, error: e } = await supabase
    .from("technique_assessments")
    .select("done,skipped,answers,scores,top,signals,taken_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (e) return { data: null, error: e };
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
  };
}

export async function cloudSaveAssessment(techCheck) {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
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
  };
  const { error: e } = await supabase
    .from("technique_assessments")
    .upsert(row, { onConflict: "user_id" });
  return e ? { data: null, error: e } : { data: true, error: null };
}

// Technique usage ------------------------------------------------------------

export async function cloudGetTechniqueUsage() {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
  const { data, error: e } = await supabase
    .from("technique_usage")
    .select("technique_id,uses,focus_minutes")
    .eq("user_id", userId);
  if (e) return { data: null, error: e };
  const uses = {};
  const minutes = {};
  (data || []).forEach((r) => {
    uses[r.technique_id] = r.uses || 0;
    minutes[r.technique_id] = r.focus_minutes || 0;
  });
  return { data: { uses, minutes }, error: null };
}

export async function cloudSaveTechniqueUsage(uses, minutes) {
  const { userId, error } = await requireUserId();
  if (error) return { data: null, error };
  const ids = [...new Set([...Object.keys(uses || {}), ...Object.keys(minutes || {})])];
  if (!ids.length) return { data: true, error: null };
  const rows = ids.map((id) => ({
    user_id: userId,
    technique_id: String(id).slice(0, 64),
    uses: Math.max(0, Number(uses?.[id]) || 0),
    focus_minutes: Math.max(0, Number(minutes?.[id]) || 0),
    updated_at: new Date().toISOString(),
  }));
  const { error: e } = await supabase
    .from("technique_usage")
    .upsert(rows, { onConflict: "user_id,technique_id" });
  return e ? { data: null, error: e } : { data: true, error: null };
}
