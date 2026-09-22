-- 023 — cross-user DM delivery fixes
--
-- Three production faults fixed here:
--
-- 1. sendFriendRequest() upserts with .select() — the INSERT..SELECT returns
--    every row the statement can see, including the freshly-written row whose
--    status may already read 'accepted' (mirrored requests). The 016 insert
--    policy only permitted status='pending', so the whole statement failed
--    with 42501 and requests never reached the other user. The requester now
--    also gets an UPDATE policy so the converging write is legal.
--
-- 2. messages_sender_insert (016) checked the friendship in ONE direction
--    (user_id = me AND friend_id = recipient). If A sent the request and B
--    accepted, only the row (A→B, accepted) exists — so B could not reply:
--    every message B tried to send was silently rejected by RLS. Rewritten
--    to accept an accepted friendship in either direction.
--
-- 3. DM writes move to a security-definer RPC (sf_direct_message) that
--    re-validates friendship + blocks server-side. Clients that haven't
--    applied this migration keep working through the raw insert (policy 2).

begin;

-- ---------------------------------------------------------------------------
-- 1. friendships: the requester may flip their own pending row to accepted
--    (mirrored requests converge; the recipient's accept path from 016 is
--    untouched).
-- ---------------------------------------------------------------------------
drop policy if exists friendships_request_insert on public.friendships;
create policy friendships_request_insert on public.friendships
  for insert with check (
    auth.uid() = user_id and auth.uid() <> friend_id and status = 'pending'
  );

drop policy if exists friendships_requester_accept on public.friendships;
create policy friendships_requester_accept on public.friendships
  for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'accepted');

-- ---------------------------------------------------------------------------
-- 2. messages: DM inserts need an accepted friendship in EITHER direction
--    (whoever sent the original request, both sides can write afterwards).
-- ---------------------------------------------------------------------------
drop policy if exists messages_sender_insert on public.messages;
create policy messages_sender_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and (
      exists (select 1 from public.group_memberships m
        where m.group_id = group_id and m.user_id = auth.uid())
      or (
        group_id is null
        and recipient_id is not null
        and exists (select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.user_id = auth.uid() and f.friend_id = recipient_id)
              or (f.user_id = recipient_id and f.friend_id = auth.uid())))
        and not exists (select 1 from public.community_blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = recipient_id)
             or (b.blocker_id = recipient_id and b.blocked_id = auth.uid()))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. sf_direct_message: server-validated DM writer. Returns the inserted row
--    so the sender can stamp the cloud id locally.
-- ---------------------------------------------------------------------------
create or replace function public.sf_direct_message(
  p_recipient uuid,
  p_text text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.messages%rowtype;
  v_text text := left(coalesce(p_text, ''), 4000);
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_recipient is null or p_recipient = v_uid then
    raise exception 'INVALID_RECIPIENT';
  end if;
  if btrim(v_text) = '' then raise exception 'EMPTY_MESSAGE'; end if;
  -- A real, non-blocked friendship is required — in either direction.
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.user_id = v_uid and f.friend_id = p_recipient)
        or (f.user_id = p_recipient and f.friend_id = v_uid))
  ) then
    raise exception 'NOT_FRIENDS';
  end if;
  if exists (
    select 1 from public.community_blocks b
    where (b.blocker_id = v_uid and b.blocked_id = p_recipient)
       or (b.blocker_id = p_recipient and b.blocked_id = v_uid)
  ) then
    raise exception 'BLOCKED';
  end if;

  insert into public.messages (group_id, recipient_id, sender_id, text, kind, metadata, delivery_status)
  values (null, p_recipient, v_uid, v_text, 'text',
          coalesce(p_metadata, '{}'::jsonb), 'sent')
  returning * into v_row;

  return v_row;
end;
$$;

commit;

-- ============================================================================
-- VERIFY — run these after applying:
--
-- 1. Policies present:
--      select policyname, cmd from pg_policies
--      where schemaname = 'public'
--        and tablename in ('friendships','messages')
--      order by tablename, policyname;
--    Expect: friendships_request_insert (INSERT),
--            friendships_requester_accept (UPDATE),
--            messages_sender_insert (INSERT).
--
-- 2. DM write through the RPC (as a signed-in user with an accepted
--    friendship; substitute a real friend uuid):
--      select public.sf_direct_message('<friend-uuid>', 'hello');
--    Expect: one row. Without friendship: NOT_FRIENDS exception.
--
-- 3. Recipient sees it via history (RLS read path already covered by 016/018):
--      select id, sender_id, recipient_id, text from public.messages
--      where recipient_id = auth.uid() order by created_at desc limit 5;
-- ============================================================================
