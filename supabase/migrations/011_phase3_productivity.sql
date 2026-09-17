-- StudyFlow Phase 3 (core productivity): notes, study-technique data, task sync.
--
-- Builds on migrations 001–010. The tasks table already exists (001) with
-- self-only RLS — this migration only widens it to carry the app's existing
-- offline fields (client-side id already IS the primary key, so offline
-- creates sync back with zero remapping and no duplicates).
--
-- Free plan friendly: plain tables, btree indexes, no edge functions, no
-- new realtime publications (tasks/notes load per-user on login; the UI
-- already reflects its own writes locally).

-- ---------------------------------------------------------------------------
-- 1. tasks — carry the full client shape (desc, client timestamps)
-- ---------------------------------------------------------------------------
-- Existing shape (001): id text, user_id uuid, text, done, pomodoros, due_at,
-- created_at, updated_at, PK (user_id, id). Add what the app stores locally
-- so nothing is lost when cloud-backed sync is enabled.
alter table public.tasks add column if not exists "desc" text not null default '';
alter table public.tasks add column if not exists client_created_at timestamptz;
alter table public.tasks add column if not exists client_updated_at timestamptz;

-- One row per (user, task id): upsert target for dedupe-safe sync.
-- The PK already covers this; add an index that serves the app's common
-- read (all of my tasks, newest activity first).
create index if not exists tasks_user_activity_idx
  on public.tasks (user_id, client_updated_at desc nulls last, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. user_notes — Cornell pad + Feynman pad + mind maps in one table
-- ---------------------------------------------------------------------------
-- The app stores three note-like structures client-side:
--   cornellNotes: { id, title, cues, notes, summary, created, updated }
--   feynmanNotes: { id, topic, text, checks, created, updated }
--   mindmaps:     { id, title, nodes, created, updated }
-- One jsonb payload column keeps every existing field lossless while
-- giving real rows for RLS, indexing and search. kind routes the payload.
create table if not exists public.user_notes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('cornell', 'feynman', 'mindmap')),
  title text not null default '' check (char_length(title) <= 300),
  payload jsonb not null default '{}'::jsonb,
  client_created_at timestamptz,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists user_notes_user_kind_idx
  on public.user_notes (user_id, kind, client_updated_at desc nulls last);

-- Server-side text search over the note body without loading every row's
-- payload into the client. (expression index; trigram not needed at this scale)
create index if not exists user_notes_title_idx
  on public.user_notes (user_id, lower(title));

drop trigger if exists user_notes_touch_updated_at on public.user_notes;
create trigger user_notes_touch_updated_at
  before update on public.user_notes
  for each row execute procedure public.touch_updated_at();

alter table public.user_notes enable row level security;

drop policy if exists user_notes_self_all on public.user_notes;

create policy user_notes_self_all on public.user_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. technique_assessments — the suitability quiz result (one per user)
-- ---------------------------------------------------------------------------
-- Client shape (state.techCheck): { done, skipped, answers[], scores{},
-- top[], signals{}, date }. One row per user; retaking upserts.
create table if not exists public.technique_assessments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  done boolean not null default false,
  skipped boolean not null default false,
  answers jsonb not null default '[]'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  top jsonb not null default '[]'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists technique_assessments_touch_updated_at on public.technique_assessments;
create trigger technique_assessments_touch_updated_at
  before update on public.technique_assessments
  for each row execute procedure public.touch_updated_at();

alter table public.technique_assessments enable row level security;

drop policy if exists technique_assessments_self_all on public.technique_assessments;

create policy technique_assessments_self_all on public.technique_assessments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. technique_usage — per-technique counters that follow the account
-- ---------------------------------------------------------------------------
-- Client shape: state.techUses { [id]: count }, state.techTime { [id]: minutes }.
create table if not exists public.technique_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  technique_id text not null check (char_length(technique_id) between 1 and 64),
  uses integer not null default 0 check (uses >= 0),
  focus_minutes integer not null default 0 check (focus_minutes >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, technique_id)
);

create index if not exists technique_usage_user_idx
  on public.technique_usage (user_id);

drop trigger if exists technique_usage_touch_updated_at on public.technique_usage;
create trigger technique_usage_touch_updated_at
  before update on public.technique_usage
  for each row execute procedure public.touch_updated_at();

alter table public.technique_usage enable row level security;

drop policy if exists technique_usage_self_all on public.technique_usage;

create policy technique_usage_self_all on public.technique_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- ---------------------------------------------------------------------------
-- 5. sync bookkeeping — per-user watermark so the sync layer can push/pull
--    cheaply and the UI can show "saving / saved" states honestly.
-- ---------------------------------------------------------------------------
alter table public.user_state add column if not exists productivity_synced_at timestamptz;
