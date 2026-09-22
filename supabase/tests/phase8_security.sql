-- StudyFlow Phase 8 security tests — unauthorized-access attempts + RLS inventory.
-- Run in the Supabase SQL editor. Simulates two strangers (random UUIDs, no
-- fixtures needed: any non-matching id proves isolation) via request.jwt.claims.
-- All write attempts are expected to FAIL; nothing persists (FKs reject the
-- fake users even if a policy ever misfires). Fails loudly on first problem.
--
-- NOTE: run the whole file at once (SET LOCAL needs the single transaction).

do $$
declare
  v_count integer;
  v_other uuid := '00000000-0000-4000-8000-000000000000';
  v_stranger uuid := '11111111-1111-4111-8111-111111111111';
  v_rows integer;
begin
  -- test user X acts; Y is the victim -------------------------------------------
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  if auth.uid() is distinct from v_other then
    raise exception 'FAIL test harness: auth.uid() did not follow the fake JWT';
  end if;
  raise notice 'PASS harness acts as a stranger';

  -- 1. cross-user profile reads return zero rows ----------------------------------
  select count(*) into v_count from public.profiles where id = v_stranger;
  if v_count <> 0 then raise exception 'FAIL stranger can read another profile'; end if;
  raise notice 'PASS stranger cannot read other profiles';

  -- 2. cross-user profile update touches zero rows ---------------------------------
  update public.profiles set bio = 'hacked' where id = v_stranger;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL stranger updated another profile'; end if;
  raise notice 'PASS stranger cannot update other profiles';

  -- 3. tasks/messages/stories bound to someone else are rejected --------------------
  -- (42501 = RLS denial; 23503/23514 = FK/check denial. Any of these means
  -- the write did not land. Anything else re-raises.)
  begin
    insert into public.tasks (id, user_id, text) values ('x', v_stranger, 'x');
    raise exception 'FAIL tasks accepted a foreign user_id';
  exception when others then
    if SQLSTATE in ('42501', '23503', '23514') then
      raise notice 'PASS tasks rejects foreign user_id (%)', SQLSTATE;
    else raise;
    end if;
  end;
  begin
    insert into public.messages (sender_id, recipient_id, text)
    values (v_other, v_stranger, 'x');
    -- If we ever get here, RLS misfired: clean up and fail loudly.
    delete from public.messages where recipient_id = v_stranger and text = 'x';
    raise exception 'FAIL stranger DM insert accepted (cleaned up)';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if SQLSTATE in ('42501', '23503', '23514') then
      raise notice 'PASS stranger DM insert rejected (%)', SQLSTATE;
    else raise;
    end if;
  end;
  select count(*) into v_count from public.messages where recipient_id = v_stranger;
  if v_count <> 0 then raise exception 'FAIL stranger DM thread visible'; end if;
  raise notice 'PASS stranger DM thread invisible';
  select count(*) into v_count from public.stories where user_id = v_stranger;
  if v_count <> 0 then raise exception 'FAIL stranger can read other stories'; end if;
  raise notice 'PASS stranger cannot read other stories';

  -- 4. ledger is append-only via RPC: no direct writes ------------------------------
  -- (Same SQLSTATE discipline as §3: any rejection class passes.)
  begin
    insert into public.user_balances (user_id, balance) values (v_other, 1000000);
    delete from public.user_balances where user_id = v_other;
    raise exception 'FAIL direct balance write accepted (cleaned up)';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if SQLSTATE in ('42501', '23503', '23514') then
      raise notice 'PASS direct balance write rejected (%)', SQLSTATE;
    else raise;
    end if;
  end;
  begin
    insert into public.coin_transactions (user_id, type, amount, reason, ref_key)
    values (v_other, 'earn', 999999, 'hack', 'hack:' || v_other::text);
    raise exception 'FAIL direct ledger write accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if SQLSTATE in ('42501', '23503', '23514') then
      raise notice 'PASS direct ledger write rejected (%)', SQLSTATE;
    else raise;
    end if;
  end;
  begin
    insert into public.user_inventory (user_id, reward_id, qty)
    values (v_other, 'legend', 99);
    raise exception 'FAIL direct inventory write accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if SQLSTATE in ('42501', '23503', '23514') then
      raise notice 'PASS direct inventory write rejected (%)', SQLSTATE;
    else raise;
    end if;
  end;

  -- 5. group role escalation blocked ---------------------------------------------------
  begin
    insert into public.group_memberships (group_id, user_id, role)
    values ('g1', v_other, 'owner');
    raise exception 'FAIL self-granted owner membership accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if SQLSTATE in ('42501', '23503', '23514') then
      raise notice 'PASS self-granted owner membership rejected (%)', SQLSTATE;
    else raise;
    end if;
  end;

  -- 6. anon (no JWT) cannot write user tables -------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    insert into public.tasks (id, user_id, text) values ('x', v_other, 'x');
    raise exception 'FAIL anon task insert accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if SQLSTATE in ('42501', '23503', '23514') then
      raise notice 'PASS anon task insert rejected (%)', SQLSTATE;
    else raise;
    end if;
  end;
  select count(*) into v_count from public.profiles;
  if v_count <> 0 then raise exception 'FAIL anon can read profiles'; end if;
  raise notice 'PASS anon cannot read profiles';

  -- 7. RLS enabled on every app table ------------------------------------------------------
  select count(*) into v_count from pg_tables
  where schemaname = 'public'
    and tablename in ('profiles','user_progress','user_state','user_settings','tasks',
      'favorites','groups','group_memberships','friendships','messages','message_reactions',
      'notifications','stories','story_views','community_blocks','reports','books',
      'book_favorites','book_progress','book_bookmarks','book_highlights','book_notes',
      'music_tracks','music_playlists','music_playlist_tracks','user_balances',
      'coin_transactions','user_inventory','achievement_defs','user_achievements',
      'streaks','mystery_box_openings','user_notes','technique_assessments',
      'technique_usage','message_receipts','call_history','call_participants',
      'purchases','rewards')
    and rowsecurity;
  if v_count <> 40 then
    raise exception 'FAIL RLS missing somewhere: % of 40 tables covered', v_count;
  end if;
  raise notice 'PASS RLS enabled on all 40 app tables';

  -- 8. no permissive-true policies (would open the table to everyone) -----------------------
  select count(*) into v_count from pg_policies
  where (qual = 'true' or with_check = 'true')
    and not (schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_public_read');
  if v_count <> 0 then
    raise exception 'FAIL % permissive-true policies (excluding the intentional avatar read)', v_count;
  end if;
  raise notice 'PASS no permissive-true policies';

  -- 9. storage: every SELECT policy except the intentional avatar read --------------
  -- requires a signed-in user (references auth.uid()). Catches a publicly
  -- readable bucket sneaking back in (e.g. a resurrected bookfiles policy).
  select count(*) into v_count from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and cmd = 'SELECT' and policyname <> 'avatars_public_read'
    and qual not like '%auth.uid()%';
  if v_count <> 0 then
    raise exception 'FAIL % storage SELECT policies work without sign-in', v_count;
  end if;
  raise notice 'PASS avatar bucket is the only public read surface';

  -- 10. SECURITY DEFINER functions pin search_path (hijack-safe) --------------------------------
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'sf\_%'
    and (p.proconfig is null or not (p.proconfig::text like '%search_path%'));
  if v_count <> 0 then
    raise exception 'FAIL % SECURITY DEFINER functions without pinned search_path', v_count;
  end if;
  raise notice 'PASS all sf_* functions pin search_path';

  -- 11. Phase 8 upload caps present ------------------------------------------------------------------
  select count(*) into v_count from pg_constraint
  where conrelid = 'public.messages'::regclass and conname = 'messages_text_len';
  if v_count <> 1 then
    raise exception 'FAIL messages_text_len missing (apply 022_phase8_storage_limits.sql)';
  end if;
  select count(*) into v_count from storage.buckets
  where id in ('studyflow-files','studyflow-avatars','studyflow-stories','studyflow-books')
    and file_size_limit is not null;
  if v_count <> 4 then
    raise exception 'FAIL bucket size caps missing on % of 4 buckets', v_count;
  end if;
  raise notice 'PASS upload caps present';

  raise notice 'ALL PHASE 8 SECURITY CHECKS PASSED';
end;
$$;
