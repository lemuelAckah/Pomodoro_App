-- StudyFlow account deletion: allow owners to delete their own rows everywhere.
-- Run with Supabase SQL editor or `supabase db push`.

-- Store purchases: buyer can delete their own purchase records.
drop policy if exists purchases_buyer_delete on public.purchases;
create policy purchases_buyer_delete on public.purchases
  for delete using (auth.uid() = buyer_id);

-- Reports: reporter can delete their own reports.
drop policy if exists reports_reporter_delete on public.reports;
create policy reports_reporter_delete on public.reports
  for delete using (auth.uid() = reporter_id);

-- Call history: initiator can delete their own calls
-- (participants rows fall away through the cascade).
drop policy if exists call_history_initiator_delete on public.call_history;
create policy call_history_initiator_delete on public.call_history
  for delete using (auth.uid() = initiator_id);

-- Call participants: a user can delete their own participant rows.
drop policy if exists call_participants_self_delete on public.call_participants;
create policy call_participants_self_delete on public.call_participants
  for delete using (auth.uid() = user_id);

-- Message receipts: a user can delete their own receipts.
drop policy if exists receipts_self_delete on public.message_receipts;
create policy receipts_self_delete on public.message_receipts
  for delete using (auth.uid() = user_id);
