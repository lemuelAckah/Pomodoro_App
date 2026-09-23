-- 026: profile friend lists + mutual friends.
--
-- openProfileView needs another user's accepted connections, which RLS
-- (friendships_involved_read) intentionally hides — only a SECURITY DEFINER
-- RPC can read them. mutual marks people who are also accepted friends of
-- the caller so the client can sort them first and badge "in common".
--
-- Privacy gates match the directory RPCs (016/024): caller must be signed
-- in; only searchable profiles return; blocks hide people in either
-- direction (caller↔person and caller↔profile owner); the caller and the
-- profile owner never appear in their own strip. Free-plan safe: plain SQL.

create or replace function public.list_user_friends(p_user uuid)
returns table (
  id uuid,
  handle text,
  name text,
  avatar text,
  bio text,
  photo_path text,
  mutual boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle, p.name, p.avatar, p.bio, p.photo_path,
    (p_user <> auth.uid()
      and exists (
        select 1 from public.friendships mf
        where mf.status = 'accepted'
          and (
            (mf.user_id = auth.uid() and mf.friend_id = p.id)
            or (mf.user_id = p.id and mf.friend_id = auth.uid())
          )
      )) as mutual
  from public.friendships f
  join public.profiles p
    on p.id = case when f.user_id = p_user then f.friend_id else f.user_id end
  where auth.uid() is not null
    and p_user is not null
    and f.status = 'accepted'
    and (f.user_id = p_user or f.friend_id = p_user)
    and p.id <> auth.uid()
    and p.id <> p_user
    and p.searchable = true
    and not public.sf_blocked_between(auth.uid(), p_user)
    and not public.sf_blocked_between(auth.uid(), p.id)
  order by mutual desc, p.handle
  limit 40
$$;
