-- 029: invite notifications between friends (sprint / session / challenge).
--
-- Direct client inserts into notifications are self-only under RLS
-- (notifications_self_all). Invites need a security-definer path so one
-- friend can land a structured invite in another's bell without opening
-- the chat. Extends sf_notify with type 'invite' (friendship-verified),
-- title/text carried in metadata (server still owns the recipient list).
--
-- Safe to re-run.

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
      'group_activity', 'connection', 'invite') then
    raise exception 'INVALID_TYPE';
  end if;
  if p_event_key is null or char_length(p_event_key) < 1 or char_length(p_event_key) > 128 then
    raise exception 'INVALID_REF';
  end if;
  if p_type = 'invite' then
    if p_user_id is null then raise exception 'INVALID_USER'; end if;
    if p_user_id = v_uid then raise exception 'INVALID_USER'; end if;
    -- Recipient must hold an accepted friendship with the caller.
    if not exists (select 1 from public.friendships
        where status = 'accepted' and (
          (user_id = v_uid and friend_id = p_user_id) or
          (user_id = p_user_id and friend_id = v_uid))) then
      raise exception 'INVALID_USER';
    end if;
    v_recipients := array[p_user_id];
    v_title := left(nullif(coalesce(p_metadata->>'title', ''), ''), 120);
    if v_title is null or v_title = '' then v_title := 'New invite'; end if;
    v_text := left(coalesce(p_metadata->>'text', 'Open Community to respond.'), 400);
  elsif p_type in ('group_added', 'group_admin', 'group_removed',
      'group_activity') then
    if p_group_id is null then raise exception 'INVALID_GROUP'; end if;
    select name into v_gname from public.groups where id = p_group_id;
    if v_gname is null then raise exception 'INVALID_GROUP'; end if;
    if p_type = 'group_activity' then
      if public.sf_group_role(p_group_id) is null then raise exception 'NOT_MEMBER'; end if;
      select coalesce(array_agg(user_id), '{}') into v_recipients
      from public.group_memberships where group_id = p_group_id and user_id <> v_uid;
      v_title := left(nullif(coalesce(p_metadata->>'title', ''), ''), 120);
      if v_title is null or v_title = '' then v_title := 'Group activity'; end if;
      v_text := left(coalesce(p_metadata->>'text', 'New activity in ' || left(v_gname, 80)), 400);
    else
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
