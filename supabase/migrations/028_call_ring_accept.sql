-- 028: video-call ring/accept + group mesh.
--
-- Recipients must be able to UPDATE a ringing call (accept/decline/leave)
-- and INSERT their own call_participants row. The old initiator-only update
-- policy and initiator-only participant insert made accept impossible from
-- the callee side. Mesh needs indexes for "any ringing calls for me" and
-- per-call participant status lookups.
--
-- Safe to re-run: drop both the old and new policy names before create.

drop policy if exists call_history_initiator_update on public.call_history;
drop policy if exists call_history_participant_update on public.call_history;
create policy call_history_participant_update on public.call_history
  for update
  using (
    auth.uid() = initiator_id
    or auth.uid() = recipient_id
    or exists (
      select 1 from public.call_participants p
      where p.call_id = id and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = initiator_id
    or auth.uid() = recipient_id
    or exists (
      select 1 from public.call_participants p
      where p.call_id = id and p.user_id = auth.uid()
    )
  );

drop policy if exists call_participants_initiator_insert on public.call_participants;
drop policy if exists call_participants_insert on public.call_participants;
create policy call_participants_insert on public.call_participants
  for insert
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.call_history c
      where c.id = call_id and c.initiator_id = auth.uid()
    )
  );

create index if not exists calls_status_recipient_idx
  on public.call_history(status, recipient_id, started_at desc);
create index if not exists calls_room_status_idx
  on public.call_history(room_id, status, started_at desc);
create index if not exists call_participants_call_status_idx
  on public.call_participants(call_id, status);
