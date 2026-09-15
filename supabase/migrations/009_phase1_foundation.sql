-- StudyFlow Phase 1 foundation: user settings + storage buckets for later phases.
-- Run with Supabase SQL editor or `supabase db push` (apply after 001–008).
--
-- Free-plan safe: plain tables, RLS, private buckets. No extensions, no cron,
-- no Edge Functions, no paid features. No existing tables are altered.

-- ---------------------------------------------------------------------------
-- 1. user_settings — one row per account for app preferences.
-- Frontend mapping (wired in a later phase, today lives in localStorage):
--   theme         <- equipped theme id, night mode
--   notifications <- chime style, volumes, per-type toggles
--   timer         <- focus/short/long durations
--   display       <- compact mode, text size
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (char_length(theme) between 1 and 64),
  notifications jsonb not null default '{}'::jsonb,
  timer jsonb not null default '{}'::jsonb,
  display jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists settings_touch_updated_at on public.user_settings;
create trigger settings_touch_updated_at
  before update on public.user_settings
  for each row execute procedure public.touch_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists settings_self_all on public.user_settings;
create policy settings_self_all on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- New accounts get a settings row alongside profile + progress.
-- (Body reproduces 001 exactly, plus the settings insert.)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, handle)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'Study Learner'), coalesce(new.raw_user_meta_data ->> 'handle', 'study_' || left(replace(new.id::text, '-', ''), 8)))
  on conflict (id) do nothing;
  insert into public.user_progress (user_id) values (new.id) on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

-- Backfill accounts created before this migration shipped.
insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Storage buckets for later phases. Buckets only — no files, no feature
-- code depends on them yet. Owner-folder layout: <user-uuid>/... so the
-- foldername() policies below stay airtight.
--
--   studyflow-avatars  PUBLIC   profile photos (meant to be seen by others)
--   studyflow-stories  private  24h story photo/video
--   studyflow-docs     private  exports, receipts, personal documents
--
-- Already provisioned by earlier migrations (left untouched):
--   studyflow-files    private  songs, message attachments
--   studyflow-books    private  book files + covers
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('studyflow-avatars', 'studyflow-avatars', true),
  ('studyflow-stories', 'studyflow-stories', false),
  ('studyflow-docs', 'studyflow-docs', false)
on conflict (id) do nothing;

-- Avatars: readable by anyone with the link (friends, groups, directory),
-- writable only by the owner into their own folder.
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'studyflow-avatars');
drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects
  for insert with check (bucket_id = 'studyflow-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
  for update using (bucket_id = 'studyflow-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
  for delete using (bucket_id = 'studyflow-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Stories: strictly owner-only (ephemeral media, deleted by the app after 24h).
drop policy if exists stories_owner_read on storage.objects;
create policy stories_owner_read on storage.objects
  for select using (bucket_id = 'studyflow-stories' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists stories_owner_insert on storage.objects;
create policy stories_owner_insert on storage.objects
  for insert with check (bucket_id = 'studyflow-stories' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists stories_owner_update on storage.objects;
create policy stories_owner_update on storage.objects
  for update using (bucket_id = 'studyflow-stories' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists stories_owner_delete on storage.objects;
create policy stories_owner_delete on storage.objects
  for delete using (bucket_id = 'studyflow-stories' and auth.uid()::text = (storage.foldername(name))[1]);

-- Docs: strictly owner-only.
drop policy if exists docs_owner_read on storage.objects;
create policy docs_owner_read on storage.objects
  for select using (bucket_id = 'studyflow-docs' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists docs_owner_insert on storage.objects;
create policy docs_owner_insert on storage.objects
  for insert with check (bucket_id = 'studyflow-docs' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists docs_owner_update on storage.objects;
create policy docs_owner_update on storage.objects
  for update using (bucket_id = 'studyflow-docs' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists docs_owner_delete on storage.objects;
create policy docs_owner_delete on storage.objects
  for delete using (bucket_id = 'studyflow-docs' and auth.uid()::text = (storage.foldername(name))[1]);
