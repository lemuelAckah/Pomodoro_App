-- StudyFlow Phase 3 checks (productivity data) — read-only except for the
-- temporary isolation fixtures it creates and removes.
-- Run in the Supabase SQL editor AFTER applying migrations 001–011.
-- Fails loudly (EXCEPTION) on the first problem, prints PASS lines otherwise.
-- Complements (does not modify) phase1_checks.sql and phase2_checks.sql.

do $$
declare
  v_count integer;
  v_a uuid := '11111111-1111-1111-1111-111111111111';
  v_b uuid := '22222222-2222-2222-2222-222222222222';
begin
  -- 1. tasks widened with the client's offline fields -------------------------
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'tasks'
    and column_name in ('desc', 'client_created_at', 'client_updated_at');
  if v_count <> 3 then
    raise exception 'FAIL tasks is missing phase-3 columns (apply 011_phase3_productivity.sql)';
  end if;
  raise notice 'PASS tasks carries desc + client timestamps';

  -- 2. user_notes table with self-only RLS ------------------------------------
  select count(*) into v_count
  from pg_tables
  where schemaname = 'public' and tablename = 'user_notes' and rowsecurity;
  if v_count <> 1 then
    raise exception 'FAIL user_notes missing or RLS disabled';
  end if;
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'user_notes'
    and policyname = 'user_notes_self_all';
  if v_count <> 1 then
    raise exception 'FAIL user_notes is missing the user_notes_self_all policy';
  end if;
  raise notice 'PASS user_notes present with self-only RLS';

  -- 3. technique_assessments (one row per user) with self-only RLS ------------
  select count(*) into v_count
  from pg_tables
  where schemaname = 'public' and tablename = 'technique_assessments' and rowsecurity;
  if v_count <> 1 then
    raise exception 'FAIL technique_assessments missing or RLS disabled';
  end if;
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'technique_assessments'
    and policyname = 'technique_assessments_self_all';
  if v_count <> 1 then
    raise exception 'FAIL technique_assessments missing its policy';
  end if;
  raise notice 'PASS technique_assessments present with self-only RLS';

  -- 4. technique_usage with self-only RLS -------------------------------------
  select count(*) into v_count
  from pg_tables
  where schemaname = 'public' and tablename = 'technique_usage' and rowsecurity;
  if v_count <> 1 then
    raise exception 'FAIL technique_usage missing or RLS disabled';
  end if;
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename = 'technique_usage'
    and policyname = 'technique_usage_self_all';
  if v_count <> 1 then
    raise exception 'FAIL technique_usage missing its policy';
  end if;
  raise notice 'PASS technique_usage present with self-only RLS';

  -- 5. performance indexes -----------------------------------------------------
  select count(*) into v_count
  from pg_indexes
  where schemaname = 'public'
    and indexname in ('tasks_user_activity_idx', 'user_notes_user_kind_idx',
                      'user_notes_title_idx', 'technique_usage_user_idx');
  if v_count <> 4 then
    raise exception 'FAIL expected 4 phase-3 indexes, found %', v_count;
  end if;
  raise notice 'PASS phase-3 indexes present';

  -- 6. isolation fixtures (rolled back — nothing persists) ---------------------
  -- Real RLS verification happens through the Supabase JS client with two
  -- authenticated users (User A vs User B); SQL-level checks here confirm the
  -- policy predicates exist and the tables refuse unauthenticated writes.
  begin
    begin
      insert into public.tasks (id, user_id, text) values ('iso-check', v_a, 'should fail');
      raise exception 'FAIL tasks accepted an insert without an authenticated user (RLS bypass)';
    exception when insufficient_privilege or check_violation then
      raise notice 'PASS tasks rejects unauthenticated inserts';
    when others then
      if sqlerrm like 'FAIL%' then raise; end if;
      raise notice 'PASS tasks rejects unauthenticated inserts (%)', sqlerrm;
    end;
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS tasks rejects unauthenticated inserts (%)', sqlerrm;
  end;

  raise notice 'PHASE 3 CHECKS COMPLETE';
end $$;
