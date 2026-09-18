-- StudyFlow Phase 6 (Reading Studio data).
--
-- Additive only: no existing table is altered except for one new nullable
-- column on books. Audio/file binaries stay device-local in IndexedDB;
-- only lightweight metadata and annotations sync.
--
-- Free-plan safe: plain tables, btree indexes, RLS, no extensions, no cron,
-- no Edge Functions, no realtime additions, no Storage buckets.

-- Last-writer-wins merge key for book metadata rows (local-first library).
alter table public.books
  add column if not exists client_updated_at timestamptz;

-- Stable duplicate identity across devices (filename can change).
alter table public.books
  add column if not exists fingerprint text not null default ''
  check (char_length(fingerprint) <= 160);

-- ---------------------------------------------------------------------------
-- book_notes — standalone reader notes (page/location/general), separate from
-- highlight-attached notes which live on book_highlights.note.
-- ---------------------------------------------------------------------------
create table if not exists public.book_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  kind text not null default 'general' check (kind in ('general', 'page', 'bookmark')),
  label text not null default '' check (char_length(label) <= 200),
  locator text not null default '' check (char_length(locator) <= 2000),
  body text not null default '' check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists book_notes_lookup_idx
  on public.book_notes (user_id, book_id, created_at desc);

drop trigger if exists book_notes_touch_updated_at on public.book_notes;
create trigger book_notes_touch_updated_at
  before update on public.book_notes
  for each row execute procedure public.touch_updated_at();

alter table public.book_notes enable row level security;

drop policy if exists book_notes_self_all on public.book_notes;
create policy book_notes_self_all on public.book_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
