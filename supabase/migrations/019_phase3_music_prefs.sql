-- StudyFlow Phase 3 follow-up: persist music preferences (ambient mix + master
-- volume) in user_settings so they follow the account.
--
-- Additive and idempotent: one nullable-jsonb column with a default. No RLS
-- change needed (existing settings_self_all covers the whole row). Free-plan
-- safe: plain column, no extensions, no functions.
alter table public.user_settings
  add column if not exists music jsonb not null default '{}'::jsonb;
