-- Newsroom beats: recurring assignments filed on a schedule, plus voices,
-- languages, three more templates and publication themes.

alter table public.comic_deep_dives
  drop constraint comic_deep_dives_template_check,
  add constraint comic_deep_dives_template_check check (template in (
    'wire', 'breakdown', 'explainer', 'feature', 'profile', 'pulse',
    'roundup', 'analysis', 'listicle'
  )),
  -- How the story is written: { voice, language }.
  add column options jsonb not null default '{}';

alter table public.comic_newsrooms
  add column theme text not null default 'paper'
    check (theme in ('paper', 'broadsheet', 'midnight', 'zine'));

create table public.comic_newsroom_beats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  lead text not null check (char_length(lead) between 3 and 500),
  template text not null check (template in (
    'wire', 'breakdown', 'explainer', 'feature', 'profile', 'pulse',
    'roundup', 'analysis', 'listicle'
  )),
  options jsonb not null default '{}',
  cadence text not null default 'daily' check (cadence in ('daily', 'weekdays', 'weekly')),
  -- 0 is Sunday; only weekly beats use it.
  weekday smallint not null default 1 check (weekday between 0 and 6),
  minute_of_day smallint not null default 420 check (minute_of_day between 0 and 1439),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  enabled boolean not null default true,
  -- What happens to a story that passes every check.
  auto_publish boolean not null default false,
  auto_newsletter boolean not null default false,
  auto_social boolean not null default false,
  -- A beat stops filing once its stories this week cost this much.
  max_credits_per_week integer not null default 200 check (max_credits_per_week between 0 and 5000),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_newsroom_beats_due_idx on public.comic_newsroom_beats (next_run_at)
  where enabled;

create trigger comic_newsroom_beats_touch
  before update on public.comic_newsroom_beats
  for each row execute function public.comic_projects_touch();

alter table public.comic_deep_dives
  add column beat_id uuid references public.comic_newsroom_beats (id) on delete set null;

create index comic_deep_dives_beat_idx on public.comic_deep_dives (beat_id, created_at desc)
  where beat_id is not null;

grant select (options, beat_id) on public.comic_deep_dives to authenticated;

alter table public.comic_newsroom_beats enable row level security;
revoke all on public.comic_newsroom_beats from anon, authenticated;
grant select on public.comic_newsroom_beats to authenticated;
create policy "Owners read their beats"
  on public.comic_newsroom_beats for select to authenticated
  using (user_id = (select auth.uid()));

-- Once a minute: file the beats that are due, and wake stories whose worker
-- died. Same secret as the other ticks.
select cron.schedule(
  'newsroom-tick',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://www.palmframe.com/api/newsroom/tick',
      headers := jsonb_build_object('Authorization', 'Bearer ' || s.decrypted_secret),
      timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets s
    where s.name = 'machines_cron_secret'
  $job$
);
