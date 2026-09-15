-- StudyFlow store purchases: quantity support + buyer insert policy.
-- Run with Supabase SQL editor or `supabase db push`.

alter table public.purchases
  add column if not exists qty integer not null default 1 check (qty >= 1);

drop policy if exists purchases_buyer_insert on public.purchases;
create policy purchases_buyer_insert on public.purchases
  for insert with check (auth.uid() = buyer_id);
