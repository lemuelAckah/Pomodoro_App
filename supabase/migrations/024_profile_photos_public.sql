-- 024: profile photos in the safe directory.
--
-- get_public_profiles / search_users returned only the emoji initials field
-- (avatar), so friends could never see each other's profile pictures even
-- though photos live in a PUBLIC storage bucket. photo_path is safe to share:
-- the bucket is public-read and contains nothing but avatar images. The
-- columns are still never exposed by raw table reads — the directory lockdown
-- RPCs remain the only read path.

create or replace function public.get_public_profiles(p_ids uuid[])
returns table (id uuid, handle text, name text, avatar text, bio text, photo_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle, p.name, p.avatar, p.bio, p.photo_path
  from public.profiles p
  where auth.uid() is not null
    and p.id = any(coalesce(p_ids, '{}'))
    and p.searchable = true
    and not exists (select 1 from public.community_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
  limit 100
$$;

create or replace function public.search_users(q text, p_limit integer default 8)
returns table (id uuid, handle text, name text, avatar text, bio text, photo_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle, p.name, p.avatar, p.bio, p.photo_path
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

-- 024b: allow the group-invite message kind (private group invites travel as
-- structured DMs so recipients get a Join button inside their chat).
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'file', 'photo', 'poll', 'voice', 'system', 'group_invite'));
