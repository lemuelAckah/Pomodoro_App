-- 031: story/status metadata — captions, text styling, attached music, video.
--
-- Existing columns already cover the basics: kind allows 'video', text is the
-- caption/body (≤500). meta is a single jsonb for optional presentation +
-- music so we never churn the schema for every editor tweak.
--
-- meta shape (all keys optional; {} = legacy row with no extras):
--   captionPos  'bottom' | 'center' | 'top'
--   bgStyle     text-card background preset key (see SV_TEXT_BGS in community.js)
--   textAlign    'left' | 'center' | 'right'
--   textSize     'sm' | 'md' | 'lg'
--   textStyle    'plain' | 'shadow' | 'stroke'
--   emoji       short emoji prefix for text cards
--   music       { id, title, artist, path, start, end, vol }  path is a
--               storage object under studyflow-stories (author-owned folder);
--               start/end are seconds into the track; vol is 0..1
--   videoVol    original video audio volume 0..1 (default 1 when absent)
--
-- No new RLS: stories_self_all + stories_visible_read already govern rows.
-- No bucket change: studyflow-stories already has 64 MB headroom (027).

alter table public.stories
  add column if not exists meta jsonb not null default '{}'::jsonb;

comment on column public.stories.meta is
  'Editor presentation + attached-music metadata (caption position, text style, music clip, video volume).';
