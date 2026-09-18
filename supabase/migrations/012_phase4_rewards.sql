-- StudyFlow Phase 4 (secure rewards & progression).
--
-- Builds on migrations 001–011. Reuses the existing `rewards` + `purchases`
-- tables as the authoritative catalog / purchase history (no duplicate
-- tables). Adds a coin ledger, balances, inventory, achievements, streaks and
-- mystery-box openings, all enforced by RLS + SECURITY DEFINER RPCs.
--
-- Trust model: the browser NEVER writes balances, prices or rewards
-- directly. Every valuable mutation goes through an sf_* function that:
--   1. derives the user from auth.uid() (never a client-supplied id),
--   2. reads the authoritative price / odds / reward from the database,
--   3. runs inside one transaction with row locks (FOR UPDATE),
--   4. is idempotent via caller-supplied reference keys.
--
-- Free-plan safe: plain tables, btree/unique indexes, plpgsql functions.
-- No extensions, no cron, no Edge Functions, no realtime additions.

-- ---------------------------------------------------------------------------
-- 1. rewards — widen into the authoritative catalog
-- ---------------------------------------------------------------------------
alter table public.rewards add column if not exists rarity text not null default 'Common'
  check (rarity in ('Common', 'Rare', 'Epic', 'Legendary'));
alter table public.rewards add column if not exists stock integer check (stock is null or stock >= 0);
alter table public.rewards add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Seed the catalog from the shop the app already sells (prices here are the
-- ONLY prices the purchase RPC trusts). Re-runnable: only fills gaps.
insert into public.rewards (id, name, category, emoji, price, description, active, rarity) values
  ('focus-flame','Focus Flame theme','Themes','fire',35,'A warm, energising workspace skin.',true,'Common'),
  ('ocean-mist','Ocean Mist theme','Themes','wave',40,'A calm blue study atmosphere.',true,'Common'),
  ('forest-glow','Forest Glow theme','Themes','tree',40,'A fresh green workspace look.',true,'Common'),
  ('midnight','Midnight theme','Themes','moon',50,'Deep contrast for night sessions.',true,'Common'),
  ('sunrise','Sunrise theme','Themes','sunrise',45,'Bright energy for early starts.',true,'Common'),
  ('lavender','Lavender theme','Themes','heart',45,'Soft colour for gentle focus.',true,'Common'),
  ('cafe','Study Cafe theme','Themes','coffee',55,'A cosy cafe-inspired skin.',true,'Common'),
  ('paper','Paper Notes theme','Themes','doc',60,'A clean notebook aesthetic.',true,'Rare'),
  ('neon','Neon Lab theme','Themes','bolt',75,'Electric colour for power sessions.',true,'Rare'),
  ('solar','Solar Gold theme','Themes','sun',90,'A premium golden workspace.',true,'Rare'),
  ('rain-pack','Rain on Glass','Sounds','rain',25,'Steady rain for deep work.',true,'Common'),
  ('library','Quiet Library','Sounds','book',30,'Soft room tone and turning pages.',true,'Common'),
  ('campfire','Study Campfire','Sounds','fire',30,'Crackling warmth without lyrics.',true,'Common'),
  ('lofi','Lo-fi Focus Pack','Sounds','headphones',45,'A mellow instrumental session.',true,'Common'),
  ('piano','Midnight Piano','Sounds','music',45,'Minimal piano for concentration.',true,'Common'),
  ('forest-pack','Forest Ambience','Sounds','leaf',25,'Wind and distant birds.',true,'Common'),
  ('brown-pack','Brown Noise','Sounds','noise',20,'Low, even concentration noise.',true,'Common'),
  ('ocean-pack','Ocean Waves','Sounds','wave',25,'Slow waves for relaxed study.',true,'Common'),
  ('space','Deep Space','Sounds','planet',35,'A spacious ambient soundscape.',true,'Common'),
  ('thunder','Distant Thunder','Sounds','storm',30,'Rainy-day focus atmosphere.',true,'Common'),
  ('shield','Streak Shield','Boosts','shield',80,'Protect one missed study day.',true,'Rare'),
  ('multiplier','Coin Multiplier','Boosts','sparkle',120,'Earn 25% more coins for one day.',true,'Epic'),
  ('extra-break','Extra Break','Boosts','coffee',35,'Unlock one restorative break.',true,'Common'),
  ('sprint','Focus Sprint','Boosts','run',60,'Add a bonus ten-minute sprint.',true,'Rare'),
  ('double','Double Dip','Boosts','target',150,'Double one session reward.',true,'Epic'),
  ('quick','Quick Start Pass','Boosts','rocket',50,'Skip one setup step.',true,'Common'),
  ('calm','Calm Mode','Boosts','lotus',70,'Hide distractions for one session.',true,'Rare'),
  ('exam','Exam Week Pack','Boosts','bookOpen',180,'A bundle of three study boosts.',true,'Epic'),
  ('priority','Priority Queue','Boosts','trophy',100,'Pin your most important task.',true,'Rare'),
  ('lucky','Lucky Hour','Boosts','leaf',90,'A one-hour bonus earning window.',true,'Rare'),
  ('legend','Focus Legend badge','Badges','medal',100,'Show your consistency proudly.',true,'Rare'),
  ('owl-badge','Night Owl badge','Badges','owl',80,'For late-night learning sessions.',true,'Rare'),
  ('bird-badge','Early Bird badge','Badges','bird',80,'For morning study champions.',true,'Rare'),
  ('bookworm','Bookworm badge','Badges','bug',120,'A badge for curious minds.',true,'Epic'),
  ('seven','Seven Day badge','Badges','seven',140,'Celebrate a full week streak.',true,'Epic'),
  ('deep','Deep Work badge','Badges','brain',160,'For serious uninterrupted focus.',true,'Epic'),
  ('team','Team Player badge','Badges','users',100,'Celebrate learning with friends.',true,'Rare'),
  ('first','First Place badge','Badges','medal',220,'A rare achievement badge.',true,'Legendary'),
  ('spark','Spark badge','Badges','sparkle',60,'A bright profile detail.',true,'Rare'),
  ('creator','Creator badge','Badges','palette',130,'For people who share knowledge.',true,'Epic'),
  ('fox','Clever Fox avatar','Avatars','fox',75,'A sharp profile companion.',true,'Rare'),
  ('cat','Study Cat avatar','Avatars','cat',75,'A cosy study companion.',true,'Rare'),
  ('owl','Wise Owl avatar','Avatars','owl',100,'A thoughtful profile identity.',true,'Rare'),
  ('rocket','Rocket avatar','Avatars','rocket',110,'Launch your next study goal.',true,'Rare'),
  ('planet','Planet avatar','Avatars','planet',110,'Explore your learning orbit.',true,'Rare'),
  ('bolt','Lightning avatar','Avatars','bolt',95,'Fast, bright, and focused.',true,'Rare'),
  ('lotus','Lotus avatar','Avatars','lotus',90,'A calm profile identity.',true,'Rare'),
  ('crown','Scholar Crown avatar','Avatars','crown',250,'The ultimate scholar look.',true,'Legendary'),
  ('mountain','Mountain avatar','Avatars','mountain',130,'Climb every learning challenge.',true,'Epic'),
  ('star','North Star avatar','Avatars','star',150,'Keep your goals in sight.',true,'Epic'),
  ('pumpkin','Spooky Pumpkin avatar','Avatars','pumpkin',100,'A limited Halloween companion.',true,'Rare'),
  ('ghost','Haunted badge','Badges','ghost',120,'A limited Halloween spirit.',true,'Epic'),
  ('fireworks','New Year badge','Badges','party',120,'Limited New Year sparkle.',true,'Epic'),
  ('survivor','Exam Survivor badge','Badges','medal',150,'Limited exam-season honor.',true,'Epic')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. purchases — harden into the real purchase history
-- ---------------------------------------------------------------------------
alter table public.purchases add column if not exists unit_price integer check (unit_price is null or unit_price >= 0);
alter table public.purchases add column if not exists total integer check (total is null or total >= 0);
alter table public.purchases add column if not exists idempotency_key text;

-- Backfill rows written by earlier app versions (price was the line total).
update public.purchases
set unit_price = price,
    total = price * greatest(qty, 1)
where unit_price is null;

alter table public.purchases alter column unit_price set not null;
alter table public.purchases alter column total set not null;

-- One idempotency key = one purchase, per buyer. NULL keys stay unscoped.
create unique index if not exists purchases_buyer_idem_uniq
  on public.purchases (buyer_id, idempotency_key)
  where idempotency_key is not null;

-- The old buyer-insert policy let the browser set its own price — purchases
-- now happen ONLY inside sf_purchase / sf_gift (SECURITY DEFINER), so the
-- direct-insert path is removed. Reads stay buyer-or-recipient.
drop policy if exists purchases_buyer_insert on public.purchases;

-- ---------------------------------------------------------------------------
-- 3. user_balances — fast authoritative read of the ledger head
-- ---------------------------------------------------------------------------
create table if not exists public.user_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_balances_touch_updated_at on public.user_balances;
create trigger user_balances_touch_updated_at
  before update on public.user_balances
  for each row execute procedure public.touch_updated_at();

alter table public.user_balances enable row level security;
drop policy if exists user_balances_self_read on public.user_balances;
create policy user_balances_self_read on public.user_balances
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only the sf_* RPCs (definer) write here.

-- ---------------------------------------------------------------------------
-- 4. coin_transactions — the append-only ledger (earn +, spend −)
-- ---------------------------------------------------------------------------
create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('earn', 'spend')),
  amount integer not null check (amount <> 0),
  reason text not null check (char_length(reason) between 1 and 120),
  ref_key text not null check (char_length(ref_key) between 1 and 128),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((type = 'earn' and amount > 0) or (type = 'spend' and amount < 0)),
  unique (user_id, ref_key)
);

create index if not exists coin_transactions_user_created_idx
  on public.coin_transactions (user_id, created_at desc);

alter table public.coin_transactions enable row level security;
drop policy if exists coin_transactions_self_read on public.coin_transactions;
create policy coin_transactions_self_read on public.coin_transactions
  for select using (auth.uid() = user_id);
-- Append-only via RPC: no client insert/update/delete policies.

-- ---------------------------------------------------------------------------
-- 5. user_inventory — persistent owned rewards
-- ---------------------------------------------------------------------------
create table if not exists public.user_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_id text not null references public.rewards(id),
  qty integer not null default 1 check (qty >= 0),
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, reward_id)
);

create index if not exists user_inventory_user_idx
  on public.user_inventory (user_id);

drop trigger if exists user_inventory_touch_updated_at on public.user_inventory;
create trigger user_inventory_touch_updated_at
  before update on public.user_inventory
  for each row execute procedure public.touch_updated_at();

alter table public.user_inventory enable row level security;
drop policy if exists user_inventory_self_read on public.user_inventory;
create policy user_inventory_self_read on public.user_inventory
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. achievements — centrally controlled definitions + unlocks
-- ---------------------------------------------------------------------------
create table if not exists public.achievement_defs (
  id text primary key,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  icon text not null default 'medal',
  requirement jsonb not null default '{}'::jsonb,
  reward_coins integer not null default 0 check (reward_coins >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.achievement_defs (id, name, description, icon, requirement, reward_coins, active) values
  ('first','First Session','Finish your very first focus session.','sprout','{"metric":"sessions","need":1}',20,true),
  ('ten','Ten Stack','Complete 10 focus sessions.','star','{"metric":"sessions","need":10}',50,true),
  ('fifty','Fifty Strong','Complete 50 focus sessions.','strong','{"metric":"sessions","need":50}',150,true),
  ('hundred','Century Club','Complete 100 focus sessions.','medal','{"metric":"sessions","need":100}',400,true),
  ('streak7','Week Warrior','Grow a 7-day focus streak.','fire','{"metric":"streak","need":7}',80,true),
  ('streak30','Unstoppable','Grow a 30-day focus streak.','bolt','{"metric":"streak","need":30}',300,true),
  ('hours10','10 Hours Deep','Accumulate 10 hours of total focus.','timer','{"metric":"focus_minutes","need":600}',60,true),
  ('hours50','50 Hours Deep','Accumulate 50 hours of total focus.','mountain','{"metric":"focus_minutes","need":3000}',200,true),
  ('hours100','Century Hours','Accumulate 100 hours of total focus.','crown','{"metric":"focus_minutes","need":6000}',500,true),
  ('marathon','Marathon Day','Focus 120+ minutes in a single day.','run','{"metric":"best_day_minutes","need":120}',40,true)
on conflict (id) do nothing;

alter table public.achievement_defs enable row level security;
drop policy if exists achievement_defs_public_read on public.achievement_defs;
create policy achievement_defs_public_read on public.achievement_defs
  for select using (active = true);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievement_defs(id),
  unlocked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;
drop policy if exists user_achievements_self_read on public.user_achievements;
create policy user_achievements_self_read on public.user_achievements
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 7. streaks — server-side daily streak state (UTC date boundaries)
-- ---------------------------------------------------------------------------
create table if not exists public.streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_activity_date date,
  updated_at timestamptz not null default now()
);

drop trigger if exists streaks_touch_updated_at on public.streaks;
create trigger streaks_touch_updated_at
  before update on public.streaks
  for each row execute procedure public.touch_updated_at();

alter table public.streaks enable row level security;
drop policy if exists streaks_self_read on public.streaks;
create policy streaks_self_read on public.streaks
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 8. mystery_box_openings — every roll, stored once, never rerolled
-- ---------------------------------------------------------------------------
create table if not exists public.mystery_box_openings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  box_type text not null check (box_type in ('free-common','common','rare','epic','legendary')),
  rarity text not null check (rarity in ('Common','Rare','Epic','Legendary')),
  reward_kind text not null check (reward_kind in ('coins','item')),
  reward_id text references public.rewards(id),
  reward_amount integer not null default 0 check (reward_amount >= 0),
  ref_key text not null check (char_length(ref_key) between 1 and 128),
  opened_at timestamptz not null default now(),
  unique (user_id, ref_key)
);

create index if not exists mystery_box_openings_user_opened_idx
  on public.mystery_box_openings (user_id, opened_at desc);

alter table public.mystery_box_openings enable row level security;
drop policy if exists mystery_box_openings_self_read on public.mystery_box_openings;
create policy mystery_box_openings_self_read on public.mystery_box_openings
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 9. secure RPCs (trusted source of truth — auth.uid() is the user)
-- ---------------------------------------------------------------------------

-- Read (or lazily create) my authoritative balance.
create or replace function public.sf_balance()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bal integer;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  insert into public.user_balances (user_id, balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  select balance into v_bal from public.user_balances where user_id = v_uid;
  return coalesce(v_bal, 0);
end;
$$;

-- Award coins for a legitimate event. Idempotent on (user, ref_key).
create or replace function public.sf_award_coins(p_amount integer, p_reason text, p_ref_key text, p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tx_id uuid;
  v_bal integer;
  v_today_total integer;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 500 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_reason is null or char_length(p_reason) < 1 or char_length(p_reason) > 120 then
    raise exception 'INVALID_REASON';
  end if;
  if p_ref_key is null or char_length(p_ref_key) < 1 or char_length(p_ref_key) > 128 then
    raise exception 'INVALID_REF';
  end if;
  -- Daily earn ceiling: legitimate play (sessions, tasks, check-ins,
  -- milestones) stays far below this; minted replay floods do not.
  select coalesce(sum(amount), 0) into v_today_total
  from public.coin_transactions
  where user_id = v_uid and type = 'earn' and created_at::date = CURRENT_DATE;
  if v_today_total + p_amount > 2000 then
    raise exception 'DAILY_CAP';
  end if;
  insert into public.user_balances (user_id, balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  insert into public.coin_transactions (user_id, type, amount, reason, ref_key, metadata)
  values (v_uid, 'earn', p_amount, p_reason, p_ref_key, coalesce(p_metadata, '{}'::jsonb))
  on conflict (user_id, ref_key) do nothing
  returning id into v_tx_id;
  if v_tx_id is null then
    select balance into v_bal from public.user_balances where user_id = v_uid;
    return jsonb_build_object('balance', coalesce(v_bal, 0), 'duplicate', true, 'awarded', 0);
  end if;
  update public.user_balances set balance = balance + p_amount where user_id = v_uid
  returning balance into v_bal;
  -- Best-effort legacy mirror (user_progress.coins is a display value only;
  -- user_balances + coin_transactions are authoritative).
  update public.user_progress set coins = v_bal where user_id = v_uid;
  return jsonb_build_object('balance', v_bal, 'duplicate', false, 'awarded', p_amount);
end;
$$;

-- Atomic purchase at the AUTHORITATIVE catalog price. Idempotent on
-- (buyer, idempotency_key). Locks the catalog row + balance row.
create or replace function public.sf_purchase(p_reward_id text, p_qty integer, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_price integer;
  v_active boolean;
  v_stock integer;
  v_total integer;
  v_bal integer;
  v_existing purchases%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'INVALID_QTY';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 1 or char_length(p_idempotency_key) > 128 then
    raise exception 'INVALID_REF';
  end if;
  select price, active, stock into v_price, v_active, v_stock
  from public.rewards where id = p_reward_id for update;
  if not found then
    raise exception 'INVALID_REWARD';
  end if;
  if not v_active then
    raise exception 'REWARD_UNAVAILABLE';
  end if;
  if v_stock is not null and v_stock < p_qty then
    raise exception 'OUT_OF_STOCK';
  end if;
  v_total := v_price * p_qty;
  -- Idempotency first: a retried request returns the original purchase.
  select * into v_existing from public.purchases
  where buyer_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    select balance into v_bal from public.user_balances where user_id = v_uid;
    return jsonb_build_object('purchase_id', v_existing.id, 'total', v_existing.total,
      'balance', coalesce(v_bal, 0), 'duplicate', true);
  end if;
  insert into public.user_balances (user_id, balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  select balance into v_bal from public.user_balances where user_id = v_uid for update;
  if coalesce(v_bal, 0) < v_total then
    raise exception 'INSUFFICIENT_COINS';
  end if;
  update public.user_balances set balance = balance - v_total where user_id = v_uid
  returning balance into v_bal;
  insert into public.coin_transactions (user_id, type, amount, reason, ref_key, metadata)
  values (v_uid, 'spend', -v_total, 'Reward purchase', 'purchase:' || p_idempotency_key,
    jsonb_build_object('reward_id', p_reward_id, 'qty', p_qty));
  if v_stock is not null then
    update public.rewards set stock = stock - p_qty where id = p_reward_id;
  end if;
  insert into public.purchases (buyer_id, recipient_id, reward_id, price, unit_price, total, qty, idempotency_key, status)
  values (v_uid, null, p_reward_id, v_price, v_price, v_total, p_qty, p_idempotency_key, 'completed')
  returning * into v_existing;
  insert into public.user_inventory (user_id, reward_id, qty)
  values (v_uid, p_reward_id, p_qty)
  on conflict (user_id, reward_id) do update set qty = public.user_inventory.qty + excluded.qty;
  update public.user_progress set coins = v_bal where user_id = v_uid;
  return jsonb_build_object('purchase_id', v_existing.id, 'total', v_total,
    'balance', v_bal, 'duplicate', false);
end;
$$;

-- Gift at the authoritative price: sender pays, recipient owns the item.
create or replace function public.sf_gift(p_reward_id text, p_qty integer, p_recipient_id uuid, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_price integer;
  v_active boolean;
  v_stock integer;
  v_total integer;
  v_bal integer;
  v_existing purchases%rowtype;
  v_recipient_exists boolean;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_recipient_id is null or p_recipient_id = v_uid then
    raise exception 'INVALID_RECIPIENT';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'INVALID_QTY';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 1 or char_length(p_idempotency_key) > 128 then
    raise exception 'INVALID_REF';
  end if;
  select exists (select 1 from public.profiles where id = p_recipient_id) into v_recipient_exists;
  if not v_recipient_exists then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;
  select price, active, stock into v_price, v_active, v_stock
  from public.rewards where id = p_reward_id for update;
  if not found then
    raise exception 'INVALID_REWARD';
  end if;
  if not v_active then
    raise exception 'REWARD_UNAVAILABLE';
  end if;
  if v_stock is not null and v_stock < p_qty then
    raise exception 'OUT_OF_STOCK';
  end if;
  v_total := v_price * p_qty;
  select * into v_existing from public.purchases
  where buyer_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    select balance into v_bal from public.user_balances where user_id = v_uid;
    return jsonb_build_object('purchase_id', v_existing.id, 'total', v_existing.total,
      'balance', coalesce(v_bal, 0), 'duplicate', true);
  end if;
  insert into public.user_balances (user_id, balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  select balance into v_bal from public.user_balances where user_id = v_uid for update;
  if coalesce(v_bal, 0) < v_total then
    raise exception 'INSUFFICIENT_COINS';
  end if;
  update public.user_balances set balance = balance - v_total where user_id = v_uid
  returning balance into v_bal;
  insert into public.coin_transactions (user_id, type, amount, reason, ref_key, metadata)
  values (v_uid, 'spend', -v_total, 'Gift sent', 'gift:' || p_idempotency_key,
    jsonb_build_object('reward_id', p_reward_id, 'qty', p_qty, 'recipient_id', p_recipient_id));
  if v_stock is not null then
    update public.rewards set stock = stock - p_qty where id = p_reward_id;
  end if;
  insert into public.purchases (buyer_id, recipient_id, reward_id, price, unit_price, total, qty, idempotency_key, status)
  values (v_uid, p_recipient_id, p_reward_id, v_price, v_price, v_total, p_qty, p_idempotency_key, 'completed')
  returning * into v_existing;
  insert into public.user_inventory (user_id, reward_id, qty)
  values (p_recipient_id, p_reward_id, p_qty)
  on conflict (user_id, reward_id) do update set qty = public.user_inventory.qty + excluded.qty;
  update public.user_progress set coins = v_bal where user_id = v_uid;
  return jsonb_build_object('purchase_id', v_existing.id, 'total', v_total,
    'balance', v_bal, 'duplicate', false);
end;
$$;

-- Unlock an achievement exactly once; its coin reward is granted once too.
create or replace function public.sf_unlock_achievement(p_achievement_id text, p_ref_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_reward integer;
  v_bal integer;
  v_unlocked boolean := false;
  v_tx_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_ref_key is null or char_length(p_ref_key) < 1 or char_length(p_ref_key) > 128 then
    raise exception 'INVALID_REF';
  end if;
  select reward_coins into v_reward from public.achievement_defs
  where id = p_achievement_id and active = true;
  if not found then
    raise exception 'INVALID_ACHIEVEMENT';
  end if;
  insert into public.user_achievements (user_id, achievement_id, metadata)
  values (v_uid, p_achievement_id, jsonb_build_object('ref', p_ref_key))
  on conflict (user_id, achievement_id) do nothing;
  if found then
    v_unlocked := true;
    if coalesce(v_reward, 0) > 0 then
      insert into public.user_balances (user_id, balance)
      values (v_uid, 0)
      on conflict (user_id) do nothing;
      insert into public.coin_transactions (user_id, type, amount, reason, ref_key, metadata)
      values (v_uid, 'earn', v_reward, 'Achievement unlocked', 'achievement:' || p_achievement_id,
        jsonb_build_object('achievement_id', p_achievement_id))
      on conflict (user_id, ref_key) do nothing
      returning id into v_tx_id;
      -- Credit ONLY when this call inserted the ledger row (first claim wins).
      if v_tx_id is not null then
        update public.user_balances set balance = balance + v_reward
        where user_id = v_uid;
      end if;
      update public.user_progress set coins = (select balance from public.user_balances where user_id = v_uid)
      where user_id = v_uid;
    end if;
  end if;
  select balance into v_bal from public.user_balances where user_id = v_uid;
  return jsonb_build_object('unlocked', v_unlocked, 'reward', case when v_unlocked then coalesce(v_reward, 0) else 0 end,
    'balance', coalesce(v_bal, 0), 'duplicate', not v_unlocked);
end;
$$;

-- Record one qualifying activity day. Same-day repeats never advance the
-- streak; milestone bonuses are granted once via the ledger.
create or replace function public.sf_streak_day(p_ref_key text, p_day date default CURRENT_DATE)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := CURRENT_DATE;
  v_cur integer := 0;
  v_long integer := 0;
  v_last date;
  v_new integer;
  v_bonus integer := 0;
  v_bal integer;
  v_tx_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_ref_key is null or char_length(p_ref_key) < 1 or char_length(p_ref_key) > 128 then
    raise exception 'INVALID_REF';
  end if;
  if p_day is null or p_day < v_today - 2 or p_day > v_today then
    raise exception 'INVALID_DAY';
  end if;
  insert into public.user_balances (user_id, balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  insert into public.streaks (user_id) values (v_uid) on conflict (user_id) do nothing;
  select current_streak, longest_streak, last_activity_date
  into v_cur, v_long, v_last from public.streaks where user_id = v_uid for update;
  if v_last = p_day then
    select balance into v_bal from public.user_balances where user_id = v_uid;
    return jsonb_build_object('current', v_cur, 'longest', v_long,
      'advanced', false, 'bonus', 0, 'balance', coalesce(v_bal, 0));
  end if;
  if v_last = p_day - 1 then
    v_new := coalesce(v_cur, 0) + 1;
  elsif v_last is null then
    v_new := 1;
  else
    v_new := 1;
  end if;
  v_long := greatest(coalesce(v_long, 0), v_new);
  update public.streaks
  set current_streak = v_new, longest_streak = v_long, last_activity_date = p_day
  where user_id = v_uid;
  -- Milestone bonuses (server-owned amounts, granted once each).
  v_bonus := case v_new
    when 3 then 15 when 7 then 40 when 14 then 100 when 30 then 250
    when 60 then 500 when 100 then 1000 when 365 then 5000 else 0 end;
  if v_bonus > 0 then
    insert into public.coin_transactions (user_id, type, amount, reason, ref_key, metadata)
    values (v_uid, 'earn', v_bonus, 'Streak milestone', 'streak:' || v_new::text,
      jsonb_build_object('streak', v_new))
    on conflict (user_id, ref_key) do nothing
    returning id into v_tx_id;
    -- Credit ONLY when this call inserted the ledger row: regaining a
    -- milestone later never pays twice.
    if v_tx_id is not null then
      update public.user_balances set balance = balance + v_bonus
      where user_id = v_uid;
    else
      v_bonus := 0;
    end if;
  end if;
  select balance into v_bal from public.user_balances where user_id = v_uid;
  update public.user_progress set coins = v_bal where user_id = v_uid;
  return jsonb_build_object('current', v_new, 'longest', v_long,
    'advanced', true, 'bonus', v_bonus, 'balance', coalesce(v_bal, 0));
end;
$$;

-- Open a mystery box. The DATABASE rolls the rarity and the reward — the
-- client only says which box to open. Idempotent on (user, ref_key); the
-- free daily box is additionally limited to one per UTC day.
create or replace function public.sf_open_box(p_box_type text, p_ref_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := CURRENT_DATE;
  v_price integer;
  v_r real;
  v_rarity text;
  v_kind text;
  v_reward_id text := null;
  v_amount integer := 0;
  v_bal integer;
  v_existing mystery_box_openings%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_box_type not in ('free-common','common','rare','epic','legendary') then
    raise exception 'INVALID_BOX';
  end if;
  if p_ref_key is null or char_length(p_ref_key) < 1 or char_length(p_ref_key) > 128 then
    raise exception 'INVALID_REF';
  end if;
  v_price := case p_box_type
    when 'free-common' then 0 when 'common' then 50 when 'rare' then 120
    when 'epic' then 300 when 'legendary' then 750 end;
  -- Replay: return the stored roll, never reroll.
  select * into v_existing from public.mystery_box_openings
  where user_id = v_uid and ref_key = p_ref_key;
  if found then
    select balance into v_bal from public.user_balances where user_id = v_uid;
    return jsonb_build_object('rarity', v_existing.rarity, 'kind', v_existing.reward_kind,
      'reward_id', v_existing.reward_id, 'amount', v_existing.reward_amount,
      'balance', coalesce(v_bal, 0), 'duplicate', true);
  end if;
  insert into public.user_balances (user_id, balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  if p_box_type = 'free-common' then
    if exists (select 1 from public.mystery_box_openings
        where user_id = v_uid and box_type = 'free-common' and opened_day = v_today) then
      raise exception 'ALREADY_CLAIMED';
    end if;
  else
    select balance into v_bal from public.user_balances where user_id = v_uid for update;
    if coalesce(v_bal, 0) < v_price then
      raise exception 'INSUFFICIENT_COINS';
    end if;
    update public.user_balances set balance = balance - v_price where user_id = v_uid
    returning balance into v_bal;
    insert into public.coin_transactions (user_id, type, amount, reason, ref_key, metadata)
    values (v_uid, 'spend', -v_price, 'Mystery box opened', 'box:' || p_ref_key,
      jsonb_build_object('box_type', p_box_type));
  end if;
  -- Authoritative roll. Free box: Rare 1-in-10, Epic 0.63%, Legendary 0.07%.
  v_r := random();
  if p_box_type = 'free-common' then
    v_rarity := case
      when v_r < 0.0007 then 'Legendary'
      when v_r < 0.007 then 'Epic'
      when v_r < 0.10 then 'Rare'
      else 'Common' end;
  elsif p_box_type = 'common' then
    v_rarity := case
      when v_r < 0.01 then 'Legendary'
      when v_r < 0.08 then 'Epic'
      when v_r < 0.35 then 'Rare'
      else 'Common' end;
  elsif p_box_type = 'rare' then
    v_rarity := case
      when v_r < 0.05 then 'Legendary'
      when v_r < 0.30 then 'Epic'
      when v_r < 0.85 then 'Rare'
      else 'Common' end;
  elsif p_box_type = 'epic' then
    v_rarity := case
      when v_r < 0.15 then 'Legendary'
      when v_r < 0.65 then 'Epic'
      when v_r < 0.95 then 'Rare'
      else 'Common' end;
  else -- legendary
    v_rarity := case
      when v_r < 0.55 then 'Legendary'
      when v_r < 0.90 then 'Epic'
      else 'Rare' end;
  end if;
  -- Reward: Epic/Legendary rolls may yield a catalog item from the matching
  -- price band (50%); everything else pays coins from the box's band.
  if v_rarity in ('Epic','Legendary') and random() < 0.5 then
    select id into v_reward_id from public.rewards
    where active = true
      and ((v_rarity = 'Epic' and price >= 120 and price < 200)
        or (v_rarity = 'Legendary' and price >= 200))
    order by random() limit 1;
  end if;
  if v_reward_id is not null then
    v_kind := 'item';
    v_amount := 1;
    insert into public.user_inventory (user_id, reward_id, qty)
    values (v_uid, v_reward_id, 1)
    on conflict (user_id, reward_id) do update set qty = public.user_inventory.qty + 1;
  else
    v_kind := 'coins';
    v_amount := case
      when p_box_type = 'free-common' and v_rarity = 'Legendary' then 400 + floor(random()*401)::int
      when p_box_type = 'free-common' and v_rarity = 'Epic' then 150 + floor(random()*151)::int
      when p_box_type = 'free-common' and v_rarity = 'Rare' then 60 + floor(random()*61)::int
      when p_box_type = 'free-common' then 8 + floor(random()*13)::int
      when v_rarity = 'Legendary' then (case p_box_type when 'common' then 150 when 'rare' then 300 when 'epic' then 600 else 1500 end)
      when v_rarity = 'Epic' then (case p_box_type when 'common' then 25 when 'rare' then 90 when 'epic' then 250 else 600 end)
      when v_rarity = 'Rare' then (case p_box_type when 'common' then 18 when 'rare' then 65 when 'epic' then 185 else 450 end)
      else (case p_box_type when 'common' then 10 when 'rare' then 40 when 'epic' then 120 else 300 end)
    end;
    insert into public.coin_transactions (user_id, type, amount, reason, ref_key, metadata)
    values (v_uid, 'earn', v_amount, 'Mystery box reward', 'boxreward:' || p_ref_key,
      jsonb_build_object('box_type', p_box_type, 'rarity', v_rarity));
    update public.user_balances set balance = balance + v_amount where user_id = v_uid;
  end if;
  insert into public.mystery_box_openings
    (user_id, box_type, rarity, reward_kind, reward_id, reward_amount, ref_key, opened_day)
  values (v_uid, p_box_type, v_rarity, v_kind, v_reward_id, v_amount, p_ref_key, v_today);
  select balance into v_bal from public.user_balances where user_id = v_uid;
  update public.user_progress set coins = v_bal where user_id = v_uid;
  return jsonb_build_object('rarity', v_rarity, 'kind', v_kind,
    'reward_id', v_reward_id, 'amount', v_amount,
    'balance', coalesce(v_bal, 0), 'duplicate', false);
end;
$$;

-- New accounts start with an empty wallet + streak row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, handle)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'Study Learner'), coalesce(new.raw_user_meta_data ->> 'handle', 'study_' || left(replace(new.id::text, '-', ''), 8)))
  on conflict (id) do nothing;
  insert into public.user_progress (user_id) values (new.id) on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  insert into public.user_balances (user_id) values (new.id) on conflict do nothing;
  insert into public.streaks (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

-- Backfill wallets + streak rows for accounts created before this migration.
insert into public.user_balances (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.streaks (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 10. free-box day column + storage-level daily guard (concurrency-safe:
--     two simultaneous claims cannot both win, even if both pass the check)
-- ---------------------------------------------------------------------------
alter table public.mystery_box_openings add column if not exists opened_day date not null default CURRENT_DATE;

create unique index if not exists mystery_free_daily_uniq
  on public.mystery_box_openings (user_id, opened_day)
  where box_type = 'free-common';

-- ---------------------------------------------------------------------------
-- 11. daily deals — server-computed so discounts are authoritative too.
--     Each UTC day: 3 active catalog items (deterministic rotation), -25% /
--     -30% / -20%. The client may claim a deal, never set one.
-- ---------------------------------------------------------------------------
create or replace function public.sf_deal_for(p_reward_id text)
returns integer
language sql stable set search_path = public as $$
  select deal_price from (
    select s.id,
      greatest(5, round(s.price * (1 - (case row_number() over ()
        when 1 then 25 when 2 then 30 else 20 end)::numeric / 100)))::integer as deal_price
    from (
      select id, price from public.rewards
      where active = true
      order by md5(CURRENT_DATE::text || id)
      limit 3
    ) s
  ) d where d.id = p_reward_id;
$$;

create or replace function public.sf_daily_deals()
returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'reward_id', d.id, 'deal_price', d.deal_price, 'pct', d.pct)
    order by d.n), '[]'::jsonb)
  from (
    select s.id,
      greatest(5, round(s.price * (1 - (case row_number() over ()
        when 1 then 25 when 2 then 30 else 20 end)::numeric / 100)))::integer as deal_price,
      (case row_number() over () when 1 then 25 when 2 then 30 else 20 end) as pct,
      row_number() over () as n
    from (
      select id, price from public.rewards
      where active = true
      order by md5(CURRENT_DATE::text || id)
      limit 3
    ) s
  ) d;
$$;

-- Deal-aware purchase: p_use_deal=true charges today's server deal price.
create or replace function public.sf_purchase_deal(p_reward_id text, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_price integer;
  v_stock integer;
  v_bal integer;
  v_existing purchases%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 1 or char_length(p_idempotency_key) > 128 then
    raise exception 'INVALID_REF';
  end if;
  v_price := public.sf_deal_for(p_reward_id);
  if v_price is null then
    raise exception 'REWARD_UNAVAILABLE';
  end if;
  select stock into v_stock from public.rewards where id = p_reward_id for update;
  if v_stock is not null and v_stock < 1 then
    raise exception 'OUT_OF_STOCK';
  end if;
  select * into v_existing from public.purchases
  where buyer_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    select balance into v_bal from public.user_balances where user_id = v_uid;
    return jsonb_build_object('purchase_id', v_existing.id, 'total', v_existing.total,
      'balance', coalesce(v_bal, 0), 'duplicate', true);
  end if;
  insert into public.user_balances (user_id, balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  select balance into v_bal from public.user_balances where user_id = v_uid for update;
  if coalesce(v_bal, 0) < v_price then
    raise exception 'INSUFFICIENT_COINS';
  end if;
  update public.user_balances set balance = balance - v_price where user_id = v_uid
  returning balance into v_bal;
  insert into public.coin_transactions (user_id, type, amount, reason, ref_key, metadata)
  values (v_uid, 'spend', -v_price, 'Daily deal purchase', 'deal:' || p_idempotency_key,
    jsonb_build_object('reward_id', p_reward_id));
  if v_stock is not null then
    update public.rewards set stock = stock - 1 where id = p_reward_id;
  end if;
  insert into public.purchases (buyer_id, recipient_id, reward_id, price, unit_price, total, qty, idempotency_key, status)
  values (v_uid, null, p_reward_id, v_price, v_price, v_price, 1, p_idempotency_key, 'completed')
  returning * into v_existing;
  insert into public.user_inventory (user_id, reward_id, qty)
  values (v_uid, p_reward_id, 1)
  on conflict (user_id, reward_id) do update set qty = public.user_inventory.qty + 1;
  update public.user_progress set coins = v_bal where user_id = v_uid;
  return jsonb_build_object('purchase_id', v_existing.id, 'total', v_price,
    'balance', v_bal, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. consume inventory (activate a boost / sell back for coins).
--     Ledger-first: a retried request with the same ref returns the original
--     result WITHOUT consuming twice or crediting twice. Sell-back credit is
--     derived from the AUTHORITATIVE catalog price (60%) — the client never
--     chooses how many coins selling pays.
-- ---------------------------------------------------------------------------
create or replace function public.sf_consume(p_reward_id text, p_qty integer, p_sell_back boolean default false, p_ref_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_have integer;
  v_price integer;
  v_credit integer := 0;
  v_bal integer;
  v_tx_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'INVALID_QTY';
  end if;
  select price into v_price from public.rewards where id = p_reward_id;
  if not found then
    raise exception 'INVALID_REWARD';
  end if;
  if p_sell_back then
    v_credit := floor(v_price * 0.6)::integer * p_qty;
  end if;
  insert into public.user_balances (user_id, balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;
  if v_credit > 0 then
    if p_ref_key is null or char_length(p_ref_key) < 1 or char_length(p_ref_key) > 128 then
      raise exception 'INVALID_REF';
    end if;
    insert into public.coin_transactions (user_id, type, amount, reason, ref_key, metadata)
    values (v_uid, 'earn', v_credit, 'Reward sold', p_ref_key,
      jsonb_build_object('reward_id', p_reward_id, 'qty', p_qty))
    on conflict (user_id, ref_key) do nothing
    returning id into v_tx_id;
    if v_tx_id is null then
      select balance into v_bal from public.user_balances where user_id = v_uid;
      return jsonb_build_object('balance', coalesce(v_bal, 0), 'duplicate', true, 'credited', 0);
    end if;
  end if;
  select qty into v_have from public.user_inventory
  where user_id = v_uid and reward_id = p_reward_id for update;
  if v_have is null or v_have < p_qty then
    raise exception 'NOT_OWNED';
  end if;
  update public.user_inventory set qty = qty - p_qty
  where user_id = v_uid and reward_id = p_reward_id;
  if v_credit > 0 then
    update public.user_balances set balance = balance + v_credit where user_id = v_uid
    returning balance into v_bal;
    update public.user_progress set coins = v_bal where user_id = v_uid;
  else
    select balance into v_bal from public.user_balances where user_id = v_uid;
  end if;
  return jsonb_build_object('balance', coalesce(v_bal, 0), 'duplicate', false, 'credited', v_credit);
end;
$$;
