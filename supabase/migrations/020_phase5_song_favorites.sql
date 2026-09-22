-- StudyFlow Phase 5 follow-up: let the generic favorites table hold song ids.
--
-- Additive and idempotent: widens the item_type domain only. Existing rows
-- stay valid; the self-only RLS policy is untouched. Free-plan safe.
alter table public.favorites drop constraint if exists favorites_item_type_check;
alter table public.favorites
  add constraint favorites_item_type_check
  check (item_type in ('technique', 'sound', 'theme', 'group', 'store_item', 'song'));
