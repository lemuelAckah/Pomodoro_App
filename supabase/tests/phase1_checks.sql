-- StudyFlow Phase 1 checks — read-only, safe to run any time.
-- Run in the Supabase SQL editor AFTER applying migrations 001–009.
-- Fails loudly (EXCEPTION) on the first problem, prints PASS notices otherwise.

do $$
declare
  v_count integer;
begin
  -- 1. Foundation tables exist ------------------------------------------------
  select count(*) into v_count
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('profiles', 'user_progress', 'user_state', 'user_settings');
  if v_count <> 4 then
    raise exception 'FAIL foundation tables: found % of 4 (profiles, user_progress, user_state, user_settings)', v_count;
  end if;
  raise notice 'PASS foundation tables present (4/4)';

  -- 2. RLS enabled on foundation tables ---------------------------------------
  select count(*) into v_count
  from pg_tables
  where schemaname = 'public'
    and tablename in ('profiles', 'user_progress', 'user_state', 'user_settings')
    and rowsecurity;
  if v_count <> 4 then
    raise exception 'FAIL RLS: enabled on % of 4 foundation tables', v_count;
  end if;
  raise notice 'PASS RLS enabled on foundation tables (4/4)';

  -- 3. Self-only policies exist (spot-check the Phase 1 additions) ------------
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'user_settings';
  if v_count < 1 then
    raise exception 'FAIL user_settings has no RLS policies';
  end if;
  raise notice 'PASS user_settings policies present';

  -- 4. Storage buckets for current + later phases ------------------------------
  select count(*) into v_count
  from storage.buckets
  where id in ('studyflow-files', 'studyflow-books', 'studyflow-avatars', 'studyflow-stories', 'studyflow-docs');
  if v_count <> 5 then
    raise exception 'FAIL storage buckets: found % of 5', v_count;
  end if;
  raise notice 'PASS storage buckets present (5/5)';

  -- 5. Buckets have the intended visibility ------------------------------------
  select count(*) into v_count
  from storage.buckets
  where id = 'studyflow-avatars' and public = true;
  if v_count <> 1 then
    raise exception 'FAIL studyflow-avatars should be the only public bucket';
  end if;
  select count(*) into v_count
  from storage.buckets
  where id in ('studyflow-files', 'studyflow-books', 'studyflow-stories', 'studyflow-docs') and public = true;
  if v_count <> 0 then
    raise exception 'FAIL a private bucket is marked public';
  end if;
  raise notice 'PASS bucket visibility (1 public, 4 private)';

  -- 6. Signup trigger seeds profile + progress + settings ----------------------
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    raise exception 'FAIL on_auth_user_created trigger missing';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    raise exception 'FAIL handle_new_user() function missing';
  end if;
  raise notice 'PASS signup trigger present';

  raise notice 'PHASE 1 FOUNDATION: ALL CHECKS PASSED';
end $$;
