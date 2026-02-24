create extension if not exists "pgcrypto";

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('mode_a', 'mode_b')),
  product text not null,
  audience text not null,
  style_keywords jsonb not null default '[]'::jsonb,
  "constraint" text,
  current_step text not null default 'interview_collect',
  status text not null default 'idle',
  auto_continue boolean not null default true,
  auto_pick_top1 boolean not null default true,
  paused boolean not null default false,
  intent_confidence int check (intent_confidence between 1 and 5),
  variation_width text check (variation_width in ('wide', 'medium', 'narrow')),
  latest_top3 jsonb,
  selected_candidate_id text,
  draft_spec jsonb,
  final_spec jsonb,
  revision_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  step text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'canceled')),
  payload jsonb,
  logs jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  step text not null,
  kind text not null,
  title text not null,
  content jsonb not null,
  hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  meta jsonb not null,
  bundle_hash text not null,
  cid text,
  mint_tx text,
  created_at timestamptz not null default now()
);

create table if not exists public.preset (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  value jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.usage (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  type text not null,
  amount int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_jobs_session_created on public.jobs (session_id, created_at desc);
create index if not exists idx_jobs_session_status on public.jobs (session_id, status, created_at desc);
create index if not exists idx_artifacts_session_step on public.artifacts (session_id, step, created_at desc);

create or replace function public.block_multiple_active_jobs()
returns trigger
language plpgsql
as $$
declare
  active_count int;
begin
  if new.status not in ('pending', 'running') then
    return new;
  end if;

  select count(*) into active_count
  from public.jobs
  where session_id = new.session_id
    and status in ('pending', 'running')
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if active_count > 0 then
    raise exception 'active job already exists for session %', new.session_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_jobs_single_active on public.jobs;
create trigger trg_jobs_single_active
before insert or update on public.jobs
for each row execute function public.block_multiple_active_jobs();

alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.jobs enable row level security;
alter table public.artifacts enable row level security;
alter table public.packs enable row level security;
alter table public.preset enable row level security;
alter table public.usage enable row level security;

drop policy if exists deny_all_sessions on public.sessions;
drop policy if exists deny_all_messages on public.messages;
drop policy if exists deny_all_jobs on public.jobs;
drop policy if exists deny_all_artifacts on public.artifacts;
drop policy if exists deny_all_packs on public.packs;
drop policy if exists deny_all_preset on public.preset;
drop policy if exists deny_all_usage on public.usage;

create policy deny_all_sessions on public.sessions for all using (false) with check (false);
create policy deny_all_messages on public.messages for all using (false) with check (false);
create policy deny_all_jobs on public.jobs for all using (false) with check (false);
create policy deny_all_artifacts on public.artifacts for all using (false) with check (false);
create policy deny_all_packs on public.packs for all using (false) with check (false);
create policy deny_all_preset on public.preset for all using (false) with check (false);
create policy deny_all_usage on public.usage for all using (false) with check (false);
