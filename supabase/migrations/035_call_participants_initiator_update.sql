-- 035: call_participants — let the call INITIATOR update rows they created.
--
-- Symptom: console shows HTTP 403 on POST /rest/v1/call_participants with
--   "new row violates row-level security policy (USING expression)"
--   even though the JWT is valid and the caller IS the call's initiator.
--
-- Root: 002's call_participants_self_update only allows
--   auth.uid() = user_id. INSERT lets the initiator create other people's
--   seats (028/032), but the UPSERT path PostgREST takes when the row
--   ALREADY exists is an UPDATE — so the initiator re-upserting a peer row
--   (mid-call invite, retried ring, any repeat write of the same seat) is
--   rejected with 403.
--
-- Fix: widen UPDATE to mirror the INSERT policy — self OR initiator.
-- Callers still can't touch strangers' rows: only the row's owner or the
-- person who created the call.
--
-- Safe to re-run: drops the policy by name before creating.

begin;

drop policy if exists call_participants_self_update on public.call_participants;

create policy call_participants_self_update on public.call_participants
  for update
  using (
    auth.uid() = user_id
    or public.sf_call_is_initiator(call_id)
  )
  with check (
    auth.uid() = user_id
    or public.sf_call_is_initiator(call_id)
  );

commit;

-- Verify:
--   select polname, qual from pg_policies
--    where tablename = 'call_participants' and cmd = 'UPDATE';
