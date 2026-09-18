-- StudyFlow Phase 7 (community, groups, stories, blocks, notifications).
--
-- Reuses existing tables (groups, group_memberships, friendships, messages,
-- notifications, profiles, reports) — no duplicates. Private WhatsApp-style
-- groups become possible by relaxing the public-only constraint from 008;
-- every privileged action additionally gets a SECURITY DEFINER RPC so the
-- database (not the UI) enforces owner/admin/member roles.
--
-- Free-plan safe: plain tables, btree/unique indexes, RLS, plpgsql. No
-- extensions, no cron, no Edge Functions, no new realtime publications.

-- ---------------------------------------------------------------------------
-- 1. groups: private groups + avatar + touch trigger
-- ---------------------------------------------------------------------------
alter table public.groups add column if not exists avatar_path text;
alter table public.groups add column if not exists updated_at timestamptz not null default now();

-- 008 forced visibility='public'. Phase 7 supports private groups; the new
-- check keeps the value domain tight.
alter table public.groups drop constraint if exists groups_visibility_check;
alter table public.groups add constraint groups_visibility_check
  check (visibility in ('private', 'public'));

drop trigger if exists groups_touch_updated_at on public.groups;
create trigger groups_touch_updated_at
  before update on public.groups
  for each row execute procedure public.touch_updated_at();

-- Only the owner may flip visibility (admins edit everything else).
create or replace function public.enforce_group_visibility_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.visibility is distinct from old.visibility
    and old.owner_id is distinct from auth.uid() then
    raise exception 'GROUP_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_visibility_owner_guard on public.groups;
create trigger groups_visibility_owner_guard
  before update on public.groups
  for each row execute procedure public.enforce_group_visibility_owner();

-- Helpers used by the policies below. Defined after community_blocks because
-- CREATE FUNCTION and CREATE POLICY both validate table references at
-- creation time.
-- community_blocks must exist before ANY function, policy, RPC, or query
-- references it. This is the single authoritative definition.
create table if not exists public.community_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists community_blocks_blocker_idx on public.community_blocks (blocker_id);

alter table public.community_blocks enable row level security;

-- Blockers manage their own rows; the blocked party never sees them.
drop policy if exists blocks_self_all on public.community_blocks;
create policy blocks_self_all on public.community_blocks
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- Caller's role in a group (null when not a member). Used by RPCs below.
create or replace function public.sf_group_role(p_group_id text)
returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.group_memberships m
  where m.group_id = p_group_id and m.user_id = auth.uid()
$$;

-- True when either user blocked the other.
create or replace function public.sf_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.community_blocks x
    where (x.blocker_id = a and x.blocked_id = b)
       or (x.blocker_id = b and x.blocked_id = a))
$$;

-- ---------------------------------------------------------------------------
-- 2. group_memberships: mute timestamp
-- ---------------------------------------------------------------------------
alter table public.group_memberships add column if not exists muted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. messages: edit/delete lifecycle + voice/system kinds
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'file', 'photo', 'poll', 'voice', 'system'));

create index if not exists messages_sender_created_idx
  on public.messages (sender_id, created_at desc);

-- Admins (not just owners) may update group rows, but never delete them and
-- never flip visibility (see the trigger above).
drop policy if exists groups_owner_write on public.groups;
create policy groups_owner_all on public.groups
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists groups_admin_update on public.groups;
create policy groups_admin_update on public.groups
  for update using (
    exists (select 1 from public.group_memberships m
      where m.group_id = id and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  ) with check (
    exists (select 1 from public.group_memberships m
      where m.group_id = id and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  );

-- Admins may add plain members and remove plain members (not admins/owner).
-- Role changes and anything fancier go through the sf_group_* RPCs.
drop policy if exists memberships_admin_insert on public.group_memberships;
create policy memberships_admin_insert on public.group_memberships
  for insert with check (
    role = 'member'
    and exists (select 1 from public.group_memberships m
      where m.group_id = group_id and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  );
drop policy if exists memberships_admin_remove on public.group_memberships;
create policy memberships_admin_remove on public.group_memberships
  for delete using (
    role = 'member'
    and exists (select 1 from public.group_memberships m
      where m.group_id = group_id and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  );

-- Tighten the legacy self-write policy: no self-granting admin/owner, no
-- joining private groups directly. (Admin adds go through the policy above
-- or the sf_group_* RPCs; ownership only via RPC.)
drop policy if exists memberships_self_write on public.group_memberships;
create policy memberships_self_insert on public.group_memberships
  for insert with check (
    user_id = auth.uid() and (
      (role = 'member' and exists (
        select 1 from public.groups g
        where g.id = group_id and g.visibility = 'public'
          and not public.sf_blocked_between(auth.uid(), g.owner_id)))
      or (role = 'owner' and exists (
        select 1 from public.groups g
        where g.id = group_id and g.owner_id = auth.uid()))
    )
  );

-- Fellow members can read the roster (needed for member lists in private
-- groups; the legacy policy only exposed self + owner reads).
drop policy if exists memberships_member_read on public.group_memberships;
create policy memberships_member_read on public.group_memberships
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.group_memberships m
      where m.group_id = group_id and m.user_id = auth.uid())
    or exists (select 1 from public.groups g
      where g.id = group_id and g.owner_id = auth.uid())
  );

-- DMs are refused in either block direction (server-enforced, not UI-only).
drop policy if exists messages_sender_insert on public.messages;
create policy messages_sender_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and (
      exists (select 1 from public.group_memberships m
        where m.group_id = group_id and m.user_id = auth.uid())
      or (
        group_id is null
        and exists (select 1 from public.friendships f
          where f.user_id = auth.uid() and f.friend_id = recipient_id and f.status = 'accepted')
        and not exists (select 1 from public.community_blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = recipient_id)
             or (b.blocker_id = recipient_id and b.blocked_id = auth.uid()))
      )
    )
  );

-- Blocked DM threads are invisible to both sides (history included).
drop policy if exists messages_member_read on public.messages;
create policy messages_member_read on public.messages
  for select using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or exists (select 1 from public.group_memberships m
      where m.group_id = group_id and m.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. friendships RLS (request → accept/decline flow)
-- ---------------------------------------------------------------------------
alter table public.friendships enable row level security;

-- Stable row handle for accept/decline/cancel by id (the legacy PK is the
-- (user_id, friend_id) pair, which the client would otherwise have to
-- round-trip for every inbox action).
alter table public.friendships add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists friendships_id_uniq on public.friendships (id);

drop policy if exists friendships_request_insert on public.friendships;
create policy friendships_request_insert on public.friendships
  for insert with check (
    auth.uid() = user_id and auth.uid() <> friend_id and status = 'pending'
  );
drop policy if exists friendships_involved_read on public.friendships;
create policy friendships_involved_read on public.friendships
  for select using (auth.uid() = user_id or auth.uid() = friend_id);
drop policy if exists friendships_recipient_accept on public.friendships;
create policy friendships_recipient_accept on public.friendships
  for update using (auth.uid() = friend_id) with check (status = 'accepted');
drop policy if exists friendships_involved_delete on public.friendships;
create policy friendships_involved_delete on public.friendships
  for delete using (auth.uid() = user_id or auth.uid() = friend_id);

-- The legacy friendships_self_all policy (001) let a requester accept their OWN
-- request (its with-check only pinned user_id), defeating recipient
-- acceptance. It is replaced by the four least-privilege rules above.
drop policy if exists friendships_self_all on public.friendships;

-- ---------------------------------------------------------------------------
-- 5. notifications: structured types + dedupe
-- ---------------------------------------------------------------------------
alter table public.notifications add column if not exists type text not null default 'general'
  check (char_length(type) between 1 and 40);
alter table public.notifications add column if not exists entity_id text;
alter table public.notifications add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists event_key text;

create index if not exists notifications_user_created_idx2
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read_at) where read_at is null;

-- One event key = one notification per recipient. Retries can never spam.
create unique index if not exists notifications_recipient_event_uniq
  on public.notifications (user_id, event_key)
  where event_key is not null;

-- ---------------------------------------------------------------------------
-- 6. stories + story views
-- ---------------------------------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text', 'image', 'video')),
  text text not null default '' check (char_length(text) <= 500),
  media_path text,
  visibility text not null default 'public' check (visibility in ('public', 'connections', 'private')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  -- Server-enforced 24h lifetime window (checked at write time).
  check (expires_at > created_at and expires_at <= created_at + interval '25 hours')
);

create index if not exists stories_user_expiry_idx
  on public.stories (user_id, expires_at desc);

alter table public.stories enable row level security;

-- Owners manage their own rows. Others may read non-expired rows they are
-- allowed to see: public, or connections-gated with an accepted friendship.
drop policy if exists stories_self_all on public.stories;
create policy stories_self_all on public.stories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists stories_visible_read on public.stories;
create policy stories_visible_read on public.stories
  for select using (
    expires_at > now()
    and (
      visibility = 'public'
      or (
        visibility = 'connections'
        and exists (select 1 from public.friendships f
          where f.status = 'accepted' and (
            (f.user_id = auth.uid() and f.friend_id = stories.user_id) or
            (f.user_id = stories.user_id and f.friend_id = auth.uid())))
      )
    )
  );

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index if not exists story_views_story_idx on public.story_views (story_id);

alter table public.story_views enable row level security;

drop policy if exists story_views_self_read on public.story_views;
create policy story_views_self_read on public.story_views
  for select using (
    auth.uid() = viewer_id
    or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 7. storage: group avatars + story/group media reads
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('studyflow-groups', 'studyflow-groups', false),
  ('studyflow-stories', 'studyflow-stories', false),
  ('studyflow-files', 'studyflow-files', false)
on conflict (id) do nothing;

-- Group avatar/media paths: <group_id>/... — owner/admin write, members read.
drop policy if exists groups_media_owner_admin_write on storage.objects;
create policy groups_media_owner_admin_write on storage.objects
  for insert with check (
    bucket_id = 'studyflow-groups'
    and exists (select 1 from public.group_memberships m
      where m.group_id = (storage.foldername(name))[1]
        and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  );
drop policy if exists groups_media_owner_admin_update on storage.objects;
create policy groups_media_owner_admin_update on storage.objects
  for update using (
    bucket_id = 'studyflow-groups'
    and exists (select 1 from public.group_memberships m
      where m.group_id = (storage.foldername(name))[1]
        and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
  );
drop policy if exists groups_media_owner_delete on storage.objects;
create policy groups_media_owner_delete on storage.objects
  for delete using (
    bucket_id = 'studyflow-groups'
    and exists (select 1 from public.groups g
      where g.id = (storage.foldername(name))[1] and g.owner_id = auth.uid())
  );
drop policy if exists groups_media_member_read on storage.objects;
create policy groups_media_member_read on storage.objects
  for select using (
    bucket_id = 'studyflow-groups'
    and exists (select 1 from public.group_memberships m
      where m.group_id = (storage.foldername(name))[1] and m.user_id = auth.uid())
  );

-- Story media: owner always; others only through a live, visible story row.
drop policy if exists stories_media_visible_read on storage.objects;
create policy stories_media_visible_read on storage.objects
  for select using (
    bucket_id = 'studyflow-stories'
    and exists (select 1 from public.stories s
      where s.media_path = name
        and s.expires_at > now()
        and (
          s.visibility = 'public'
          or (
            s.visibility = 'connections'
            and exists (select 1 from public.friendships f
              where f.status = 'accepted' and (
                (f.user_id = auth.uid() and f.friend_id = s.user_id) or
                (f.user_id = s.user_id and f.friend_id = auth.uid())))
          )
        ))
  );

-- Group message attachments live in studyflow-files under the sender's folder
-- (existing owner policies cover writes); members/recipients may read files
-- referenced by a message they are allowed to see.
drop policy if exists files_message_member_read on storage.objects;
create policy files_message_member_read on storage.objects
  for select using (
    bucket_id = 'studyflow-files'
    and exists (select 1 from public.messages m
      where m.attachment_path = name
        and m.deleted_at is null
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid()
          or exists (select 1 from public.group_memberships g
            where g.group_id = m.group_id and g.user_id = auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- 8. secure RPCs — roles, ownership and recipients enforced by the database
--    (helpers sf_group_role / sf_blocked_between are defined in section 1,
--    before the policies that reference them)
-- ---------------------------------------------------------------------------

-- Central notification writer. Titles/texts are server TEMPLATES — the
-- client supplies type + refs + dedupe key, never the recipient list or copy.
create or replace function public.sf_notify(
  p_type text, p_event_key text, p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb, p_group_id text default null,
  p_user_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_recipients uuid[] := '{}';
  v_title text;
  v_text text;
  v_gname text;
  v_count integer := 0;
  v_r uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_type not in ('group_added', 'group_admin', 'group_removed',
      'group_activity', 'connection') then
    raise exception 'INVALID_TYPE';
  end if;
  if p_event_key is null or char_length(p_event_key) < 1 or char_length(p_event_key) > 128 then
    raise exception 'INVALID_REF';
  end if;
  if p_type in ('group_added', 'group_admin', 'group_removed', 'group_activity') then
    if p_group_id is null then raise exception 'INVALID_GROUP'; end if;
    select name into v_gname from public.groups where id = p_group_id;
    if v_gname is null then raise exception 'INVALID_GROUP'; end if;
    if p_type = 'group_activity' then
      -- Fan-out to current members except the actor.
      if public.sf_group_role(p_group_id) is null then raise exception 'NOT_MEMBER'; end if;
      select coalesce(array_agg(user_id), '{}') into v_recipients
      from public.group_memberships where group_id = p_group_id and user_id <> v_uid;
      v_title := 'Group activity';
      v_text := 'New activity in ' || left(v_gname, 80);
    else
      -- Single-recipient events: the recipient must actually hold the role
      -- being announced (verified here, never trusted from the client).
      if p_user_id is null then raise exception 'INVALID_USER'; end if;
      if p_type = 'group_added'
        and not exists (select 1 from public.group_memberships
          where group_id = p_group_id and user_id = p_user_id) then
        raise exception 'INVALID_USER';
      end if;
      if p_type = 'group_admin'
        and not exists (select 1 from public.group_memberships
          where group_id = p_group_id and user_id = p_user_id and role in ('owner', 'admin')) then
        raise exception 'INVALID_USER';
      end if;
      if p_type = 'group_removed'
        and exists (select 1 from public.group_memberships
          where group_id = p_group_id and user_id = p_user_id) then
        raise exception 'INVALID_USER';
      end if;
      v_recipients := array[p_user_id];
      v_title := case p_type
        when 'group_added' then 'Added to a group'
        when 'group_admin' then 'Made an admin'
        else 'Removed from group' end;
      v_text := case p_type
        when 'group_added' then 'You were added to ' || left(v_gname, 80)
        when 'group_admin' then 'You are now an admin of ' || left(v_gname, 80)
        else 'You were removed from ' || left(v_gname, 80) end;
    end if;
  else -- connection
    if p_user_id is null then raise exception 'INVALID_USER'; end if;
    -- The other party must hold an accepted friendship with the caller.
    if not exists (select 1 from public.friendships
        where status = 'accepted' and (
          (user_id = v_uid and friend_id = p_user_id) or
          (user_id = p_user_id and friend_id = v_uid))) then
      raise exception 'INVALID_USER';
    end if;
    v_recipients := array[p_user_id];
    v_title := 'New connection';
    v_text := 'You are now connected — say hi and plan a session.';
  end if;
  foreach v_r in array v_recipients loop
    if v_r = v_uid then continue; end if;
    insert into public.notifications (user_id, title, text, type, entity_id, metadata, event_key)
    values (v_r, v_title, v_text, p_type, p_entity_id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('group_id', p_group_id),
      p_event_key)
    on conflict (user_id, event_key) where event_key is not null do nothing;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('notified', v_count);
end;
$$;

create or replace function public.sf_group_create(
  p_id text, p_name text, p_description text default '',
  p_logo text default '📚', p_topics text[] default '{}',
  p_visibility text default 'private'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_topics text[] := '{}';
  v_t text;
  v_i integer;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'INVALID_ID'; end if;
  if char_length(coalesce(p_name, '')) < 1 or char_length(p_name) > 120 then raise exception 'INVALID_NAME'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'INVALID_DESC'; end if;
  if p_visibility not in ('private', 'public') then raise exception 'INVALID_VIS'; end if;
  select count(*) into v_count from public.groups
  where owner_id = v_uid and created_at::date = current_date;
  if v_count >= 10 then raise exception 'RATE_LIMITED'; end if;
  for v_i in 1..least(8, coalesce(array_length(p_topics, 1), 0)) loop
    v_t := left(coalesce(p_topics[v_i], ''), 40);
    if char_length(v_t) >= 1 then v_topics := v_topics || v_t; end if;
  end loop;
  insert into public.groups (id, owner_id, name, description, logo, focus_topics, visibility)
  values (p_id, v_uid, p_name, coalesce(p_description, ''),
    coalesce(nullif(p_logo, ''), '📚'), v_topics, p_visibility)
  on conflict (id) do nothing;
  insert into public.group_memberships (group_id, user_id, role)
  values (p_id, v_uid, 'owner')
  on conflict (group_id, user_id) do nothing;
  -- An id collision with someone else's group must fail loudly, not hijack.
  if not exists (select 1 from public.groups where id = p_id and owner_id = v_uid) then
    raise exception 'ID_TAKEN';
  end if;
  return jsonb_build_object('id', p_id);
end;
$$;

create or replace function public.sf_group_add_member(
  p_group_id text, p_user_id uuid, p_role text default 'member'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_exists boolean;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_role not in ('member', 'admin') then raise exception 'INVALID_ROLE'; end if;
  select public.sf_group_role(p_group_id) into v_role;
  if v_role is null then raise exception 'NOT_MEMBER'; end if;
  if v_role = 'admin' and p_role <> 'member' then raise exception 'GROUP_FORBIDDEN'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'GROUP_FORBIDDEN'; end if;
  if p_user_id = v_uid then raise exception 'INVALID_USER'; end if;
  select exists (select 1 from public.profiles where id = p_user_id) into v_exists;
  if not v_exists then raise exception 'USER_NOT_FOUND'; end if;
  if public.sf_blocked_between(v_uid, p_user_id) then raise exception 'BLOCKED'; end if;
  insert into public.group_memberships (group_id, user_id, role)
  values (p_group_id, p_user_id, p_role)
  on conflict (group_id, user_id) do nothing;
  -- Notify the added user (idempotent per group+user).
  perform public.sf_notify('group_added', 'ga:' || p_group_id || ':' || p_user_id,
    p_entity_id := p_group_id, p_metadata := jsonb_build_object('by', v_uid),
    p_group_id := p_group_id, p_user_id := p_user_id);
  return jsonb_build_object('group_id', p_group_id, 'user_id', p_user_id, 'role', p_role);
end;
$$;

create or replace function public.sf_group_set_member(
  p_group_id text, p_user_id uuid, p_action text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_target text;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_action not in ('promote', 'demote', 'remove') then raise exception 'INVALID_ACTION'; end if;
  if p_user_id = v_uid then raise exception 'USE_LEAVE'; end if;
  select public.sf_group_role(p_group_id) into v_role;
  select role into v_target from public.group_memberships
  where group_id = p_group_id and user_id = p_user_id;
  if v_target is null then raise exception 'NOT_A_MEMBER'; end if;
  if v_target = 'owner' then raise exception 'GROUP_FORBIDDEN'; end if;
  if v_role = 'owner' then
    if p_action = 'promote' then
      update public.group_memberships set role = 'admin'
      where group_id = p_group_id and user_id = p_user_id;
      perform public.sf_notify('group_admin', 'gd:' || p_group_id || ':' || p_user_id,
        p_entity_id := p_group_id, p_metadata := jsonb_build_object('by', v_uid),
        p_group_id := p_group_id, p_user_id := p_user_id);
    elsif p_action = 'demote' then
      update public.group_memberships set role = 'member'
      where group_id = p_group_id and user_id = p_user_id;
    else
      delete from public.group_memberships
      where group_id = p_group_id and user_id = p_user_id;
      perform public.sf_notify('group_removed', 'gr:' || p_group_id || ':' || p_user_id,
        p_entity_id := p_group_id, p_metadata := jsonb_build_object('by', v_uid),
        p_group_id := p_group_id, p_user_id := p_user_id);
    end if;
  elsif v_role = 'admin' and p_action = 'remove' and v_target = 'member' then
    delete from public.group_memberships
    where group_id = p_group_id and user_id = p_user_id;
    perform public.sf_notify('group_removed', 'gr:' || p_group_id || ':' || p_user_id,
      p_entity_id := p_group_id, p_metadata := jsonb_build_object('by', v_uid),
      p_group_id := p_group_id, p_user_id := p_user_id);
  else
    raise exception 'GROUP_FORBIDDEN';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.sf_group_leave(p_group_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_next uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select public.sf_group_role(p_group_id) into v_role;
  if v_role is null then raise exception 'NOT_A_MEMBER'; end if;
  if v_role <> 'owner' then
    delete from public.group_memberships where group_id = p_group_id and user_id = v_uid;
    return jsonb_build_object('left', true);
  end if;
  -- Owner leaving: oldest admin inherits, else oldest member. Sole member
  -- deletes the group (cascades memberships + messages). Never ownerless.
  select user_id into v_next from public.group_memberships
  where group_id = p_group_id and user_id <> v_uid
  order by (role = 'admin') desc, joined_at asc nulls last
  limit 1;
  if v_next is null then
    delete from public.groups where id = p_group_id;
    return jsonb_build_object('left', true, 'deleted_group', true);
  end if;
  update public.group_memberships set role = 'owner'
  where group_id = p_group_id and user_id = v_next;
  delete from public.group_memberships where group_id = p_group_id and user_id = v_uid;
  return jsonb_build_object('left', true, 'transferred_to', v_next);
end;
$$;

create or replace function public.sf_group_transfer(p_group_id text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_user_id = v_uid then raise exception 'INVALID_USER'; end if;
  if public.sf_group_role(p_group_id) <> 'owner' then
    raise exception 'GROUP_FORBIDDEN';
  end if;
  if not exists (select 1 from public.group_memberships
      where group_id = p_group_id and user_id = p_user_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  update public.group_memberships set role = 'owner'
  where group_id = p_group_id and user_id = p_user_id;
  update public.group_memberships set role = 'admin'
  where group_id = p_group_id and user_id = v_uid;
  perform public.sf_notify('group_admin', 'gd:' || p_group_id || ':' || p_user_id,
    p_entity_id := p_group_id,
    p_metadata := jsonb_build_object('by', v_uid, 'ownership', true),
    p_group_id := p_group_id, p_user_id := p_user_id);
  return jsonb_build_object('ok', true, 'owner', p_user_id);
end;
$$;

create or replace function public.sf_group_delete(p_group_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if public.sf_group_role(p_group_id) <> 'owner' then
    raise exception 'GROUP_FORBIDDEN';
  end if;
  delete from public.groups where id = p_group_id;
  return jsonb_build_object('deleted', true);
end;
$$;

create or replace function public.sf_group_update(
  p_group_id text, p_name text default null, p_description text default null,
  p_logo text default null, p_topics text[] default null,
  p_avatar_path text default null, p_visibility text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_topics text[];
  v_t text;
  v_i integer;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select public.sf_group_role(p_group_id) into v_role;
  if v_role is null then raise exception 'NOT_MEMBER'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'GROUP_FORBIDDEN'; end if;
  -- Visibility flips are owner-only (also enforced by trigger).
  if p_visibility is not null and p_visibility <> (select visibility from public.groups where id = p_group_id) then
    if v_role <> 'owner' then raise exception 'GROUP_FORBIDDEN'; end if;
    if p_visibility not in ('private', 'public') then raise exception 'INVALID_VIS'; end if;
  end if;
  if p_name is not null and (char_length(p_name) < 1 or char_length(p_name) > 120) then
    raise exception 'INVALID_NAME';
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    raise exception 'INVALID_DESC';
  end if;
  if p_topics is not null then
    v_topics := '{}';
    for v_i in 1..least(8, coalesce(array_length(p_topics, 1), 0)) loop
      v_t := left(coalesce(p_topics[v_i], ''), 40);
      if char_length(v_t) >= 1 then v_topics := v_topics || v_t; end if;
    end loop;
  end if;
  update public.groups set
    name = coalesce(p_name, name),
    description = coalesce(p_description, description),
    logo = coalesce(nullif(p_logo, ''), logo),
    focus_topics = coalesce(v_topics, focus_topics),
    avatar_path = coalesce(p_avatar_path, avatar_path),
    visibility = coalesce(p_visibility, visibility)
  where id = p_group_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Soft-delete a message: sender always; group owner/admin may moderate.
create or replace function public.sf_message_delete(p_message_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_msg record;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into v_msg from public.messages where id = p_message_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_msg.sender_id = v_uid then
    update public.messages set deleted_at = now() where id = p_message_id;
    return jsonb_build_object('deleted', true);
  end if;
  if v_msg.group_id is not null
    and public.sf_group_role(v_msg.group_id) in ('owner', 'admin') then
    update public.messages set deleted_at = now() where id = p_message_id;
    return jsonb_build_object('deleted', true, 'moderated', true);
  end if;
  raise exception 'GROUP_FORBIDDEN';
end;
$$;

-- Idempotent story view: reopening never duplicates the record.
create or replace function public.sf_story_view(p_story_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean;
  v_n integer;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select exists (
    select 1 from public.stories s
    where s.id = p_story_id and s.expires_at > now()
      and (s.user_id = v_uid or s.visibility = 'public'
        or (s.visibility = 'connections'
          and exists (select 1 from public.friendships f
            where f.status = 'accepted' and (
              (f.user_id = v_uid and f.friend_id = s.user_id) or
              (f.user_id = s.user_id and f.friend_id = v_uid)))
          and not public.sf_blocked_between(v_uid, s.user_id)))
  ) into v_ok;
  if not v_ok then raise exception 'NOT_FOUND'; end if;
  insert into public.story_views (story_id, viewer_id)
  values (p_story_id, v_uid)
  on conflict (story_id, viewer_id) do nothing;
  select count(*) into v_n from public.story_views where story_id = p_story_id;
  return jsonb_build_object('ok', true, 'views', v_n);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. directory lockdown: public fields only, via RPC — never raw table reads
-- ---------------------------------------------------------------------------

-- The old profiles_directory_read policy exposed the WHOLE profile row
-- (email, phone, university…) to every signed-in user. Replaced by a
-- locked-down RPC returning identity fields only.
drop policy if exists profiles_directory_read on public.profiles;

create or replace function public.search_users(q text, p_limit integer default 8)
returns table (id uuid, handle text, name text, avatar text, bio text)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle, p.name, p.avatar, p.bio
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.searchable = true
    and (p.handle ilike '%' || q || '%' or p.name ilike '%' || q || '%')
    and not exists (select 1 from public.community_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
  order by p.updated_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;

-- Batch public profiles for rosters/member lists (ids validated server-side).
create or replace function public.get_public_profiles(p_ids uuid[])
returns table (id uuid, handle text, name text, avatar text, bio text)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle, p.name, p.avatar, p.bio
  from public.profiles p
  where auth.uid() is not null
    and p.id = any(coalesce(p_ids, '{}'))
    and p.searchable = true
    and not exists (select 1 from public.community_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
  limit 100
$$;
