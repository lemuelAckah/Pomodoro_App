-- StudyFlow production schema.
-- Run with Supabase SQL editor or `supabase db push`.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Study Learner',
  handle text not null unique default 'study_learner',
  bio text not null default '',
  avatar text not null default 'SL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  sessions integer not null default 0 check (sessions >= 0),
  focus_seconds bigint not null default 0 check (focus_seconds >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  done boolean not null default false,
  pomodoros integer not null default 0 check (pomodoros >= 0),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('technique', 'sound', 'theme', 'group', 'store_item')),
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.groups (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  logo text not null default '📚',
  focus_topics text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_memberships (
  group_id text not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id text references public.groups(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  kind text not null default 'text' check (kind in ('text', 'file', 'photo', 'poll')),
  attachment_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((group_id is not null) or (recipient_id is not null))
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  text text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.rewards (
  id text primary key,
  name text not null,
  category text not null,
  emoji text not null default '🎁',
  price integer not null check (price >= 0),
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete set null,
  reward_id text not null references public.rewards(id),
  price integer not null check (price >= 0),
  status text not null default 'completed' check (status in ('completed', 'refunded')),
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  group_id text references public.groups(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reasons text[] not null default '{}',
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_updated_idx on public.tasks(user_id, updated_at desc);
create index if not exists messages_group_created_idx on public.messages(group_id, created_at desc);
create index if not exists messages_recipient_created_idx on public.messages(recipient_id, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists purchases_buyer_created_idx on public.purchases(buyer_id, created_at desc);

-- Keep profile/progress rows available whenever a new account is created.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, handle)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'Study Learner'), coalesce(new.raw_user_meta_data ->> 'handle', 'study_' || left(replace(new.id::text, '-', ''), 8)))
  on conflict (id) do nothing;
  insert into public.user_progress (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Generic updated_at helper.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute procedure public.touch_updated_at();
drop trigger if exists progress_touch_updated_at on public.user_progress;
create trigger progress_touch_updated_at before update on public.user_progress for each row execute procedure public.touch_updated_at();
drop trigger if exists state_touch_updated_at on public.user_state;
create trigger state_touch_updated_at before update on public.user_state for each row execute procedure public.touch_updated_at();
drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at before update on public.tasks for each row execute procedure public.touch_updated_at();

-- RLS: every private row is scoped to the signed-in user. Group rows are visible to members.
alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.user_state enable row level security;
alter table public.tasks enable row level security;
alter table public.favorites enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.rewards enable row level security;
alter table public.purchases enable row level security;
alter table public.reports enable row level security;

create policy profiles_self_all on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy progress_self_all on public.user_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy state_self_all on public.user_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_self_all on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy favorites_self_all on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy memberships_self_read on public.group_memberships for select using (auth.uid() = user_id or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy memberships_self_write on public.group_memberships for insert with check (auth.uid() = user_id or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy memberships_owner_update on public.group_memberships for update using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy memberships_owner_delete on public.group_memberships for delete using (auth.uid() = user_id or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy groups_member_read on public.groups for select using (visibility = 'public' or owner_id = auth.uid() or exists (select 1 from public.group_memberships m where m.group_id = id and m.user_id = auth.uid()));
create policy groups_owner_write on public.groups for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy friendships_self_all on public.friendships for all using (auth.uid() = user_id or auth.uid() = friend_id) with check (auth.uid() = user_id);
create policy messages_member_read on public.messages for select using (sender_id = auth.uid() or recipient_id = auth.uid() or exists (select 1 from public.group_memberships m where m.group_id = group_id and m.user_id = auth.uid()));
create policy messages_sender_insert on public.messages for insert with check (sender_id = auth.uid() and (exists (select 1 from public.group_memberships m where m.group_id = group_id and m.user_id = auth.uid()) or exists (select 1 from public.friendships f where f.user_id = auth.uid() and f.friend_id = recipient_id and f.status = 'accepted')));
create policy messages_sender_update on public.messages for update using (sender_id = auth.uid()) with check (sender_id = auth.uid());
create policy messages_sender_delete on public.messages for delete using (sender_id = auth.uid());
create policy notifications_self_all on public.notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy rewards_public_read on public.rewards for select using (active = true);
create policy purchases_buyer_read on public.purchases for select using (auth.uid() = buyer_id or auth.uid() = recipient_id);
create policy reports_reporter_insert on public.reports for insert with check (auth.uid() = reporter_id);
create policy reports_reporter_read on public.reports for select using (auth.uid() = reporter_id);

-- Storage bucket for songs and message attachments.
insert into storage.buckets (id, name, public) values ('studyflow-files', 'studyflow-files', false) on conflict (id) do nothing;
create policy storage_own_files_read on storage.objects for select using (bucket_id = 'studyflow-files' and auth.uid()::text = (storage.foldername(name))[1]);
create policy storage_own_files_insert on storage.objects for insert with check (bucket_id = 'studyflow-files' and auth.uid()::text = (storage.foldername(name))[1]);
create policy storage_own_files_update on storage.objects for update using (bucket_id = 'studyflow-files' and auth.uid()::text = (storage.foldername(name))[1]);
create policy storage_own_files_delete on storage.objects for delete using (bucket_id = 'studyflow-files' and auth.uid()::text = (storage.foldername(name))[1]);

-- Enable database change delivery for realtime UI updates.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.user_state;
