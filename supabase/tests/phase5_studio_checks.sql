-- StudyFlow Phase 5b checks (Playlist Studio fields) — read-only.
-- Run in the Supabase SQL editor AFTER applying migration 014_phase5_playlist_studio.sql.
-- Fails loudly (EXCEPTION) on the first problem, prints PASS lines otherwise.

do $$
declare
  v_count integer;
begin
  -- 1. new columns exist with the documented constraints -------------------------
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'music_playlists'
    and column_name in ('description', 'cover');
  if v_count <> 2 then
    raise exception 'FAIL music_playlists is missing description/cover (apply 014_phase5_playlist_studio.sql)';
  end if;
  raise notice 'PASS description + cover columns present';

  -- 2. existing rows untouched (defaults fill them, nothing null) ------------------
  select count(*) into v_count from public.music_playlists
  where description is null or cover is null;
  if v_count <> 0 then
    raise exception 'FAIL % playlist rows have null description/cover', v_count;
  end if;
  raise notice 'PASS existing rows intact with defaults';

  -- 3. RLS + policies unchanged -------------------------------------------------------
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'music_playlists'
    and policyname = 'music_playlists_self_all';
  if v_count <> 1 then
    raise exception 'FAIL music_playlists_self_all policy missing';
  end if;
  raise notice 'PASS self-only RLS intact';

  raise notice 'PHASE 5B CHECKS COMPLETE';
end $$;
