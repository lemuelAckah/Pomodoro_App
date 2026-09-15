-- StudyFlow Phase 2 (auth & profiles): avatar photo storage pointer.
-- Run with Supabase SQL editor or `supabase db push` (apply after 001–009).
--
-- Free-plan safe. No existing tables are altered except adding one nullable
-- column. RLS rides on the existing profiles_self_all policy (self read/write);
-- the directory policy from 003 is unchanged.

-- Storage path of the user's avatar photo inside the `studyflow-avatars`
-- bucket (owner-folder layout: <user-uuid>/avatar-<ts>.<ext>). Empty when the
-- user has no photo; the app falls back to initials or a local data-URL.
alter table public.profiles
  add column if not exists photo_path text not null default '';
