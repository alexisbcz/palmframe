-- Content machines: a filter over a live public stream that writes post and
-- comic drafts for its owner to review. Nothing here publishes anything.
create table public.comic_machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  source text not null check (source in ('bluesky', 'wikipedia', 'crypto')),
  -- Keywords, thresholds and voice (MachineConfig).
  config jsonb not null,
  -- Whether the scheduled runner listens for this machine.
  enabled boolean not null default false,
  -- What the detector remembers between runs (DetectorState).
  state jsonb not null default '{}',
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_machines_user_idx on public.comic_machines (user_id, created_at);
create index comic_machines_due_idx on public.comic_machines (last_run_at nulls first)
  where enabled;

create trigger comic_machines_touch
  before update on public.comic_machines
  for each row execute function public.comic_projects_touch();

-- Keeps the scheduled runner's work bounded, whatever a client sends.
create function public.comic_machines_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 1));
  if (select count(*) from public.comic_machines where user_id = new.user_id) >= 5 then
    raise exception 'Machine limit reached' using errcode = 'P0429';
  end if;
  return new;
end;
$$;

create trigger comic_machines_limit
  before insert on public.comic_machines
  for each row execute function public.comic_machines_limit();

create table public.comic_machine_drafts (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.comic_machines (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Stable across runs, so one event never makes two drafts or two charges.
  signal_id text not null check (char_length(signal_id) <= 300),
  -- What the detector saw (Signal): the draft's evidence.
  signal jsonb not null,
  text text not null check (char_length(text) <= 500),
  scene text not null default '' check (char_length(scene) <= 1000),
  alt text not null default '' check (char_length(alt) <= 500),
  status text not null default 'new' check (status in ('new', 'used', 'dismissed')),
  project_id uuid references public.comic_projects (id) on delete set null,
  -- The writer's prompt and version, or null for a draft written without one.
  prompt text,
  created_at timestamptz not null default now(),
  unique (machine_id, signal_id)
);

create index comic_machine_drafts_user_idx
  on public.comic_machine_drafts (user_id, created_at desc);

alter table public.comic_machines enable row level security;
alter table public.comic_machine_drafts enable row level security;

revoke all on public.comic_machines, public.comic_machine_drafts from anon;
grant select, insert, update, delete on public.comic_machines to authenticated;
grant select, insert, update, delete on public.comic_machine_drafts to authenticated;

create policy "Owners read their machines"
  on public.comic_machines for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owners create machines"
  on public.comic_machines for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Owners update their machines"
  on public.comic_machines for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Owners delete their machines"
  on public.comic_machines for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners read their drafts"
  on public.comic_machine_drafts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owners create drafts"
  on public.comic_machine_drafts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.comic_machines m
      where m.id = machine_id and m.user_id = (select auth.uid())
    )
  );
create policy "Owners update their drafts"
  on public.comic_machine_drafts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Owners delete their drafts"
  on public.comic_machine_drafts for delete to authenticated
  using (user_id = (select auth.uid()));
