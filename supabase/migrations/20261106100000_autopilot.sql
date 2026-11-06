-- Autopilot: a fleet of content agents. Each agent is a durable pi conversation
-- (@earendil-works/pi-durable) whose SQLite file lives in the private
-- `autopilot` bucket; these tables hold what the app lists, schedules and
-- publishes. Only the server writes them.

create table public.comic_autopilot_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  handle text not null default '' check (char_length(handle) <= 40),
  role text not null check (role ~ '^[a-z][a-z0-9_]{1,30}$'),
  -- A loose group, so a fleet of fifty stays readable.
  squad text not null default '' check (char_length(squad) <= 40),
  brief text not null check (char_length(brief) between 3 and 2000),
  voice text not null default '' check (char_length(voice) <= 600),
  topics text[] not null default '{}',
  platforms text[] not null default '{x}',
  -- Minutes between runs.
  cadence integer not null default 240 check (cadence between 30 and 10080),
  posts_per_run smallint not null default 1 check (posts_per_run between 1 and 4),
  -- review: posts wait in the queue. autopilot: they're scheduled at once.
  mode text not null default 'review' check (mode in ('review', 'autopilot')),
  hue smallint not null default 190 check (hue between 0 and 359),
  enabled boolean not null default true,
  max_credits_per_week integer not null default 120 check (max_credits_per_week between 0 and 5000),
  -- Notes the agent keeps for itself between runs.
  memory text not null default '' check (char_length(memory) <= 4000),
  -- Messages from the creator not yet handed to the agent: [{ id, text, at }].
  inbox jsonb not null default '[]',
  -- The newest transcript lines while a worker runs it, mirrored from the
  -- durable session's watch so the agent page is live mid-run.
  live jsonb not null default '[]',
  state text not null default 'idle' check (state in ('idle', 'running', 'sleeping', 'failed')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_error text not null default '',
  -- One worker at a time owns an agent's durable file.
  leased_until timestamptz,
  runs integer not null default 0,
  -- Model spend in USD, read from the durable session's usage.
  spend numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_autopilot_agents_user_idx on public.comic_autopilot_agents (user_id, created_at desc);
create index comic_autopilot_agents_due_idx on public.comic_autopilot_agents (next_run_at) where enabled;

create trigger comic_autopilot_agents_touch
  before update on public.comic_autopilot_agents
  for each row execute function public.comic_projects_touch();

create table public.comic_autopilot_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.comic_autopilot_agents (id) on delete cascade,
  platform text not null check (platform in ('x', 'linkedin', 'bluesky', 'threads')),
  text text not null check (char_length(text) between 1 and 3000),
  -- Why the agent wrote it, and what it read.
  angle text not null default '',
  sources jsonb not null default '[]',
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'rejected', 'failed')),
  scheduled_for timestamptz,
  provider text not null default '',
  provider_post_id text not null default '',
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_autopilot_posts_user_idx on public.comic_autopilot_posts (user_id, created_at desc);
create index comic_autopilot_posts_agent_idx on public.comic_autopilot_posts (agent_id, created_at desc);

create trigger comic_autopilot_posts_touch
  before update on public.comic_autopilot_posts
  for each row execute function public.comic_projects_touch();

-- What the fleet is doing, for the live feed. Pruned to the newest per agent by the runner.
create table public.comic_autopilot_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.comic_autopilot_agents (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,20}$'),
  label text not null default '',
  created_at timestamptz not null default now()
);

create index comic_autopilot_events_user_idx on public.comic_autopilot_events (user_id, id desc);
create index comic_autopilot_events_agent_idx on public.comic_autopilot_events (agent_id, id desc);

alter table public.comic_autopilot_agents enable row level security;
alter table public.comic_autopilot_posts enable row level security;
alter table public.comic_autopilot_events enable row level security;
revoke all on public.comic_autopilot_agents, public.comic_autopilot_posts, public.comic_autopilot_events
  from anon, authenticated;
grant select on public.comic_autopilot_agents, public.comic_autopilot_posts, public.comic_autopilot_events
  to authenticated;
create policy "Owners read their agents" on public.comic_autopilot_agents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners read their agent posts" on public.comic_autopilot_posts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners read their agent events" on public.comic_autopilot_events
  for select to authenticated using (user_id = (select auth.uid()));

-- The agents' durable sessions. Private: only the server reads them.
insert into storage.buckets (id, name, public, file_size_limit)
values ('autopilot', 'autopilot', false, 52428800)
on conflict (id) do nothing;

-- Once a minute: run the agents that are due and pick up runs a worker dropped.
select cron.schedule(
  'autopilot-tick',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://www.palmframe.com/api/autopilot/tick',
      headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret),
      timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets s
    where s.name = 'machines_cron_secret'
  $job$
);
