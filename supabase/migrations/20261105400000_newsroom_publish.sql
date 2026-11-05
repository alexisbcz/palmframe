-- Newsroom publications: each person's stories hosted at /n/:slug, with a
-- newsletter and social posts prepared from each story. Everything here is
-- written by the server; owners can read their own rows.

create table public.comic_newsrooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (char_length(name) between 1 and 80),
  tagline text not null default '' check (char_length(tagline) <= 200),
  accent text not null default '#3d7bff' check (accent ~ '^#[0-9a-f]{6}$'),
  -- Off: the address shows nothing. Indexable: search engines may list it.
  live boolean not null default false,
  indexable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger comic_newsrooms_touch
  before update on public.comic_newsrooms
  for each row execute function public.comic_projects_touch();

-- A story is on the publication while published_at is set.
alter table public.comic_deep_dives
  add column slug text check (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'),
  add column published_at timestamptz;

create unique index comic_deep_dives_slug_idx on public.comic_deep_dives (user_id, slug)
  where slug is not null;
create index comic_deep_dives_published_idx on public.comic_deep_dives (user_id, published_at desc)
  where published_at is not null;

grant select (slug, published_at) on public.comic_deep_dives to authenticated;

create table public.comic_newsroom_subscribers (
  id uuid primary key default gen_random_uuid(),
  newsroom_id uuid not null references public.comic_newsrooms (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  -- In every email's unsubscribe link; never shown to the owner.
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  unique (newsroom_id, email)
);

create index comic_newsroom_subscribers_list_idx
  on public.comic_newsroom_subscribers (newsroom_id, created_at desc);

create table public.comic_newsroom_issues (
  id uuid primary key default gen_random_uuid(),
  newsroom_id uuid not null references public.comic_newsrooms (id) on delete cascade,
  story_id uuid not null references public.comic_deep_dives (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 200),
  -- held: written but no mail provider is connected yet.
  status text not null default 'held' check (status in ('held', 'sending', 'sent', 'failed')),
  provider text not null default '',
  recipients integer not null default 0,
  error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index comic_newsroom_issues_list_idx
  on public.comic_newsroom_issues (newsroom_id, created_at desc);

create table public.comic_newsroom_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null references public.comic_deep_dives (id) on delete cascade,
  platform text not null check (platform in ('linkedin', 'x', 'bluesky', 'facebook')),
  text text not null check (char_length(text) <= 5000),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'failed')),
  provider text not null default '',
  provider_post_id text,
  scheduled_for timestamptz,
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, platform)
);

create trigger comic_newsroom_posts_touch
  before update on public.comic_newsroom_posts
  for each row execute function public.comic_projects_touch();

alter table public.comic_newsrooms enable row level security;
alter table public.comic_newsroom_subscribers enable row level security;
alter table public.comic_newsroom_issues enable row level security;
alter table public.comic_newsroom_posts enable row level security;
revoke all on public.comic_newsrooms, public.comic_newsroom_subscribers,
  public.comic_newsroom_issues, public.comic_newsroom_posts from anon, authenticated;

grant select on public.comic_newsrooms, public.comic_newsroom_issues,
  public.comic_newsroom_posts to authenticated;
grant select (id, newsroom_id, email, status, created_at, unsubscribed_at)
  on public.comic_newsroom_subscribers to authenticated;

create policy "Owners read their newsroom"
  on public.comic_newsrooms for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owners read their subscribers"
  on public.comic_newsroom_subscribers for select to authenticated
  using (newsroom_id in (select id from public.comic_newsrooms where user_id = (select auth.uid())));
create policy "Owners read their issues"
  on public.comic_newsroom_issues for select to authenticated
  using (newsroom_id in (select id from public.comic_newsrooms where user_id = (select auth.uid())));
create policy "Owners read their posts"
  on public.comic_newsroom_posts for select to authenticated
  using (user_id = (select auth.uid()));
