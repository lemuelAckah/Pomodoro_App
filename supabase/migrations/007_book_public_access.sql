-- StudyFlow book library: let anyone read/cover-load books shared as public.
-- Private books remain owner-only (existing bookfiles_owner_* policies).

drop policy if exists bookfiles_public_read on storage.objects;
create policy bookfiles_public_read on storage.objects
  for select using (
    bucket_id = 'studyflow-books'
    and exists (
      select 1 from public.books
      where books.visibility = 'public'
        and (books.file_path = storage.objects.name or books.cover_path = storage.objects.name)
    )
  );
