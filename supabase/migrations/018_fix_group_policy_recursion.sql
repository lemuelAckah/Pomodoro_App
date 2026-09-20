-- ============================================================================
-- 018_fix_group_policy_recursion.sql — StudyFlow
--
-- FIXES: `42P17 infinite recursion detected in policy for relation
-- "group_memberships"` (and the same for "groups") on every REST read of
-- public.groups — the Community Discover tab's
-- `GET /rest/v1/groups?...group_memberships(count)` returning HTTP 500.
--
-- ROOT CAUSE (two mutually recursive policy pairs created across migrations):
--
--   008 memberships_public_read (group_memberships SELECT)
--         → subquery on public.groups               ── runs groups policies
--   001 groups_member_read (groups SELECT)
--         → subquery on public.group_memberships    ── runs memberships policies
--
--   016 memberships_member_read (group_memberships SELECT)
--         → subquery on public.group_memberships (self-referencing)
--   016 memberships_admin_insert / memberships_admin_remove (INSERT/DELETE)
--         → subquery on public.group_memberships
--
-- Postgres cuts the cycle at depth ~10 and raises 42P17. Because EVERY
-- select on either table evaluates these policies, even a bare
-- `select * from groups` fails — the count embed in the client query just
-- made it visible on one endpoint.
--
-- FIX: policy subqueries that touch another RLS table (or their own table)
-- run through SECURITY DEFINER SQL functions instead. Inside a definer
-- function the inner query executes as the function owner with RLS
-- bypassed, so no policy re-entrancy occurs. Each helper returns exactly
-- the one fact the policy needed (is the group public? / caller's role).
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

-- True when the group is public. Replaces 008's memberships_public_read
-- subquery AND the membership-membership half of 001's groups_member_read.
create or replace function public.sf_group_is_public(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.visibility = 'public'
  )
$$;

-- Caller's role in a group, or null. SECURITY DEFINER so the policies that
-- consult it don't re-enter group_memberships' own policies. Same contract
-- as the plain function 016 shipped (kept name/signature — clients/RPCs
-- calling it see no change).
create or replace function public.sf_group_role(p_group_id text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role from public.group_memberships m
  where m.group_id = p_group_id and m.user_id = auth.uid()
$$;

revoke all on function public.sf_group_is_public(text) from public;
grant execute on function public.sf_group_is_public(text) to public;
revoke all on function public.sf_group_role(text) from public;
grant execute on function public.sf_group_role(text) to public;

-- ---------------------------------------------------------------------------
-- 2. group_memberships SELECT policies
-- ---------------------------------------------------------------------------

-- Was (008): exists (select 1 from public.groups g
--             where g.id = group_id and g.visibility = 'public')
--   → recursed into groups policies → 001 groups_member_read → back here.
drop policy if exists memberships_public_read on public.group_memberships;
create policy memberships_public_read on public.group_memberships
  for select using (public.sf_group_is_public(group_id));

-- Was (016): user_id = auth.uid()
--         or exists (... group_memberships ...)   ← self-recursive
--         or exists (... groups g where g.owner_id = auth.uid())
-- The self-referencing member half now goes through the definer role
-- helper (no policy re-entrancy). The owner half subqueries groups — safe
-- after §4, because the groups SELECT policies no longer touch
-- group_memberships (bounded depth, no cycle).
drop policy if exists memberships_member_read on public.group_memberships;
create policy memberships_member_read on public.group_memberships
  for select using (
    user_id = auth.uid()
    or public.sf_group_role(group_id) is not null
    or exists (select 1 from public.groups g
               where g.id = group_id and g.owner_id = auth.uid())
  );

-- Was (001): auth.uid() = user_id
--         or exists (select 1 from public.groups g
--                    where g.id = group_id and g.owner_id = auth.uid())
-- Semantics unchanged: the groups subquery was only dangerous while the
-- groups SELECT policies re-entered group_memberships (§4 removes that).
-- Rewritten only to be explicit about the post-fix reasoning.
drop policy if exists memberships_self_read on public.group_memberships;
create policy memberships_self_read on public.group_memberships
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.groups g
               where g.id = group_id and g.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. group_memberships WRITE policies (016) — role subqueries made recursion-free
-- ---------------------------------------------------------------------------

-- Was (016): role = 'member' and exists (select 1 from group_memberships m
--             where m.group_id = group_id and m.user_id = auth.uid()
--             and m.role in ('owner','admin'))                    ← self-recursive
drop policy if exists memberships_admin_insert on public.group_memberships;
create policy memberships_admin_insert on public.group_memberships
  for insert with check (
    role = 'member'
    and public.sf_group_role(group_id) in ('owner', 'admin')
  );

drop policy if exists memberships_admin_remove on public.group_memberships;
create policy memberships_admin_remove on public.group_memberships
  for delete using (
    role = 'member'
    and public.sf_group_role(group_id) in ('owner', 'admin')
  );

-- ---------------------------------------------------------------------------
-- 4. groups SELECT policy (001) — the other half of the mutual recursion
-- ---------------------------------------------------------------------------

-- Was (001): visibility = 'public' or owner_id = auth.uid()
--         or exists (select 1 from public.group_memberships m
--                    where m.group_id = id and m.user_id = auth.uid())
--   → the subquery ran memberships policies (008/016) which subqueried
--     groups again → 42P17.
drop policy if exists groups_member_read on public.groups;
create policy groups_member_read on public.groups
  for select using (
    visibility = 'public'
    or owner_id = auth.uid()
    or public.sf_group_role(id) is not null
  );

-- Same story for messages_member_read (016): its membership subquery runs
-- group_memberships SELECT policies, which previously re-entered groups →
-- messages → ... With §2/§4 in place the cycle is gone; rewritten to use
-- the definer helper anyway so message reads stay one level deep and
-- future policy edits can't silently reintroduce a cycle.
drop policy if exists messages_member_read on public.messages;
create policy messages_member_read on public.messages
  for select using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or public.sf_group_role(group_id) is not null
  );

-- NOTE — policies intentionally left as-is:
--   groups_owner_all (016), groups_admin_update (016):
--     subquery group_memberships for admin check — their inner query runs
--     SELECT policies on group_memberships, which (after this migration)
--     no longer subquery groups. No cycle remains.
--   memberships_owner_update / memberships_owner_delete (001):
--     subquery groups (SELECT-side only) — no cycle after this fix.
--   memberships_self_insert (016): subqueries groups via
--     sf_blocked_between (community_blocks — definer) and a direct groups
--     SELECT: the groups SELECT policies no longer touch
--     group_memberships, so no cycle.
--   Legacy 001 memberships_self_write (INSERT, groups subquery): harmless
--     post-fix (groups SELECT side is clean). Supabase-owned policy —
--     leave in place.

commit;

-- ============================================================================
-- VERIFY — run these after applying:
--
-- 1. No recursion error, public list works (anon role, like the app):
--      select id, name from public.groups
--      where visibility = 'public' limit 5;
--
-- 2. The exact client query shape works:
--      select g.id, g.name,
--             (select count(*) from public.group_memberships gm
--              where gm.group_id = g.id) as member_count
--      from public.groups g where g.visibility = 'public' limit 5;
--
-- 3. Policies now in place:
--      select tablename, policyname, cmd from pg_policies
--      where schemaname = 'public'
--        and tablename in ('groups','group_memberships')
--      order by tablename, policyname;
--
-- Expected: queries 1–2 return rows (HTTP 200 from /rest/v1/groups),
-- no 42P17 anywhere.
-- ============================================================================
