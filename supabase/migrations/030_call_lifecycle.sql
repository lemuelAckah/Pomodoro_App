-- 030: full call lifecycle (voice/video) + structured call events.
--
-- Status model used by the client:
--   ringing → connecting → connected → ended
--   ringing → missed | declined | cancelled | failed
-- Adds declined/cancelled to the original check constraint, records
-- call_type (video | voice), and stores one row per lifecycle event so
-- chat call-log bubbles and notifications can dedupe by call_id+event.

alter table public.call_history
  drop constraint if exists call_history_status_check;

alter table public.call_history
  add constraint call_history_status_check
  check (status in ('ringing', 'connecting', 'connected', 'ended', 'failed', 'missed', 'declined', 'cancelled'));

alter table public.call_history
  add column if not exists call_type text not null default 'video'
  check (call_type in ('video', 'voice'));

alter table public.call_participants
  drop constraint if exists call_participants_status_check;

alter table public.call_participants
  add constraint call_participants_status_check
  check (status in ('invited', 'ringing', 'connected', 'left', 'declined', 'missed'));

create table if not exists public.call_events (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.call_history(id) on delete cascade,
  chat_id text,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null check (event in ('ringing', 'accepted', 'declined', 'missed', 'cancelled', 'connected', 'ended', 'failed')),
  title text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists call_events_call_idx on public.call_events(call_id, created_at desc);
create index if not exists call_events_chat_idx on public.call_events(chat_id, created_at desc);
create index if not exists call_events_dedupe_idx on public.call_events(call_id, event, actor_id);

alter table public.call_events enable row level security;

drop policy if exists call_events_participant_read on public.call_events;
create policy call_events_participant_read on public.call_events
  for select
  using (
    auth.uid() = actor_id
    or exists (
      select 1 from public.call_history c
      where c.id = call_id
        and (
          c.initiator_id = auth.uid()
          or c.recipient_id = auth.uid()
          or exists (
            select 1 from public.call_participants p
            where p.call_id = c.id and p.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists call_events_participant_insert on public.call_events;
create policy call_events_participant_insert on public.call_events
  for insert
  with check (
    auth.uid() = actor_id
    and exists (
      select 1 from public.call_history c
      where c.id = call_id
        and (
          c.initiator_id = auth.uid()
          or c.recipient_id = auth.uid()
          or exists (
            select 1 from public.call_participants p
            where p.call_id = c.id and p.user_id = auth.uid()
          )
        )
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.call_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
