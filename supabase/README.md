# StudyFlow — Supabase backend (Phase 1: foundation)

Vanilla JS + Vite frontend in `src/` talks to Supabase only through
`src/services/backend.js`. The app works fully offline: every backend call
first checks `backendConfigured` (env vars present) and degrades to
localStorage when cloud is unavailable. **No part of the UI depends on the
backend to boot.**

## Layout

```
supabase/
  migrations/   ordered SQL, applied 001 → 009 (filename order)
  tests/        read-only SQL checks (run in the SQL editor)
  README.md     this file
```

No `functions/` directory in Phase 1 — Edge Functions are deferred to a later
phase (Realtime + client calls cover everything so far, which keeps the Free
plan untouched).

## Applying migrations

Migrations are idempotent (`if not exists` / `drop … if exists` guards) and
safe to re-run. Pick one path:

**A. Dashboard SQL editor (simplest):** open each file in
`supabase/migrations/` in filename order, paste, run.

**B. Supabase CLI:** `supabase link --project-ref <ref>` then
`supabase db push`. (Repo filenames use the existing `00N_name` convention
rather than timestamp names; the SQL-editor path is primary.)

After applying, run `supabase/tests/phase1_checks.sql` in the SQL editor —
it raises on the first problem and prints `PASS` lines otherwise.

## Environment

Copy `.env.example` to `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Dashboard → Project Settings → API → anon / publishable key |
| `VITE_TURN_*` | Your TURN provider (voice calls, later phase) |

Rules:

- Only the **anon/publishable** key ever ships to the browser.
- The **service-role / secret key is never used** — not in code, not in env
  files, not in migrations (verified by repo scan; keep it that way).
- `.env` is git-ignored (`.gitignore` covers `.env*`). Only `.env.example`
  with placeholders is committed.

## Data model (foundation)

| Table | Key | RLS principle |
|---|---|---|
| `auth.users` (managed) | `id uuid` | Supabase Auth owns it |
| `public.profiles` | `id → auth.users` | self read/write; searchable directory read (see flag below) |
| `public.user_progress` | `user_id → auth.users` | self only (coins, sessions, focus) |
| `public.user_state` | `user_id → auth.users` | self only (JSON snapshot sync) |
| `public.user_settings` *(Phase 1)* | `user_id → auth.users` | self only (theme, notifications, timer, display as JSON) |

Signup trigger `on_auth_user_created → handle_new_user()` seeds
`profiles` + `user_progress` + `user_settings`; 009 backfills pre-existing
accounts. All timestamps are `timestamptz`; money/coins are non-negative
integers; every FK cascades on user delete.

Feature tables from earlier work (tasks, groups, messages, books, purchases,
…) all follow the same rule: **self-only unless sharing is explicit**
(public groups, public books, directory search).

## Storage architecture

Owner-folder layout everywhere: `<user-uuid>/…`, enforced with
`storage.foldername(name)` policies (same pattern as the existing buckets).

| Bucket | Visibility | Future use |
|---|---|---|
| `studyflow-files` *(existing)* | private | songs, message attachments |
| `studyflow-books` *(existing)* | private | book files + covers |
| `studyflow-avatars` *(Phase 1)* | **public** | profile photos (meant to be seen) |
| `studyflow-stories` *(Phase 1)* | private | 24h story photo/video (app deletes after expiry) |
| `studyflow-docs` *(Phase 1)* | private | data exports, payment receipts |

Nothing is uploaded in Phase 1 — buckets are provisioned empty with policies.

## Realtime (Free-plan budget)

7 tables publish changes (`messages`, `notifications`, `tasks`,
`user_state`, `message_receipts`, `call_history`, `call_participants`).
The frontend opens short-lived channels per open conversation/call plus one
user-state channel — no persistent fan-out, no polling loops. No change in
Phase 1.

## Known flags for later phases (do NOT fix blindly)

1. **Directory search reads full profile rows.** `profiles_directory_read`
   lets any signed-in user read `email`/`phone`/`country` of searchable
   profiles; `searchUsers()` only selects 4 safe columns, but the policy is
   table-wide. Proper fix (Phase 2, community): security-definer directory
   view or a split `profile_private` table — needs a coordinated
   migration + `backend.js` change, so it waits for its phase.
2. **Feature tables are intentionally untouched.** Tasks, music, books,
   community, coins, rewards, stories, notifications ship no new backend in
   Phase 1; their tables/policies from 001–008 remain exactly as they were.
3. **`user_settings` is provisioned but not yet wired** — the app still reads
   theme/notifications/timer/display from localStorage. Wiring is a Phase 2
   frontend task (`core.js` persist paths + `backend.js` sync helpers).

## Phase 2 — auth & profiles (applied)

- `010_phase2_auth.sql`: adds `profiles.photo_path` (avatar Storage pointer).
  RLS unchanged — the self read/write policy already covers it.
- `src/services/backend.js`: `loadOwnProfile`, avatar transport
  (`uploadAvatar` / `avatarPublicUrl` / `removeAvatar` on the
  `studyflow-avatars` bucket), `loadUserSettings` / `saveUserSettings`, and
  `deleteMyBackendData` now also wipes `user_settings` + avatar/story/doc
  folders.
- `src/core.js`: login hydrate pulls the profile row and the settings row
  (cloud wins, local photo pixels preserved when no cloud photo exists);
  fresh accounts publish local identity + settings. `pushUserSettings()` is
  called from settings toggles only — never from `persist()` — so offline
  use costs zero writes.
- `src/account.js`: profile photo uploads go to Storage (old file removed,
  circular design untouched); account page shows member-since/provider.
- Checks: `supabase/tests/phase2_checks.sql`.
