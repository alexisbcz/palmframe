-- Deep dives: a link goes in, an agent researches it, and a checked article
-- comes out. Runs are written only by the server.
create table public.comic_deep_dives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lead text not null check (lead like 'https://%' and char_length(lead) <= 500),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'review', 'failed')),
  title text not null default '',
  dek text not null default '',
  body text not null default '',
  -- The agent's conversation, so a run can span several function calls.
  messages jsonb not null default '[]',
  log jsonb not null default '[]',
  facts jsonb not null default '[]',
  sources jsonb not null default '[]',
  findings jsonb not null default '[]',
  problems jsonb not null default '[]',
  submits integer not null default 0,
  slices integer not null default 0,
  leased_until timestamptz,
  job text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_deep_dives_user_idx on public.comic_deep_dives (user_id, created_at desc);

create trigger comic_deep_dives_touch
  before update on public.comic_deep_dives
  for each row execute function public.comic_projects_touch();

alter table public.comic_deep_dives enable row level security;
revoke all on public.comic_deep_dives from anon, authenticated;
grant select (id, user_id, lead, status, title, dek, body, log, facts, sources, findings, problems, created_at, updated_at)
  on public.comic_deep_dives to authenticated;

create policy "Owners read their deep dives"
  on public.comic_deep_dives for select to authenticated
  using (user_id = (select auth.uid()));
