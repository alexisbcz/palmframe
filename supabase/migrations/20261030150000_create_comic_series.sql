-- Series: carousels of one account that share a cast, a world and a list of
-- facts. Each carousel keeps its own full copy of the cast and world in
-- `comic_projects.data`, so it still opens and renders alone; these rows are
-- the shared version, merged into a carousel when it's opened.
create table public.comic_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  -- Character[] and WorldItem[], as in ComicProject. Images are URLs.
  characters jsonb not null default '[]' check (jsonb_typeof(characters) = 'array'),
  world jsonb not null default '[]' check (jsonb_typeof(world) = 'array'),
  -- Short lines the story planner has to respect.
  facts text[] not null default '{}' check (cardinality(facts) <= 60),
  -- Bumped on every write, so two carousels saving at once both land.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The target of the foreign key below.
  unique (id, user_id)
);

create index comic_series_user_idx on public.comic_series (user_id, created_at);

create trigger comic_series_touch
  before update on public.comic_series
  for each row execute function public.comic_projects_touch();

alter table public.comic_series enable row level security;

revoke all on public.comic_series from anon;
grant select, insert, update, delete on public.comic_series to authenticated;

create policy "Owners read their series"
  on public.comic_series for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create series"
  on public.comic_series for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their series"
  on public.comic_series for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners delete their series"
  on public.comic_series for delete to authenticated
  using (user_id = (select auth.uid()));

-- Foreign keys skip row-level security, so the key includes `user_id`: a
-- carousel can only join a series of the same account, even with a guessed id.
-- Deleting a series leaves its carousels, and only clears `series_id`.
alter table public.comic_projects
  add column series_id uuid,
  -- Its place in the series; only the order means anything, gaps are fine.
  add column series_position integer,
  add constraint comic_projects_series_fkey
    foreign key (series_id, user_id)
    references public.comic_series (id, user_id)
    on delete set null (series_id);

create index comic_projects_series_idx
  on public.comic_projects (series_id, series_position)
  where series_id is not null;
