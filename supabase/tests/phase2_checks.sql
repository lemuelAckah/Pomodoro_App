-- StudyFlow Phase 2 checks (auth & profiles) — read-only, safe to run any time.
-- Run in the Supabase SQL editor AFTER applying migrations 001–010.
-- Fails loudly (EXCEPTION) on the first problem, prints PASS lines otherwise.

do $$
declare
  v_count integer;
  v_src text;
begin
  -- 1. profiles.photo_path column for avatar Storage pointers -----------------
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'photo_path';
  if v_count <> 1 then
    raise exception 'FAIL profiles.photo_path column missing (apply 010_phase2_auth.sql)';
  end if;
  raise notice 'PASS profiles.photo_path present';

  -- 2. user_settings table with self-only RLS ----------------------------------
  select count(*) into v_count
  from pg_tables
  where schemaname = 'public' and tablename = 'user_settings' and rowsecurity;
  if v_count <> 1 then
    raise exception 'FAIL user_settings missing or RLS disabled';
  end if;
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'user_settings';
  if v_count < 1 then
    raise exception 'FAIL user_settings has no RLS policies';
  end if;
  raise notice 'PASS user_settings table + RLS';

  -- 3. Signup trigger seeds settings rows --------------------------------------
  select p.prosrc into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'handle_new_user';
  if v_src is null then
    raise exception 'FAIL handle_new_user() function missing';
  end if;
  if v_src not like '%user_settings%' then
    raise exception 'FAIL handle_new_user() does not seed user_settings';
  end if;
  raise notice 'PASS signup trigger seeds settings';

  -- 4. Avatar bucket policies (public read, owner write) ------------------------
  select count(*) into v_count
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('avatars_public_read', 'avatars_owner_insert', 'avatars_owner_update', 'avatars_owner_delete');
  if v_count <> 4 then
    raise exception 'FAIL avatar storage policies: found % of 4', v_count;
  end if;
  raise notice 'PASS avatar storage policies (4/4)';

  raise notice 'PHASE 2 AUTH: ALL CHECKS PASSED';
end $$;
