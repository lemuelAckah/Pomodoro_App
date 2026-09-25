-- 025: statuses are friends-only.
-- The user-facing directive: a status may be viewed ONLY by accepted friends
-- (and its author). The previous stories_visible_read / stories_media_visible_read
-- policies allowed ANY signed-in user to read visibility='public' rows, and the
-- composers exposed a "Public" option — both are closed here.
--
-- Legacy rows already written as 'public' stay readable, but only through an
-- accepted friendship (the honest interpretation: the option never meant
-- "strangers"). visibility='private' stays owner-only via stories_self_all.
-- The client also drops the Public <option> and filters rings/loops to friends.
--
-- Free-plan safe: plain SQL policies only.
v
-- Owners already read via stories_self_all (for all using auth.uid() = user_id).

drop policy if exists stories_visible_read on public.stories;
create policy stories_visible_read on public.stories
  for select using (
    expires_at > now()
    and visibility in ('public', 'connections') -- legacy 'public' is now friends-gated too
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted' and (
        (f.user_id = auth.uid() and f.friend_id = stories.user_id) or
        (f.user_id = stories.user_id and f.friend_id = auth.uid())
      )
    )
  );

-- Story media follows the same rule; owner reads stay covered by the 009
-- owner-folder policy (auth.uid()::text = first folder segment).

drop policy if exists stories_media_visible_read on storage.objects;
create policy stories_media_visible_read on storage.objects
  for select using (
    bucket_id = 'studyflow-stories'
    and exists (
      select 1 from public.stories s
      where s.media_path = name
        and s.expires_at > now()
        and s.visibility in ('public', 'connections')
        and exists (
          select 1 from public.friendships f
          where f.status = 'accepted' and (
            (f.user_id = auth.uid() and f.friend_id = s.user_id) or
            (f.user_id = s.user_id and f.friend_id = auth.uid())
          )
        )
    )
  );
