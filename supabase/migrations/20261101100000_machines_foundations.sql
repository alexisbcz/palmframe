-- Foundations for machines that run unattended: what each edition did, what a
-- draft's words stand on, and how to stop everything without a deploy.

-- Drafts keep their evidence, because the inbox is pruned and an edited post
-- has to be checked again against what the machine actually read.
alter table public.comic_machine_drafts
  add column evidence text not null default ''
    check (char_length(evidence) <= 60000),
  -- Why the owner threw it away (DismissReason), for the agent's memory.
  add column dismiss_reason text
    check (dismiss_reason in ('wrong', 'dull', 'repeat', 'tone')),
  drop constraint comic_machine_drafts_status_check,
  add constraint comic_machine_drafts_status_check check (
    status in ('new', 'used', 'dismissed', 'approved', 'publishing', 'published', 'failed', 'expired')
  );

create index comic_machine_drafts_held_idx
  on public.comic_machine_drafts (created_at) where status = 'new' and held is not null;
create index comic_machine_drafts_day_idx
  on public.comic_machine_drafts (machine_id, created_at desc);

-- One row per edition, including the ones that passed or never started: passes
-- are billed and leave no draft. Written only by the server.
create table public.comic_machine_runs (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.comic_machines (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  decision text not null check (decision in (
    'running', 'filed', 'passed', 'refused', 'exhausted', 'invalid', 'failed',
    'empty', 'capped', 'ceiling', 'breaker', 'no_writer', 'no_credits', 'deadline', 'error'
  )),
  -- Why the agent passed, or what went wrong.
  reason text not null default '' check (char_length(reason) <= 1000),
  -- Platform credits this edition spent on its run, picture and Story.
  credits integer not null default 0 check (credits >= 0),
  -- The prompt and version it ran on.
  prompt text check (char_length(prompt) <= 120),
  job text check (char_length(job) <= 200),
  -- The post as the agent wrote it, before any person edited it.
  agent_text text check (char_length(agent_text) <= 500),
  draft_id uuid references public.comic_machine_drafts (id) on delete set null,
  -- Items per source: what it was shown and what it cited.
  shown jsonb not null default '{}',
  cited jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index comic_machine_runs_machine_idx
  on public.comic_machine_runs (machine_id, created_at desc);
create index comic_machine_runs_age_idx on public.comic_machine_runs (created_at);

alter table public.comic_machine_runs enable row level security;
revoke all on public.comic_machine_runs from anon, authenticated;
grant select on public.comic_machine_runs to authenticated;
create policy "Owners read their machine runs"
  on public.comic_machine_runs for select to authenticated
  using (user_id = (select auth.uid()));

-- One row: the stop for every machine. Read by runMachines and publishDraft,
-- and set by hand with `update public.comic_machines_control set halted = true`.
-- Nobody but the server reads it, so it has no policies.
create table public.comic_machines_control (
  id boolean primary key default true check (id),
  halted boolean not null default false,
  reason text not null default '' check (char_length(reason) <= 300),
  updated_at timestamptz not null default now()
);

insert into public.comic_machines_control default values;

create trigger comic_machines_control_touch
  before update on public.comic_machines_control
  for each row execute function public.comic_projects_touch();

alter table public.comic_machines_control enable row level security;
revoke all on public.comic_machines_control from anon, authenticated;
