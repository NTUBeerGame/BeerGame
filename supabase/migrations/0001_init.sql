-- Beer Game 初始資料庫結構
-- 用法：Supabase Dashboard → SQL Editor → 貼上整份 → Run
--
-- 權限設計：
--   * 瀏覽器（anon key）只能「讀」games 這張表，用來訂閱即時更新；裡面沒有任何秘密欄位。
--   * 其他所有讀寫都經過 Vercel API（service role key），由 API 檢查 token。
--   * 結算與下單都在 Postgres function 裡完成，用 row lock 保證不會重複結算或寫到錯的期。

create extension if not exists pgcrypto;

-- ── 班級（一位老師開一次課 = 一筆）────────────────────────────
create table classes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  join_code     text not null unique,  -- 學生輸入的班級代碼
  teacher_token uuid not null unique default gen_random_uuid(),
  config        jsonb not null,
  created_at    timestamptz not null default now()
);

-- ── 遊戲（一個小組 = 一局）──────────────────────────────────────
create table games (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid references classes(id) on delete cascade, -- 之後的單人模式可為 null
  group_no        int,
  code            text not null unique,  -- 小組代碼（可直接用這個加入）
  status          text not null default 'waiting'
                  check (status in ('waiting', 'playing', 'paused', 'finished')),
  phase           text not null default 'decision'
                  check (phase in ('decision', 'result')), -- 決策輸入中／檢視結算結果
  current_week    int not null default 1,
  submitted_roles text[] not null default '{}', -- 本期已送出決策的角色
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()  -- 有人加入／離開也會更新，讓大廳即時刷新
);
create index games_class_id_idx on games(class_id);

-- ── 遊戲完整狀態（只有後端能讀）────────────────────────────────
create table game_states (
  game_id      uuid primary key references games(id) on delete cascade,
  state        jsonb not null,
  current_week int not null default 1,
  version      int not null default 0, -- 樂觀鎖：每結算一次 +1
  updated_at   timestamptz not null default now()
);

-- ── 座位：誰坐在哪個角色 ───────────────────────────────────────
create table seats (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references games(id) on delete cascade,
  role         text not null check (role in ('retailer', 'wholesaler', 'distributor', 'factory')),
  nickname     text not null,
  controller   text not null default 'human' check (controller in ('human', 'auto', 'agent')),
  token        uuid not null unique default gen_random_uuid(), -- 學生的身分憑證，存在瀏覽器
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (game_id, role)
);

-- ── 每期決策 ──────────────────────────────────────────────────
create table orders (
  game_id    uuid not null references games(id) on delete cascade,
  week       int not null,
  role       text not null,
  quantity   int not null check (quantity >= 0),          -- 向上游訂貨
  ship_qty   int check (ship_qty >= 0),                    -- 給下游出貨；null = 自動出到最多
  source     text not null default 'human' check (source in ('human', 'auto', 'timeout', 'agent')),
  created_at timestamptz not null default now(),
  primary key (game_id, week, role)
);

-- ── 每期每角色的完整紀錄（教師圖表、CSV、Analyst、受試者分析）──────
create table round_records (
  game_id         uuid not null references games(id) on delete cascade,
  week            int not null,
  role            text not null,
  begin_inventory int not null,
  received        int not null,
  incoming_order  int not null,
  total_demand    int not null,
  shipped         int not null,
  inventory       int not null,  -- 期末存貨
  backlog         int not null,  -- 期末欠貨
  order_qty       int not null,
  order_source    text not null,
  week_cost       numeric not null,
  total_cost      numeric not null,
  created_at      timestamptz not null default now(),
  primary key (game_id, week, role)
);

-- ── RLS ──────────────────────────────────────────────────────
alter table classes       enable row level security;
alter table games         enable row level security;
alter table game_states   enable row level security;
alter table seats         enable row level security;
alter table orders        enable row level security;
alter table round_records enable row level security;

-- 只開放 games 給瀏覽器讀（Realtime 訂閱需要）。其他表沒有 policy = 瀏覽器完全碰不到。
create policy "games are readable" on games for select to anon, authenticated using (true);

-- Realtime：games 有變動時推播給訂閱者
alter publication supabase_realtime add table games;

-- ── 送出決策（原子操作）────────────────────────────────────────
create or replace function submit_order(
  p_game_id uuid, p_week int, p_role text, p_quantity int, p_ship int
)
returns text[]
language plpgsql
set search_path = public
as $$
declare
  v_week   int;
  v_status text;
  v_phase  text;
  v_roles  text[];
begin
  -- 鎖住這局的狀態列，避免和結算同時發生
  select current_week into v_week from game_states where game_id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  select status, phase into v_status, v_phase from games where id = p_game_id;
  if v_status <> 'playing' then raise exception 'NOT_PLAYING'; end if;
  if v_phase <> 'decision' then raise exception 'NOT_DECISION_PHASE'; end if;
  if v_week <> p_week then raise exception 'WEEK_MISMATCH'; end if;

  insert into orders (game_id, week, role, quantity, ship_qty, source)
  values (p_game_id, p_week, p_role, p_quantity, p_ship, 'human')
  on conflict (game_id, week, role)
  do update set quantity = excluded.quantity, ship_qty = excluded.ship_qty,
                source = 'human', created_at = now();

  select coalesce(array_agg(role order by role), '{}') into v_roles
  from orders where game_id = p_game_id and week = p_week;

  update games set submitted_roles = v_roles, updated_at = now() where id = p_game_id;
  return v_roles;
end;
$$;

-- ── 結算（原子操作）────────────────────────────────────────────
-- 新狀態由 JS 引擎算好傳進來；這裡只負責「確認沒人搶先結算」後一次寫入。
create or replace function advance_game(
  p_game_id          uuid,
  p_expected_version int,
  p_new_state        jsonb,
  p_records          jsonb, -- 引擎回傳的 records 陣列
  p_fills            jsonb, -- 自動代下的決策 [{role, quantity, source}]
  p_next_week        int,
  p_finished         boolean,
  p_phase            text   -- 結算後的階段：老師控節奏 = 'result'，自動 = 'decision'
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_week int;
begin
  select current_week into v_week from game_states
  where game_id = p_game_id and version = p_expected_version
  for update;
  if not found then return false; end if; -- 別人已經結算過了

  insert into orders (game_id, week, role, quantity, source)
  select p_game_id, v_week, f->>'role', (f->>'quantity')::int, f->>'source'
  from jsonb_array_elements(p_fills) f
  on conflict (game_id, week, role) do nothing;

  insert into round_records (game_id, week, role, begin_inventory, received, incoming_order,
                             total_demand, shipped, inventory, backlog, order_qty, order_source,
                             week_cost, total_cost)
  select p_game_id, (r->>'week')::int, r->>'role', (r->>'beginInventory')::int,
         (r->>'received')::int, (r->>'incomingOrder')::int, (r->>'totalDemand')::int,
         (r->>'shipped')::int, (r->>'inventory')::int, (r->>'backlog')::int, (r->>'order')::int,
         coalesce((select o.source from orders o
                   where o.game_id = p_game_id and o.week = v_week and o.role = r->>'role'), 'auto'),
         (r->>'weekCost')::numeric, (r->>'totalCost')::numeric
  from jsonb_array_elements(p_records) r;

  update game_states
  set state = p_new_state, current_week = p_next_week, version = version + 1, updated_at = now()
  where game_id = p_game_id;

  update games
  set current_week = p_next_week,
      submitted_roles = '{}',
      phase = p_phase,
      status = case when p_finished then 'finished' else status end,
      updated_at = now()
  where id = p_game_id;

  return true;
end;
$$;

-- 這兩個 function 只給後端（service role）呼叫
revoke execute on function submit_order(uuid, int, text, int, int) from public, anon, authenticated;
revoke execute on function advance_game(uuid, int, jsonb, jsonb, jsonb, int, boolean, text)
  from public, anon, authenticated;
grant execute on function submit_order(uuid, int, text, int, int) to service_role;
grant execute on function advance_game(uuid, int, jsonb, jsonb, jsonb, int, boolean, text) to service_role;
