-- StudyFlow Phase 5 (music library metadata + playlists).
--
-- Audio binaries stay device-local in IndexedDB (the product's existing,
-- intentional design: "Files are stored in this browser"). This migration
-- persists only lightweight metadata and user-curated playlists so they
-- follow the account across devices; a track whose audio isn't on this
-- device simply shows as missing/re-importable.
--
-- Free-plan safe: plain tables, btree indexes, RLS, no extensions, no cron,
-- no Edge Functions, no realtime additions, no Storage buckets.

-- ---------------------------------------------------------------------------
-- 1. music_tracks — one row per imported track (client id = primary key part)
-- ---------------------------------------------------------------------------
create table if not exists public.music_tracks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 160),
  artist text not null default '' check (char_length(artist) <= 160),
  album text not null default '' check (char_length(album) <= 160),
  file_name text not null default '' check (char_length(file_name) <= 300),
  mime text not null default '' check (char_length(mime) <= 120),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  duration_sec integer not null default 0 check (duration_sec >= 0),
  fingerprint text not null default '' check (char_length(fingerprint) <= 160),
  client_created_at timestamptz,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists music_tracks_user_activity_idx
  on public.music_tracks (user_id, client_updated_at desc nulls last, updated_at desc);

drop trigger if exists music_tracks_touch_updated_at on public.music_tracks;
create trigger music_tracks_touch_updated_at
  before update on public.music_tracks
  for each row execute procedure public.touch_updated_at();

alter table public.music_tracks enable row level security;

drop policy if exists music_tracks_self_all on public.music_tracks;
create policy music_tracks_self_all on public.music_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. music_playlists — user-curated playlists (client id = primary key part)
-- ---------------------------------------------------------------------------
create table if not exists public.music_playlists (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  client_created_at timestamptz,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists music_playlists_user_activity_idx
  on public.music_playlists (user_id, client_updated_at desc nulls last, updated_at desc);

drop trigger if exists music_playlists_touch_updated_at on public.music_playlists;
create trigger music_playlists_touch_updated_at
  before update on public.music_playlists
  for each row execute procedure public.touch_updated_at();

alter table public.music_playlists enable row level security;

drop policy if exists music_playlists_self_all on public.music_playlists;
create policy music_playlists_self_all on public.music_playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. music_playlist_tracks — ordered membership (no FK to tracks: the audio
--    may legitimately live on only one of the user's devices)
-- ---------------------------------------------------------------------------
create table if not exists public.music_playlist_tracks (
  user_id uuid not null references auth.users(id) on delete cascade,
  playlist_id text not null,
  track_id text not null check (char_length(track_id) between 1 and 64),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, playlist_id, track_id),
  foreign key (user_id, playlist_id)
    references public.music_playlists (user_id, id) on delete cascade
);

create index if not exists music_playlist_tracks_order_idx
  on public.music_playlist_tracks (user_id, playlist_id, position);

alter table public.music_playlist_tracks enable row level security;

drop policy if exists music_playlist_tracks_self_all on public.music_playlist_tracks;
create policy music_playlist_tracks_self_all on public.music_playlist_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
