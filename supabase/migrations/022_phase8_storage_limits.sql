-- StudyFlow Phase 8 hardening: server-enforced upload caps + message size bound.
--
-- Client-side checks (2–3 MB avatars/stories, 3–5 MB chat media, 50 MB books)
-- are bypassable by design, and nothing capped uploads server-side — an
-- authenticated client could previously push arbitrarily large objects into
-- free-plan storage. These bucket limits are enforced by Supabase Storage
-- itself on every upload, with headroom above every legitimate client cap:
--   studyflow-files   8 MB  (3 MB chat files + 5 MB voice notes)
--   studyflow-avatars 3 MB  (2 MB avatar cap)
--   studyflow-stories 3 MB  (2 MB story cap)
--   studyflow-books   64 MB (50 MB books + 8 MB covers)
-- studyflow-docs is untouched (no uploader references it in the app).
-- messages.text gets a generous server-side bound (client caps at 4000).
--
-- Additive and idempotent. No RLS, policy, or behavior changes.
update storage.buckets set file_size_limit = 8 * 1024 * 1024
where id = 'studyflow-files';

update storage.buckets set file_size_limit = 3 * 1024 * 1024
where id = 'studyflow-avatars';

update storage.buckets set file_size_limit = 3 * 1024 * 1024
where id = 'studyflow-stories';

update storage.buckets set file_size_limit = 64 * 1024 * 1024
where id = 'studyflow-books';

alter table public.messages drop constraint if exists messages_text_len;
alter table public.messages add constraint messages_text_len
  check (char_length(text) <= 10000);
