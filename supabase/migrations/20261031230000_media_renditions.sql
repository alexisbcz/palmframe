-- Agentic media: a deep dive can start from a topic as well as a link, a
-- machine can start one, and each researched Story renders into many formats.
alter table public.comic_deep_dives
  drop constraint comic_deep_dives_lead_check,
  add constraint comic_deep_dives_lead_check check (char_length(lead) between 3 and 500),
  add column machine_id uuid references public.comic_machines (id) on delete set null;

create index comic_deep_dives_machine_idx on public.comic_deep_dives (machine_id, created_at desc)
  where machine_id is not null;
create index comic_deep_dives_open_idx on public.comic_deep_dives (updated_at)
  where status in ('queued', 'running');

-- One format of one Story. Written only by the server.
create table public.comic_media_renditions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  deep_dive_id uuid not null references public.comic_deep_dives (id) on delete cascade,
  machine_id uuid references public.comic_machines (id) on delete set null,
  format text not null
    check (format in ('blog', 'substack', 'linkedin', 'x_thread', 'instagram_carousel', 'youtube')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'review', 'failed')),
  title text not null default '',
  parts jsonb not null default '[]',
  meta jsonb not null default '{}',
  findings jsonb not null default '[]',
  problems jsonb not null default '[]',
  attempts integer not null default 0,
  leased_until timestamptz,
  job text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_media_renditions_dive_idx
  on public.comic_media_renditions (deep_dive_id, created_at desc);
create index comic_media_renditions_user_idx
  on public.comic_media_renditions (user_id, created_at desc);
create index comic_media_renditions_open_idx on public.comic_media_renditions (updated_at)
  where status in ('queued', 'running');
-- A double click can't pay twice. A failed render can be tried again.
create unique index comic_media_renditions_one_live_idx
  on public.comic_media_renditions (deep_dive_id, format)
  where status <> 'failed';

create trigger comic_media_renditions_touch
  before update on public.comic_media_renditions
  for each row execute function public.comic_projects_touch();

alter table public.comic_media_renditions enable row level security;
revoke all on public.comic_media_renditions from anon, authenticated;
grant select (id, user_id, deep_dive_id, format, status, title, parts, meta, findings, problems, attempts, created_at, updated_at)
  on public.comic_media_renditions to authenticated;

create policy "Owners read their renditions"
  on public.comic_media_renditions for select to authenticated
  using (user_id = (select auth.uid()));

-- A draft written for one platform goes only to that platform's accounts.
-- It also fits that platform: a LinkedIn post runs far past a Bluesky one.
alter table public.comic_machine_drafts
  drop constraint comic_machine_drafts_text_check,
  add constraint comic_machine_drafts_text_check check (char_length(text) <= 3000),
  add column platform text
    check (platform in ('bluesky', 'twitter', 'threads', 'linkedin', 'instagram'));
