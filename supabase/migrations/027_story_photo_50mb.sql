-- 027: story/status photos up to 50 MB (with headroom).
--
-- Client validation now accepts 50 MB (STORY_PHOTO_MAX + status/discover
-- composers); Supabase Storage enforces bucket file_size_limit server-side,
-- so the stories bucket must be raised from 3 MB (022) or every upload over
-- 3 MB fails regardless of client checks. 64 MB headroom mirrors how the
-- books bucket was sized for a 50 MB cap in 022.

update storage.buckets
set file_size_limit = 64 * 1024 * 1024
where id = 'studyflow-stories';
