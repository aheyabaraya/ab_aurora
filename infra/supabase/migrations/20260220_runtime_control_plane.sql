create extension if not exists "pgcrypto";

create table if not exists public.runtime_goals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  goal_type text not null,
  goal_input jsonb,
  status text not null default 'pending',
  current_plan_id uuid,
  current_step_no int not null default 0,
  last_action_id uuid,
  last_eval_id uuid,
  idempotency_key text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.runtime_plans (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.runtime_goals (id) on delete cascade,
  version int not null,
  rationale text not null,
  proposed_actions jsonb not null default '[]'::jsonb,
  stop_condition text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.runtime_actions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.runtime_goals (id) on delete cascade,
  plan_id uuid references public.runtime_plans (id) on delete set null,
  step_no int not null,
  action_type text not null,
  tool_name text not null,
  action_input jsonb not null default '{}'::jsonb,
  policy_result text,
  status text not null default 'pending',
  idempotency_key text,
  output jsonb,
  error text,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.runtime_tool_calls (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.runtime_goals (id) on delete cascade,
  action_id uuid not null references public.runtime_actions (id) on delete cascade,
  tool_name text not null,
  input jsonb not null,
  output jsonb,
  status text not null,
  latency_ms int not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.runtime_evals (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.runtime_goals (id) on delete cascade,
  plan_id uuid references public.runtime_plans (id) on delete set null,
  action_id uuid references public.runtime_actions (id) on delete set null,
  scores jsonb not null default '{}'::jsonb,
  pass boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  next_hint text,
  created_at timestamptz not null default now()
);

create table if not exists public.runtime_memories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('session', 'brand')),
  session_id uuid references public.sessions (id) on delete cascade,
  brand_key text,
  memory_key text not null,
  memory_value jsonb not null,
  weight double precision not null default 1,
  source_action_id uuid references public.runtime_actions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.runtime_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  goal_id uuid not null references public.runtime_goals (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_runtime_goals_session_created
  on public.runtime_goals (session_id, created_at desc);
create index if not exists idx_runtime_goals_status_created
  on public.runtime_goals (status, created_at desc);
create index if not exists idx_runtime_plans_goal_version
  on public.runtime_plans (goal_id, version desc);
create index if not exists idx_runtime_actions_goal_step
  on public.runtime_actions (goal_id, step_no);
create index if not exists idx_runtime_actions_goal_created
  on public.runtime_actions (goal_id, created_at desc);
create index if not exists idx_runtime_tool_calls_goal_created
  on public.runtime_tool_calls (goal_id, created_at desc);
create index if not exists idx_runtime_evals_goal_created
  on public.runtime_evals (goal_id, created_at desc);
create index if not exists idx_runtime_memories_scope_brand_key
  on public.runtime_memories (scope, brand_key, memory_key);
create index if not exists idx_runtime_memories_scope_session_key
  on public.runtime_memories (scope, session_id, memory_key);
create index if not exists idx_runtime_events_goal_created
  on public.runtime_events (goal_id, created_at desc);
create unique index if not exists idx_runtime_goals_idempotency
  on public.runtime_goals (idempotency_key)
  where idempotency_key is not null;
create unique index if not exists idx_runtime_actions_goal_idem
  on public.runtime_actions (goal_id, idempotency_key)
  where idempotency_key is not null;

alter table public.runtime_goals enable row level security;
alter table public.runtime_plans enable row level security;
alter table public.runtime_actions enable row level security;
alter table public.runtime_tool_calls enable row level security;
alter table public.runtime_evals enable row level security;
alter table public.runtime_memories enable row level security;
alter table public.runtime_events enable row level security;

drop policy if exists deny_all_runtime_goals on public.runtime_goals;
drop policy if exists deny_all_runtime_plans on public.runtime_plans;
drop policy if exists deny_all_runtime_actions on public.runtime_actions;
drop policy if exists deny_all_runtime_tool_calls on public.runtime_tool_calls;
drop policy if exists deny_all_runtime_evals on public.runtime_evals;
drop policy if exists deny_all_runtime_memories on public.runtime_memories;
drop policy if exists deny_all_runtime_events on public.runtime_events;

create policy deny_all_runtime_goals on public.runtime_goals for all using (false) with check (false);
create policy deny_all_runtime_plans on public.runtime_plans for all using (false) with check (false);
create policy deny_all_runtime_actions on public.runtime_actions for all using (false) with check (false);
create policy deny_all_runtime_tool_calls on public.runtime_tool_calls for all using (false) with check (false);
create policy deny_all_runtime_evals on public.runtime_evals for all using (false) with check (false);
create policy deny_all_runtime_memories on public.runtime_memories for all using (false) with check (false);
create policy deny_all_runtime_events on public.runtime_events for all using (false) with check (false);
