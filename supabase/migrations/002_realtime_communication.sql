-- Realtime communication support for StudyFlow.

alter table public.messages add column if not exists delivery_status text not null default 'sent' check (delivery_status in ('sending', 'sent', 'delivered', 'failed'));

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (message_id, user_id)
);

create table if not exists public.call_history (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  initiator_id uuid not null references auth.users(id) on delete cascade,
  group_id text references public.groups(id) on delete set null,
  recipient_id uuid references auth.users(id) on delete set null,
  status text not null default 'ringing' check (status in ('ringing', 'connecting', 'connected', 'ended', 'failed', 'missed')),
  started_at timestamptz not null default now(),
  connected_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.call_participants (
  call_id uuid not null references public.call_history(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'ringing', 'connected', 'left', 'declined')),
  joined_at timestamptz,
  left_at timestamptz,
  primary key (call_id, user_id)
);

create index if not exists receipts_user_read_idx on public.message_receipts(user_id, read_at);
create index if not exists calls_initiator_started_idx on public.call_history(initiator_id, started_at desc);
create index if not exists calls_recipient_started_idx on public.call_history(recipient_id, started_at desc);
create index if not exists call_participants_user_idx on public.call_participants(user_id, joined_at desc);

alter table public.message_receipts enable row level security;
alter table public.call_history enable row level security;
alter table public.call_participants enable row level security;

create policy receipts_self_read on public.message_receipts for select using (auth.uid() = user_id);
create policy receipts_self_write on public.message_receipts for insert with check (auth.uid() = user_id);
create policy receipts_self_update on public.message_receipts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy call_history_participant_read on public.call_history for select using (auth.uid() = initiator_id or auth.uid() = recipient_id or exists (select 1 from public.call_participants p where p.call_id = id and p.user_id = auth.uid()));
create policy call_history_initiator_insert on public.call_history for insert with check (auth.uid() = initiator_id);
create policy call_history_initiator_update on public.call_history for update using (auth.uid() = initiator_id) with check (auth.uid() = initiator_id);
create policy call_participants_self_read on public.call_participants for select using (auth.uid() = user_id or exists (select 1 from public.call_history c where c.id = call_id and c.initiator_id = auth.uid()));
create policy call_participants_initiator_insert on public.call_participants for insert with check (exists (select 1 from public.call_history c where c.id = call_id and c.initiator_id = auth.uid()));
create policy call_participants_self_update on public.call_participants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.message_receipts;
alter publication supabase_realtime add table public.call_history;
alter publication supabase_realtime add table public.call_participants;

-- TURN credentials should be stored in Vite env vars or a server-side token service.
-- The browser must never receive a Supabase service-role key.
