-- StudyFlow Phase 7 checks (Community, Groups, Stories & Notifications) — read-only.
-- Run in the Supabase SQL editor AFTER applying migration 016_phase7_community.sql.
-- Fails loudly (EXCEPTION) on the first problem, prints PASS lines otherwise.
-- Complements (does not modify) earlier phase check files.

do $$
declare
  v_count integer;
begin
  -- 1. groups: private visibility + avatar + touch trigger -------------------------
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'groups'
    and column_name in ('visibility', 'avatar_path', 'updated_at');
  if v_count <> 3 then
    raise exception 'FAIL groups is missing visibility/avatar_path/updated_at (found %/3)', v_count;
  end if;
  select count(*) into v_count from pg_constraint
  where conrelid = 'public.groups'::regclass and conname = 'groups_visibility_check';
  if v_count <> 1 then
    raise exception 'FAIL groups_visibility_check missing';
  end if;
  select count(*) into v_count from pg_trigger where tgname = 'groups_visibility_owner_guard';
  if v_count <> 1 then
    raise exception 'FAIL groups_visibility_owner_guard trigger missing';
  end if;
  raise notice 'PASS groups private/public + owner guard';

  -- 2. membership hardening: no legacy self_write, member roster readable --------
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'group_memberships'
    and policyname in ('memberships_self_insert', 'memberships_member_read',
      'memberships_admin_insert', 'memberships_admin_remove');
  if v_count <> 4 then
    raise exception 'FAIL group_memberships policies incomplete (found %/4)', v_count;
  end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'group_memberships'
    and policyname = 'memberships_self_write';
  if v_count <> 0 then
    raise exception 'FAIL legacy memberships_self_write still present (self role escalation)';
  end if;
  raise notice 'PASS membership insert/read hardened';

  -- 3. messages lifecycle columns ---------------------------------------------------
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'messages'
    and column_name in ('edited_at', 'deleted_at');
  if v_count <> 2 then
    raise exception 'FAIL messages is missing edited_at/deleted_at';
  end if;
  raise notice 'PASS messages edit/delete lifecycle';

  -- 4. friendships request flow policies ---------------------------------------------
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'friendships'
    and policyname in ('friendships_request_insert', 'friendships_involved_read',
      'friendships_recipient_accept', 'friendships_involved_delete');
  if v_count <> 4 then
    raise exception 'FAIL friendships policies incomplete (found %/4)', v_count;
  end if;
  raise notice 'PASS friendships request flow';

  -- 5. stories / views / blocks tables + RLS -----------------------------------------
  select count(*) into v_count from pg_tables
  where schemaname = 'public'
    and tablename in ('stories', 'story_views', 'community_blocks') and rowsecurity;
  if v_count <> 3 then
    raise exception 'FAIL stories/story_views/community_blocks missing or RLS disabled (%/3)', v_count;
  end if;
  raise notice 'PASS stories + blocks tables with RLS';

  -- 6. secure RPCs present --------------------------------------------------------------
  select count(*) into v_count from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'sf_group_role', 'sf_blocked_between', 'sf_notify', 'sf_group_create',
    'sf_group_add_member', 'sf_group_set_member', 'sf_group_leave',
    'sf_group_transfer', 'sf_group_delete', 'sf_group_update',
    'sf_message_delete', 'sf_story_view', 'search_users', 'get_public_profiles');
  if v_count <> 14 then
    raise exception 'FAIL Phase 7 RPCs incomplete (found %/14)', v_count;
  end if;
  raise notice 'PASS all 14 Phase 7 RPCs present';

  -- 7. directory lockdown: no broad profiles read policy ----------------------------------
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'profiles_directory_read';
  if v_count <> 0 then
    raise exception 'FAIL profiles_directory_read still present (private columns exposed)';
  end if;
  raise notice 'PASS directory locked down to RPCs';

  -- 8. notifications dedupe index ------------------------------------------------------------
  select count(*) into v_count from pg_indexes
  where schemaname = 'public' and indexname = 'notifications_recipient_event_uniq';
  if v_count <> 1 then
    raise exception 'FAIL notifications_recipient_event_uniq missing (fan-out can duplicate)';
  end if;
  raise notice 'PASS notifications dedupe index';

  -- 9. storage buckets --------------------------------------------------------------------------
  select count(*) into v_count from storage.buckets
  where id in ('studyflow-groups', 'studyflow-stories', 'studyflow-files');
  if v_count <> 3 then
    raise exception 'FAIL community storage buckets missing (found %/3)', v_count;
  end if;
  raise notice 'PASS community storage buckets';

  raise notice 'ALL PHASE 7 CHECKS PASSED';
end;
$$;
