-- StudyFlow Phase 6 checks (Reading Studio data) — read-only.
-- Run in the Supabase SQL editor AFTER applying migration 015_phase6_books.sql.
-- Fails loudly (EXCEPTION) on the first problem, prints PASS lines otherwise.
-- Complements (does not modify) earlier phase check files.

do $$
declare
  v_count integer;
begin
  -- 1. book_notes table with RLS --------------------------------------------------
  select count(*) into v_count from pg_tables
  where schemaname = 'public' and tablename = 'book_notes' and rowsecurity;
  if v_count <> 1 then
    raise exception 'FAIL book_notes missing or RLS disabled (apply 015_phase6_books.sql)';
  end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'book_notes'
    and policyname = 'book_notes_self_all';
  if v_count <> 1 then
    raise exception 'FAIL book_notes is missing the book_notes_self_all policy';
  end if;
  raise notice 'PASS book_notes present with self-only RLS';

  -- 2. expected note columns ---------------------------------------------------------
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'book_notes'
    and column_name in ('id','user_id','book_id','kind','label','locator','body','created_at','updated_at');
  if v_count <> 9 then
    raise exception 'FAIL book_notes is missing columns (found %/9)', v_count;
  end if;
  raise notice 'PASS book_notes columns present';

  -- 3. books.client_updated_at + fingerprint (LWW merge + dupe identity) ---------
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'books'
    and column_name in ('client_updated_at', 'fingerprint');
  if v_count <> 2 then
    raise exception 'FAIL books is missing client_updated_at/fingerprint (apply 015)';
  end if;
  raise notice 'PASS books merge columns present';

  -- 4. book_notes lookup index ----------------------------------------------------------
  select count(*) into v_count from pg_indexes
  where schemaname = 'public' and indexname = 'book_notes_lookup_idx';
  if v_count <> 1 then
    raise exception 'FAIL book_notes_lookup_idx missing';
  end if;
  raise notice 'PASS book_notes index present';

  -- 5. cascade deletion (deleting a book cleans its notes) ------------------------
  select count(*) into v_count from pg_constraint
  where connamespace = 'public'::regnamespace
    and conrelid = 'public.book_notes'::regclass
    and contype = 'f'
    and confdeltype = 'c';
  if v_count < 2 then
    raise exception 'FAIL book_notes FK cascades missing (found %)', v_count;
  end if;
  raise notice 'PASS book_notes cascade deletes present';

  -- 6. pre-existing book tables still RLS-protected --------------------------------
  select count(*) into v_count from pg_tables
  where schemaname = 'public' and rowsecurity
    and tablename in ('books', 'book_favorites', 'book_progress',
      'book_bookmarks', 'book_highlights');
  if v_count <> 5 then
    raise exception 'FAIL a core book table lost RLS (found %/5)', v_count;
  end if;
  raise notice 'PASS core book tables still RLS-protected';

  raise notice 'PHASE 6 CHECKS COMPLETE';
end $$;
