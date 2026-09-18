-- StudyFlow Phase 7 completion (mute sync + story kind default).
--
-- 016 is already applied in production — this file only ADDS. Nothing here
-- alters or drops anything from 001–016.
--
-- Why this exists:
-- 1. group_memberships.muted_at (016 §2) has no member self-service path:
--    the only update policy is owner-only (001 memberships_owner_update), so
--    members could never persist their own mute. Rather than opening a broad
--    UPDATE policy (which could not restrict *which columns* change),
--    sf_mute_set() updates ONLY muted_at on ONLY the caller's OWN row.
-- 2. stories.kind is NOT NULL without a default, so inserts that omit it
--    fail. Defaulting to 'text' keeps every client working.
--
-- Free-plan safe: one plpgsql function + one column default. No extensions,
-- no cron, no Edge Functions, no new realtime publications.

-- 1. stories.kind default -----------------------------------------------------
alter table public.stories alter column kind set default 'text';

-- 2. mute sync RPC ------------------------------------------------------------
-- p_muted_at: timestamptz until which notifications stay paused, or NULL to
-- unmute. Clients represent "muted forever" with the sentinel
-- 9999-12-31T00:00:00Z (a real timestamptz, so expiry comparisons keep
-- working everywhere). Mute NEVER blocks delivery — it only gates the
-- notification path in the app; realtime + history are untouched.
create or replace function public.sf_mute_set(
  p_group_id text, p_muted_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_out timestamptz;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_group_id is null or char_length(p_group_id) < 1 then raise exception 'INVALID_GROUP'; end if;
  -- Caller must belong to the group; the update touches ONLY muted_at on
  -- ONLY the caller's own membership row (role/group/user are immutable here).
  update public.group_memberships
  set muted_at = p_muted_at
  where group_id = p_group_id and user_id = v_uid
  returning muted_at into v_out;
  if not found then raise exception 'NOT_A_MEMBER'; end if;
  return jsonb_build_object('ok', true, 'muted_at', v_out);
end;
$$;
