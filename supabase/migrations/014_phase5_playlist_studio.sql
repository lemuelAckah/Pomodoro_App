-- StudyFlow Phase 5b (Playlist Studio fields).
--
-- Extends music_playlists with the description + cover art that the Playlist
-- Studio edits. New nullable-with-default columns only: existing rows are
-- untouched, no backfill needed, RLS/policies from 013 carry over unchanged.
--
-- Free-plan safe: two plain columns, no extensions, no functions, no RLS
-- changes, no Storage.

alter table public.music_playlists
  add column if not exists description text not null default ''
  check (char_length(description) <= 300);

alter table public.music_playlists
  add column if not exists cover text not null default 'sunset'
  check (char_length(cover) <= 40);
