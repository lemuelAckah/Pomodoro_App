-- StudyFlow Phase 5 checks (music metadata + playlists) — read-only.
-- Run in the Supabase SQL editor AFTER applying migration 013_phase5_music.sql.
-- Fails loudly (EXCEPTION) on the first problem, prints PASS lines otherwise.
-- Complements (does not modify) earlier phase check files.

do $$
declare
  v_count integer;
begin
  -- 1. required tables with RLS -------------------------------------------------
  select count(*) into v_count from pg_tables
  where schemaname = 'public'
    and tablename in ('music_tracks', 'music_playlists', 'music_playlist_tracks')
    and rowsecurity;
  if v_count <> 3 then
    raise exception 'FAIL expected 3 phase-5 tables with RLS, found % (apply 013_phase5_music.sql)', v_count;
  end if;
  raise notice 'PASS all 3 phase-5 tables exist with RLS enabled';

  -- 2. expected columns -----------------------------------------------------------
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'music_tracks'
    and column_name in ('id','user_id','title','artist','album','file_name','mime',
      'size_bytes','duration_sec','fingerprint','client_created_at','client_updated_at');
  if v_count <> 12 then
    raise exception 'FAIL music_tracks is missing columns (found %/12)', v_count;
  end if;
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'music_playlists'
    and column_name in ('id','user_id','name','client_created_at','client_updated_at');
  if v_count <> 5 then
    raise exception 'FAIL music_playlists is missing columns (found %/5)', v_count;
  end if;
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'music_playlist_tracks'
    and column_name in ('user_id','playlist_id','track_id','position');
  if v_count <> 4 then
    raise exception 'FAIL music_playlist_tracks is missing columns (found %/4)', v_count;
  end if;
  raise notice 'PASS expected columns present on all phase-5 tables';

  -- 3. primary keys ----------------------------------------------------------------
  select count(*) into v_count from pg_constraint
  where connamespace = 'public'::regnamespace
    and contype = 'p'
    and conrelid in ('public.music_tracks'::regclass,
      'public.music_playlists'::regclass,
      'public.music_playlist_tracks'::regclass);
  if v_count <> 3 then
    raise exception 'FAIL expected 3 primary keys, found %', v_count;
  end if;
  raise notice 'PASS primary keys present';

  -- 4. self-only RLS policies, no public access --------------------------------------
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and policyname in (
    'music_tracks_self_all', 'music_playlists_self_all',
    'music_playlist_tracks_self_all');
  if v_count <> 3 then
    raise exception 'FAIL expected 3 self-only policies, found %', v_count;
  end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public'
    and tablename in ('music_tracks', 'music_playlists', 'music_playlist_tracks')
    and (policyname ilike '%public%' or policyname ilike '%anon%' or policyname ilike '%everyone%');
  if v_count <> 0 then
    raise exception 'FAIL % overly-permissive policies on private music tables', v_count;
  end if;
  raise notice 'PASS self-only RLS policies, no public access';

  -- 5. performance indexes ---------------------------------------------------------------
  select count(*) into v_count from pg_indexes
  where schemaname = 'public'
    and indexname in ('music_tracks_user_activity_idx',
      'music_playlists_user_activity_idx',
      'music_playlist_tracks_order_idx');
  if v_count <> 3 then
    raise exception 'FAIL expected 3 phase-5 indexes, found %', v_count;
  end if;
  raise notice 'PASS phase-5 indexes present';

  -- 6. no audio binaries in the database ---------------------------------------------------
  -- (by design: binaries stay device-local in IndexedDB; only metadata syncs)
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public'
    and table_name in ('music_tracks', 'music_playlists', 'music_playlist_tracks')
    and data_type = 'bytea';
  if v_count <> 0 then
    raise exception 'FAIL % bytea columns — audio must not live in the database', v_count;
  end if;
  raise notice 'PASS no binary columns (device-local audio design intact)';

  -- 7. song favorites widened (020 follow-up) ----------------------------------------------
  select count(*) into v_count
  from pg_constraint
  where conrelid = 'public.favorites'::regclass
    and conname = 'favorites_item_type_check'
    and pg_get_constraintdef(oid) like '%song%';
  if v_count <> 1 then
    raise exception 'FAIL favorites check does not allow song ids (apply 020_phase5_song_favorites.sql)';
  end if;
  raise notice 'PASS song favorites allowed';

  raise notice 'PHASE 5 CHECKS COMPLETE';
end $$;
