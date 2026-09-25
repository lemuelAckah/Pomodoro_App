-- ============================================================================
-- 032_call_policy_recursion_and_delete_rpc.sql — StudyFlow
--
-- FIXES: `42P17 infinite recursion detected in policy for relation
-- "call_participants"` / `"call_history"` — thrown by SELECT/INSERT/UPDATE on
-- the call tables AND by the "Delete all my data" wipe (Postgres applies a
-- table's SELECT policies to DELETE too, because the command reads columns
-- for its WHERE/RETURNING).
--
-- ROOT CAUSE (mutually recursive policy pairs created in 002/028/030):
--
--   002 call_history_participant_read (call_history SELECT)
--         → exists (... call_participants ...)   ── runs participants policies
--   002 call_participants_self_read (call_participants SELECT)
--         → exists (... call_history ...)        ── runs call_history policies
--                                                   → cycle closes → 42P17
--   028 widened the same cycle to UPDATE on call_history and INSERT on
--   call_participants; 030 nested it again inside call_events policies.
--
-- FIX (same idiom as 018_fix_group_policy_recursion.sql): policy subqueries
-- that touch the opposite call table run through SECURITY DEFINER helpers.
-- Inside a definer function the inner query executes as the function owner
-- with RLS bypassed, so no policy re-entrancy occurs. Each helper returns
-- exactly the one fact its policy needed (is the caller a participant /
-- initiator / party to the call).
--
-- ALSO SHIPS: `sf_delete_my_data()` — the transactional, session-scoped
-- "delete all my data" procedure the client calls first (Part 2 of the wipe
-- redesign). It derives the user id from auth.uid() only (never a parameter),
-- deletes exclusively that user's rows in FK-safe order inside one
-- subtransaction, and returns {ok, deleted:{table:count}} — or rolls back
-- completely and returns {ok:false,error} if any step fails. Storage objects
-- are intentionally NOT deleted here (SQL deletes would orphan S3 objects);
-- the client sweeps buckets through the storage API afterwards.
--
-- HOW TO APPLY (free-plan safe — SQL editor, no extensions/flags):
--   Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   Or: supabase db push (after `supabase login` + `supabase link`).
--   Idempotent: safe to run more than once.
--
-- Post-conditions (verify queries at the bottom).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Helpers (SECURITY DEFINER, locked down)
-- ---------------------------------------------------------------------------

-- True when the caller is a row in call_participants for this call.
-- Replaces the call_history half of the 002 cycle: the policy on
-- call_history no longer subqueries call_participants directly.
create or replace function public.sf_call_is_participant(p_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.call_participants p
    where p.call_id = p_call_id and p.user_id = auth.uid()
  )
$$;

-- True when the caller created this call. Replaces the call_participants
-- half of the 002 cycle: the policy on call_participants no longer
-- subqueries call_history directly.
create or replace function public.sf_call_is_initiator(p_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.call_history c
    where c.id = p_call_id and c.initiator_id = auth.uid()
  )
$$;

-- True when the caller is a party to the call: initiator, recipient, or a
-- participant row. One definer call replaces 030's doubly-nested
-- exists(call_history → exists(call_participants)) on call_events.
create or replace function public.sf_call_can_read(p_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.call_history c
    where c.id = p_call_id
      and (c.initiator_id = auth.uid() or c.recipient_id = auth.uid())
  )
  or exists (
    select 1 from public.call_participants p
    where p.call_id = p_call_id and p.user_id = auth.uid()
  )
$$;

revoke all on function public.sf_call_is_participant(uuid) from public;
grant execute on function public.sf_call_is_participant(uuid) to public;
revoke all on function public.sf_call_is_initiator(uuid) from public;
grant execute on function public.sf_call_is_initiator(uuid) to public;
revoke all on function public.sf_call_can_read(uuid) from public;
grant execute on function public.sf_call_can_read(uuid) to public;

-- ---------------------------------------------------------------------------
-- 2. call_history policies
-- ---------------------------------------------------------------------------

-- Was (002): ... or exists (select 1 from call_participants ...)  ← cycle.
drop policy if exists call_history_participant_read on public.call_history;
create policy call_history_participant_read on public.call_history
  for select using (
    auth.uid() = initiator_id
    or auth.uid() = recipient_id
    or public.sf_call_is_participant(id)
  );

-- Was (028): same participant subquery on UPDATE. Semantics unchanged,
-- subquery now goes through the definer helper.
drop policy if exists call_history_participant_update on public.call_history;
create policy call_history_participant_update on public.call_history
  for update
  using (
    auth.uid() = initiator_id
    or auth.uid() = recipient_id
    or public.sf_call_is_participant(id)
  )
  with check (
    auth.uid() = initiator_id
    or auth.uid() = recipient_id
    or public.sf_call_is_participant(id)
  );

-- INSERT (002) and DELETE (005's call_history_initiator_delete: the creator
-- owns the row, same rule the app already uses for messages — sender owns,
-- recipient-side rows belong to the other party's history) touch only the
-- row's own columns — no cross-table subquery, no recursion, left as-is.

-- ---------------------------------------------------------------------------
-- 3. call_participants policies
-- ---------------------------------------------------------------------------

-- Was (002): auth.uid() = user_id
--         or exists (select 1 from call_history where ... initiator = me)
--                                            ← the other half of the cycle.
drop policy if exists call_participants_self_read on public.call_participants;
create policy call_participants_self_read on public.call_participants
  for select using (
    auth.uid() = user_id or public.sf_call_is_initiator(call_id)
  );

-- Was (028): auth.uid() = user_id or exists (... call_history ... initiator).
drop policy if exists call_participants_insert on public.call_participants;
drop policy if exists call_participants_initiator_insert on public.call_participants;
create policy call_participants_insert on public.call_participants
  for insert with check (
    auth.uid() = user_id or public.sf_call_is_initiator(call_id)
  );

-- UPDATE/DELETE (002/005) touch only the row's own columns — left as-is.

-- ---------------------------------------------------------------------------
-- 4. call_events policies (030) — nested subqueries collapsed to one helper
-- ---------------------------------------------------------------------------

-- Was (030): actor or exists (call_history ... exists (call_participants ...))
-- — three levels of RLS re-entry that only stayed acyclic by luck of order.
drop policy if exists call_events_participant_read on public.call_events;
create policy call_events_participant_read on public.call_events
  for select using (
    auth.uid() = actor_id or public.sf_call_can_read(call_id)
  );

drop policy if exists call_events_participant_insert on public.call_events;
create policy call_events_participant_insert on public.call_events
  for insert with check (
    auth.uid() = actor_id and public.sf_call_can_read(call_id)
  );

-- NEW: call_events had no DELETE policy, so a client-side wipe could never
-- remove a caller's own events on someone else's call (they are not covered
-- by the call_history cascade when the caller is only a participant).
drop policy if exists call_events_self_delete on public.call_events;
create policy call_events_self_delete on public.call_events
  for delete using (auth.uid() = actor_id);

-- ---------------------------------------------------------------------------
-- 5. sf_delete_my_data() — transactional, session-scoped wipe procedure
-- ---------------------------------------------------------------------------

-- Deletes ONLY the caller's own rows (uid always = auth.uid(), never a
-- parameter — a user cannot pass another user's id). SECURITY DEFINER so the
-- wipe does not depend on every per-table DELETE policy existing or on
-- policy evaluation order; it still filters every statement by auth.uid(),
-- and each WHERE mirrors exactly what the caller's own RLS DELETE policies
-- already allow (creator owns: sender/initiator/owner; self rows; either
-- side of a friendship).
--
-- Atomicity: the whole body runs in one exception block (an implicit
-- subtransaction). Any failure rolls back every delete inside it and the
-- function returns {ok:false,error} — the client never sees "half wiped".
create or replace function public.sf_delete_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  counts jsonb := '{}'::jsonb;
  n integer := 0;
  step text[];
  steps text[][] := array[
    -- Children first. Scope per table mirrors the caller's own DELETE
    -- policies: creator/owner/initiator rows, self rows, and either side
    -- of a friendship (joint relationship).
    ['call_events',            'actor_id = auth.uid()'],
    ['call_participants',      'user_id = auth.uid()'],
    ['call_history',           'initiator_id = auth.uid()'],
    ['story_views',            'viewer_id = auth.uid()'],
    ['stories',                'user_id = auth.uid()'],
    ['community_blocks',       'blocker_id = auth.uid()'],
    ['message_reactions',      'user_id = auth.uid()'],
    ['message_receipts',       'user_id = auth.uid()'],
    ['reports',                'reporter_id = auth.uid()'],
    ['messages',               'sender_id = auth.uid()'],
    ['notifications',          'user_id = auth.uid()'],
    ['group_memberships',      'user_id = auth.uid()'],
    ['groups',                 'owner_id = auth.uid()'],
    ['friendships',            'user_id = auth.uid() or friend_id = auth.uid()'],
    ['purchases',              'buyer_id = auth.uid()'],
    ['mystery_box_openings',   'user_id = auth.uid()'],
    ['user_achievements',      'user_id = auth.uid()'],
    ['streaks',                'user_id = auth.uid()'],
    ['coin_transactions',      'user_id = auth.uid()'],
    ['user_balances',          'user_id = auth.uid()'],
    ['user_inventory',         'user_id = auth.uid()'],
    ['book_highlights',        'user_id = auth.uid()'],
    ['book_bookmarks',         'user_id = auth.uid()'],
    ['book_progress',          'user_id = auth.uid()'],
    ['book_favorites',         'user_id = auth.uid()'],
    ['book_notes',             'user_id = auth.uid()'],
    ['books',                  'owner_id = auth.uid()'],
    ['tasks',                  'user_id = auth.uid()'],
    ['user_notes',             'user_id = auth.uid()'],
    ['technique_assessments',  'user_id = auth.uid()'],
    ['technique_usage',        'user_id = auth.uid()'],
    ['music_playlist_tracks',  'user_id = auth.uid()'],
    ['music_playlists',        'user_id = auth.uid()'],
    ['music_tracks',           'user_id = auth.uid()'],
    ['favorites',              'user_id = auth.uid()'],
    ['user_progress',          'user_id = auth.uid()'],
    ['user_settings',          'user_id = auth.uid()'],
    ['user_state',             'user_id = auth.uid()'],
    ['profiles',               'id = auth.uid()']
  ];
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  foreach step in array steps loop
    -- to_regclass guard keeps the wipe working on databases where a later
    -- table was never provisioned (statement is never planned when missing).
    if to_regclass('public.' || step[1]) is not null then
      execute format('delete from public.%I where %s', step[1], step[2]);
      get diagnostics n = row_count;
      counts := counts || jsonb_build_object(step[1], n);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'deleted', counts);
exception
  when others then
    -- Rolls back every delete above (implicit subtransaction) → atomic.
    return jsonb_build_object(
      'ok', false, 'error', SQLERRM, 'sqlstate', SQLSTATE
    );
end;
$$;

-- Only the signed-in caller may execute; the body can only ever touch
-- auth.uid() rows, so this is not a privilege-escalation vector.
revoke all on function public.sf_delete_my_data() from public;
revoke all on function public.sf_delete_my_data() from anon;
grant execute on function public.sf_delete_my_data() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Group-avatar storage policies — path mismatch (audit fix)
-- ---------------------------------------------------------------------------

-- 016 checked (storage.foldername(name))[1] = m.group_id, i.e. it expected
-- paths shaped <group_id>/avatar.png — but uploadGroupAvatar writes
-- groups/{groupId}/avatar.{ext} (backend.js), so foldername[1] is the literal
-- 'groups' and every owner/admin write, member read and owner delete was
-- rejected by RLS. Re-pointed at the real layout while still accepting the
-- legacy <group_id>/... shape. Caller is always checked through
-- group_memberships — no widening of who may touch these files.

drop policy if exists groups_media_owner_admin_write on storage.objects;
create policy groups_media_owner_admin_write on storage.objects
  for insert with check (
    bucket_id = 'studyflow-groups'
    and exists (select 1 from public.group_memberships m
      where m.group_id = case
            when (storage.foldername(name))[1] = 'groups'
              then (storage.foldername(name))[2]
            else (storage.foldername(name))[1]
          end
        and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  );

drop policy if exists groups_media_owner_admin_update on storage.objects;
create policy groups_media_owner_admin_update on storage.objects
  for update using (
    bucket_id = 'studyflow-groups'
    and exists (select 1 from public.group_memberships m
      where m.group_id = case
            when (storage.foldername(name))[1] = 'groups'
              then (storage.foldername(name))[2]
            else (storage.foldername(name))[1]
          end
        and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  );

drop policy if exists groups_media_owner_delete on storage.objects;
create policy groups_media_owner_delete on storage.objects
  for delete using (
    bucket_id = 'studyflow-groups'
    and exists (select 1 from public.groups g
      where g.id = case
            when (storage.foldername(name))[1] = 'groups'
              then (storage.foldername(name))[2]
            else (storage.foldername(name))[1]
          end
        and g.owner_id = auth.uid())
  );

drop policy if exists groups_media_member_read on storage.objects;
create policy groups_media_member_read on storage.objects
  for select using (
    bucket_id = 'studyflow-groups'
    and exists (select 1 from public.group_memberships m
      where m.group_id = case
            when (storage.foldername(name))[1] = 'groups'
              then (storage.foldername(name))[2]
            else (storage.foldername(name))[1]
          end
        and m.user_id = auth.uid())
  );

commit;

-- ============================================================================
-- VERIFY — run these after applying:
--
-- 1. Policies no longer reference the opposite table directly:
--      select tablename, policyname, cmd, qual
--      from pg_policies
--      where schemaname = 'public'
--        and tablename in ('call_history','call_participants','call_events')
--      order by tablename, policyname;
--      -- qual columns must call sf_call_* helpers, never bare EXISTS on the
--      -- opposite call table.
--
-- 2. A delete on the call tables no longer raises 42P17 (as the wipe does):
--      select public.sf_call_is_participant(gen_random_uuid());  -- false
--      select public.sf_call_can_read(gen_random_uuid());        -- false
--
-- 3. RPC is callable (as an authenticated user in the API playground):
--      select public.sf_delete_my_data();
--      -- for a signed-in user with no data: {"ok": true, "deleted": {...}}
--      -- for anon: {"ok": false, "error": "Not signed in"}
--
-- 4. Function privileges pinned:
--      select proname, prosecdef from pg_proc
--      where proname in ('sf_call_is_participant','sf_call_is_initiator',
--                        'sf_call_can_read','sf_delete_my_data');
--      -- all four: prosecdef = true (security definer)
-- ============================================================================
