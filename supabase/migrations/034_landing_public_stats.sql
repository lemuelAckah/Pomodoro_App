/* 034_landing_public_stats.sql — live social-proof aggregates for the public
   landing page (focus sessions + learner count). SECURITY DEFINER so anon can
   read plain counts without any row-level access to user_progress; only
   aggregates leave the table, never row data. Idempotent (create or replace). */

create or replace function public.sf_public_stats()
returns table (sessions bigint, learners bigint, focus_hours bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(p.sessions), 0)::bigint,
    count(*)::bigint,
    coalesce(sum(p.focus_seconds), 0)::bigint / 3600
  from public.user_progress p;
$$;

revoke execute on function public.sf_public_stats() from public;
grant execute on function public.sf_public_stats() to anon, authenticated;
