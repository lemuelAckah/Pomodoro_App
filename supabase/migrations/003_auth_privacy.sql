-- Profile privacy and authentication metadata.

alter table public.profiles add column if not exists profile_visibility text not null default 'friends' check (profile_visibility in ('private', 'friends', 'public'));
alter table public.profiles add column if not exists activity_visibility text not null default 'friends' check (activity_visibility in ('private', 'friends', 'public'));
alter table public.profiles add column if not exists searchable boolean not null default true;

-- Users can update their own privacy fields through the existing profiles_self_all policy.

-- Directory search (searchUsers) must be able to read OTHER users' minimal
-- identity fields. profiles_self_all only permits reading your own row, which
-- made user search silently return zero results in production. This policy
-- exposes only searchable public profiles and nothing else.
create policy profiles_directory_read on public.profiles
  for select
  using (
    auth.uid() is not null
    and id <> auth.uid()
    and searchable = true
  );

-- Privacy settings the app saves via syncProfile() must have columns to land
-- in. The visibility/searchable trio above covers privacy, but profile extras
-- (email, country, phone, university, subjects) were being dropped silently.
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists country text not null default '';
alter table public.profiles add column if not exists phone text not null default '';
alter table public.profiles add column if not exists university text not null default '';
alter table public.profiles add column if not exists subjects jsonb not null default '[]'::jsonb;
