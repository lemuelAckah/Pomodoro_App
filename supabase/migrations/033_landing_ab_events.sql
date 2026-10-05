-- 033: landing hero A/B test events.
-- One insert-only table feeding the landing copy experiment (src/ab.js).
-- Anonymous visitors never sign in, so the table is writable by anon and
-- unreadable by everyone; aggregation happens exclusively through the
-- security-definer landing_ab_results() RPC.
-- Free-plan safe: plain SQL, one table, one function, no extensions.

create table if not exists public.landing_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  variant text not null check (variant in ('A', 'B')),
  event text not null check (event in ('view', 'cta_click', 'demo_start')),
  path text not null default '/',
  ref text not null default '',
  vw smallint not null default 1 check (vw in (0, 1)) -- 1 = desktop-ish, 0 = phone
);

create index if not exists landing_events_variant_idx
  on public.landing_events (variant, event);

-- Insert-only for everyone (anon visitors included); nobody reads directly.
alter table public.landing_events enable row level security;

drop policy if exists landing_events_insert_anyone on public.landing_events;
create policy landing_events_insert_anyone on public.landing_events
  for insert to anon, authenticated with check (true);

-- Aggregation: security definer so the anon client never needs table SELECT.
create or replace function public.landing_ab_results()
returns table (
  variant text,
  views bigint,
  cta_clicks bigint,
  demo_starts bigint
)
language sql
security definer
set search_path = public
as $$
  select
    variant,
    count(*) filter (where event = 'view') as views,
    count(*) filter (where event = 'cta_click') as cta_clicks,
    count(*) filter (where event = 'demo_start') as demo_starts
  from public.landing_events
  group by variant
$$;

revoke all on function public.landing_ab_results() from public;
grant execute on function public.landing_ab_results() to anon, authenticated;
