-- Profile privacy and authentication metadata.

alter table public.profiles add column if not exists profile_visibility text not null default 'friends' check (profile_visibility in ('private', 'friends', 'public'));
alter table public.profiles add column if not exists activity_visibility text not null default 'friends' check (activity_visibility in ('private', 'friends', 'public'));
alter table public.profiles add column if not exists searchable boolean not null default true;

-- Users can update their own privacy fields through the existing profiles_self_all policy.
