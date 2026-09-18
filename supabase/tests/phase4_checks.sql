
-- StudyFlow Phase 4 checks (secure rewards & progression) — read-only.
-- Run in the Supabase SQL editor AFTER applying migration 012_phase4_rewards.sql.
-- Fails loudly (EXCEPTION) on the first problem, prints PASS lines otherwise.
-- Complements (does not modify) phase1/phase2/phase3 checks.
-- NOTE: true two-user RLS isolation is verified through the app with two
-- authenticated accounts (see the completion report); the checks below confirm
-- the policy predicates, constraints and functions exist and are shaped right.

do $$
declare
  v_count integer;
begin
  -- 1. required tables -------------------------------------------------------
  select count(*) into v_count from pg_tables
  where schemaname = 'public'
    and tablename in (
      'user_balances',
      'coin_transactions',
      'user_inventory',
      'achievement_defs',
      'user_achievements',
      'streaks',
      'mystery_box_openings'
    );

  if v_count <> 7 then
    raise exception
      'FAIL expected 7 phase-4 tables, found % (apply 012_phase4_rewards.sql)',
      v_count;
  end if;

  raise notice 'PASS all 7 phase-4 tables exist';


  -- 2. catalog + purchase hardening ----------------------------------------
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'rewards'
    and column_name in ('rarity', 'stock', 'metadata');

  if v_count <> 3 then
    raise exception
      'FAIL rewards is missing catalog columns (rarity/stock/metadata)';
  end if;


  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'purchases'
    and column_name in ('unit_price', 'total', 'idempotency_key');

  if v_count <> 3 then
    raise exception
      'FAIL purchases is missing unit_price/total/idempotency_key';
  end if;


  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'mystery_box_openings'
    and column_name = 'opened_day';

  if v_count <> 1 then
    raise exception
      'FAIL mystery_box_openings is missing opened_day';
  end if;

  raise notice 'PASS catalog + purchase + box columns present';


  -- 3. unique constraints (idempotency + daily-box guard) ------------------

  select count(*) into v_count
  from pg_indexes
  where schemaname = 'public'
    and indexname in (
      'purchases_buyer_idem_uniq',
      'mystery_free_daily_uniq'
    );

  if v_count <> 2 then
    raise exception
      'FAIL idempotency/daily unique indexes missing (found %/2)',
      v_count;
  end if;


  -- UNIQUE(user_id, ref_key) on ledger + box log.
  --
  -- There is one such UNIQUE constraint on coin_transactions
  -- and one on mystery_box_openings, so the expected total is 2.
  select count(*) into v_count
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and contype = 'u'
    and conrelid in (
      'public.coin_transactions'::regclass,
      'public.mystery_box_openings'::regclass
    );

  if v_count < 2 then
    raise exception
      'FAIL ledger/box unique(user, ref) constraints missing (found %, expected at least 2)',
      v_count;
  end if;


  -- UNIQUE(user, achievement) unlock-once guard.
  select count(*) into v_count
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and conrelid = 'public.user_achievements'::regclass
    and contype in ('u', 'p');

  if v_count < 1 then
    raise exception
      'FAIL user_achievements has no uniqueness guard';
  end if;

  raise notice 'PASS idempotency + unlock-once constraints present';


  -- 4. RLS enabled + self-only / public-catalog policies -------------------

  select count(*) into v_count
  from pg_tables
  where schemaname = 'public'
    and rowsecurity
    and tablename in (
      'user_balances',
      'coin_transactions',
      'user_inventory',
      'achievement_defs',
      'user_achievements',
      'streaks',
      'mystery_box_openings'
    );

  if v_count <> 7 then
    raise exception
      'FAIL RLS not enabled on all phase-4 tables (found %/7)',
      v_count;
  end if;


  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'user_balances_self_read',
      'coin_transactions_self_read',
      'user_inventory_self_read',
      'achievement_defs_public_read',
      'user_achievements_self_read',
      'streaks_self_read',
      'mystery_box_openings_self_read'
    );

  if v_count <> 7 then
    raise exception
      'FAIL expected 7 phase-4 policies, found %',
      v_count;
  end if;


  -- The old buyer-insert policy (client-set prices) must be GONE.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'purchases'
    and policyname = 'purchases_buyer_insert';

  if v_count <> 0 then
    raise exception
      'FAIL purchases_buyer_insert still exists — clients could set their own price';
  end if;


  -- No write policies at all on the ledger/balances/inventory/streaks/box log:
  -- only the SECURITY DEFINER RPCs may write.
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'user_balances',
      'coin_transactions',
      'user_inventory',
      'user_achievements',
      'streaks',
      'mystery_box_openings'
    )
    and (
      cmd = 'ALL'
      or cmd in ('INSERT', 'UPDATE', 'DELETE')
    );

  if v_count <> 0 then
    raise exception
      'FAIL % client write policies on authoritative tables — RPC-only violated',
      v_count;
  end if;

  raise notice
    'PASS RLS: self-read only, no client writes, buyer-insert removed';


  -- 5. secure RPCs exist ----------------------------------------------------

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'sf_balance',
      'sf_award_coins',
      'sf_purchase',
      'sf_purchase_deal',
      'sf_gift',
      'sf_unlock_achievement',
      'sf_streak_day',
      'sf_open_box',
      'sf_consume',
      'sf_deal_for',
      'sf_daily_deals'
    );

  if v_count <> 11 then
    raise exception
      'FAIL expected 11 phase-4 functions, found %',
      v_count;
  end if;


  -- Valued functions must be SECURITY DEFINER.
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'sf_award_coins',
      'sf_purchase',
      'sf_purchase_deal',
      'sf_gift',
      'sf_unlock_achievement',
      'sf_streak_day',
      'sf_open_box',
      'sf_consume'
    )
    and p.prosecdef;

  if v_count <> 8 then
    raise exception
      'FAIL %/8 valued RPCs are SECURITY DEFINER',
      v_count;
  end if;

  raise notice
    'PASS all 11 RPCs exist, 8 valued ones are SECURITY DEFINER';


  -- 6. catalog + achievement seeds -----------------------------------------

  select count(*) into v_count
  from public.rewards
  where active = true;

  if v_count < 40 then
    raise exception
      'FAIL reward catalog seed missing (found % active rows)',
      v_count;
  end if;

  raise notice
    'PASS catalog seeded (% active rewards)',
    v_count;


  select count(*) into v_count
  from public.achievement_defs
  where active = true;

  if v_count < 10 then
    raise exception
      'FAIL achievement definitions seed missing (found %)',
      v_count;
  end if;

  raise notice
    'PASS achievement definitions seeded (% active)',
    v_count;


  -- 7. negative-balance guard -----------------------------------------------

  select count(*) into v_count
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and conrelid = 'public.user_balances'::regclass
    and contype = 'c';

  if v_count < 1 then
    raise exception
      'FAIL user_balances has no CHECK guard (negative balances possible)';
  end if;

  raise notice 'PASS balance CHECK guard present';

  raise notice 'PHASE 4 CHECKS COMPLETE';

end $$;
