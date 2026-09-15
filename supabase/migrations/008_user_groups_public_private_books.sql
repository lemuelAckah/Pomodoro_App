-- StudyFlow: groups exist only when users create them (always public);
-- uploaded books are strictly private (owner-only).

-- Fresh start: remove any pre-existing / demo groups. Memberships cascade.
delete from public.group_memberships;
delete from public.groups;

-- Every group is public so other users can discover and join it.
alter table public.groups alter column visibility set default 'public';
alter table public.groups drop constraint if exists groups_visibility_check;
alter table public.groups add constraint groups_visibility_check check (visibility = 'public');

-- Members of public groups are readable so learner counts and rosters work
-- for everyone (existing self/owner policies still apply).
drop policy if exists memberships_public_read on public.group_memberships;
create policy memberships_public_read on public.group_memberships
  for select using (
    exists (
      select 1 from public.groups g
      where g.id = group_id and g.visibility = 'public'
    )
  );

-- Books: strictly private. Only the owner can read their rows and files.
update public.books set visibility = 'private' where visibility <> 'private';
drop policy if exists books_public_read on public.books;
create policy books_owner_read on public.books
  for select using (auth.uid() = owner_id);
alter table public.books drop constraint if exists books_visibility_check;
alter table public.books add constraint books_visibility_check check (visibility = 'private');

drop policy if exists bookfiles_public_read on storage.objects;
