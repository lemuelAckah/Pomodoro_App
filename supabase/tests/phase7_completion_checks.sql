-- StudyFlow Phase 7 completion checks (017_phase7_completion.sql) — read-only.
-- Run in the Supabase SQL editor AFTER applying migration 017.
-- Fails loudly (EXCEPTION) on the first problem, prints PASS lines otherwise.
-- Complements phase7_checks.sql (does not modify it).

do $$
declare
  v_count integer;
  v_def text;
begin
  -- 1. mute RPC present ---------------------------------------------------------
  select count(*) into v_count from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sf_mute_set';
  if v_count <> 1 then
    raise exception 'FAIL sf_mute_set RPC missing (apply 017_phase7_completion.sql)';
  end if;
  raise notice 'PASS sf_mute_set present';

  -- 2. stories.kind defaults to text ----------------------------------------------
  select pg_get_expr(adbin, adrelid) into v_def from pg_attrdef
  where adrelid = 'public.stories'::regclass and adnum = (
    select attnum from pg_attribute
    where attrelid = 'public.stories'::regclass and attname = 'kind');
  if v_def is null or v_def <> '''text''::text' then
    raise exception 'FAIL stories.kind missing default text (found %)', coalesce(v_def, 'none');
  end if;
  raise notice 'PASS stories.kind defaults to text';

  -- 3. muted_at column present ------------------------------------------------------
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'group_memberships'
    and column_name = 'muted_at';
  if v_count <> 1 then
    raise exception 'FAIL group_memberships.muted_at missing';
  end if;
  raise notice 'PASS muted_at column present';

  -- 4. community buckets present ------------------------------------------------------
  select count(*) into v_count from storage.buckets
  where id in ('studyflow-groups', 'studyflow-stories', 'studyflow-files');
  if v_count <> 3 then
    raise exception 'FAIL community storage buckets missing (found %/3)', v_count;
  end if;
  raise notice 'PASS community storage buckets';

  -- 5. storage policies: owner/admin write, member/visible read, no public write ----
  select count(*) into v_count from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('groups_media_owner_admin_write', 'groups_media_owner_admin_update',
      'groups_media_owner_delete', 'groups_media_member_read',
      'stories_media_visible_read', 'stories_owner_insert', 'stories_owner_delete',
      'files_message_member_read');
  if v_count <> 8 then
    raise exception 'FAIL community storage policies incomplete (found %/8)', v_count;
  end if;
  raise notice 'PASS community storage policies';

  -- 6. sender edit path intact (message editing UI relies on it) -----------------------
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'messages'
    and policyname = 'messages_sender_update';
  if v_count <> 1 then
    raise exception 'FAIL messages_sender_update missing (message editing broken)';
  end if;
  raise notice 'PASS sender edit path intact';

  raise notice 'ALL PHASE 7 COMPLETION CHECKS PASSED';
end;
$$;
