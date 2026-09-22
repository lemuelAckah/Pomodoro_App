-- StudyFlow Phase 7 follow-up: message reaction persistence.
--
-- Reactions were local-only (bubble state never left the device). This adds
-- one narrow table keyed by (message, user, emoji) plus a toggle RPC that
-- re-checks message visibility server-side, so a client can never react to
-- (or read reactions on) a conversation it cannot see. No realtime
-- additions: reactions reload with conversation history; message text
-- realtime is untouched. Existing RLS model preserved.
--
-- Free-plan safe: one table, two indexes, RLS, one plpgsql function.

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('heart', 'thumbsUp', 'laugh', 'wow', 'cry', 'clap')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

-- Writes are strictly own-row. Reads mirror message visibility exactly, so
-- counts on visible messages load but blocked/private threads stay hidden.
drop policy if exists message_reactions_insert_own on public.message_reactions;
create policy message_reactions_insert_own on public.message_reactions
  for insert with check (user_id = auth.uid());

drop policy if exists message_reactions_delete_own on public.message_reactions;
create policy message_reactions_delete_own on public.message_reactions
  for delete using (user_id = auth.uid());

drop policy if exists message_reactions_visible_read on public.message_reactions;
create policy message_reactions_visible_read on public.message_reactions
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.messages m
      where m.id = message_id and m.deleted_at is null
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid()
          or exists (select 1 from public.group_memberships g
            where g.group_id = m.group_id and g.user_id = auth.uid()))
    )
  );

-- Toggle a reaction: verifies the caller can actually see the message first
-- (never trust the row id alone), then inserts or deletes idempotently.
create or replace function public.sf_react_toggle(p_message_id uuid, p_emoji text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_can boolean;
  v_on boolean := false;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_emoji not in ('heart', 'thumbsUp', 'laugh', 'wow', 'cry', 'clap') then
    raise exception 'INVALID_EMOJI';
  end if;
  select exists (
    select 1 from public.messages m
    where m.id = p_message_id and m.deleted_at is null
      and (m.sender_id = v_uid or m.recipient_id = v_uid
        or exists (select 1 from public.group_memberships g
          where g.group_id = m.group_id and g.user_id = v_uid))
  ) into v_can;
  if not v_can then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.message_reactions
      where message_id = p_message_id and user_id = v_uid and emoji = p_emoji) then
    delete from public.message_reactions
    where message_id = p_message_id and user_id = v_uid and emoji = p_emoji;
  else
    insert into public.message_reactions (message_id, user_id, emoji)
    values (p_message_id, v_uid, p_emoji)
    on conflict do nothing;
    v_on := true;
  end if;
  return jsonb_build_object('reacted', v_on);
end;
$$;
