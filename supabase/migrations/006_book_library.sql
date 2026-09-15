-- StudyFlow book library: books, favorites, progress, bookmarks, highlights.
-- Run with Supabase SQL editor or `supabase db push`.

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled' check (char_length(title) between 1 and 300),
  author text not null default '' check (char_length(author) <= 200),
  description text not null default '' check (char_length(description) <= 4000),
  category text not null default 'General' check (char_length(category) <= 120),
  tags text[] not null default '{}',
  isbn text not null default '' check (char_length(isbn) <= 32),
  publisher text not null default '' check (char_length(publisher) <= 200),
  published_year integer check (published_year is null or (published_year between 1000 and 3000)),
  page_count integer check (page_count is null or page_count >= 0),
  word_count integer check (word_count is null or word_count >= 0),
  cover_path text,
  file_path text,
  file_type text not null default '' check (char_length(file_type) <= 120),
  file_size bigint check (file_size is null or file_size >= 0),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  allow_download boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.book_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table if not exists public.book_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  position double precision not null default 0 check (position >= 0 and position <= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table if not exists public.book_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 200),
  locator text not null default '' check (char_length(locator) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.book_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  color text not null default 'yellow' check (color in ('yellow', 'green', 'blue', 'pink', 'purple')),
  excerpt text not null default '' check (char_length(excerpt) between 1 and 2000),
  prefix text not null default '' check (char_length(prefix) <= 500),
  suffix text not null default '' check (char_length(suffix) <= 500),
  note text not null default '' check (char_length(note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_owner_created_idx on public.books(owner_id, created_at desc);
create index if not exists books_public_created_idx on public.books(visibility, created_at desc);
create index if not exists books_category_idx on public.books(category);
create index if not exists book_highlights_lookup_idx on public.book_highlights(user_id, book_id, created_at);

-- RLS: owners fully control their rows; anyone can read public books.
alter table public.books enable row level security;
alter table public.book_favorites enable row level security;
alter table public.book_progress enable row level security;
alter table public.book_bookmarks enable row level security;
alter table public.book_highlights enable row level security;

create policy books_public_read on public.books
  for select using (visibility = 'public' or auth.uid() = owner_id);
create policy books_owner_write on public.books
  for insert with check (auth.uid() = owner_id);
create policy books_owner_update on public.books
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy books_owner_delete on public.books
  for delete using (auth.uid() = owner_id);

create policy book_favorites_self_all on public.book_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy book_progress_self_all on public.book_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy book_bookmarks_self_all on public.book_bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy book_highlights_self_all on public.book_highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private storage bucket for book files and covers.
insert into storage.buckets (id, name, public) values ('studyflow-books', 'studyflow-books', false) on conflict (id) do nothing;
create policy bookfiles_owner_read on storage.objects
  for select using (bucket_id = 'studyflow-books' and auth.uid()::text = (storage.foldername(name))[1]);
create policy bookfiles_owner_insert on storage.objects
  for insert with check (bucket_id = 'studyflow-books' and auth.uid()::text = (storage.foldername(name))[1]);
create policy bookfiles_owner_update on storage.objects
  for update using (bucket_id = 'studyflow-books' and auth.uid()::text = (storage.foldername(name))[1]);
create policy bookfiles_owner_delete on storage.objects
  for delete using (bucket_id = 'studyflow-books' and auth.uid()::text = (storage.foldername(name))[1]);
