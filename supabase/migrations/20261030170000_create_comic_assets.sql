-- The public catalog: reusable characters, places, looks and direction. The
-- official assets ship with the app, so `comic_assets` holds what people make.
-- Using an asset copies it into a carousel, which never depends on this table.
create table public.comic_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Their display name when published. Null: shown as anonymous.
  author_name text check (char_length(author_name) <= 80),
  kind text not null check (kind ~ '^[a-z]{2,20}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 400),
  genres text[] not null default '{}' check (cardinality(genres) <= 4),
  -- The dominant colour, one of the palette ids or `mono`.
  color text check (char_length(color) <= 10),
  -- A URL under the author's folder of the `comics` bucket.
  image text,
  -- What using it does; see AssetPayload.
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  is_public boolean not null default false,
  -- Set by reports or by hand. Hidden assets stay readable by their author.
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_assets_public_idx
  on public.comic_assets (created_at desc)
  where is_public and not hidden;
create index comic_assets_user_idx on public.comic_assets (user_id, created_at desc);

create trigger comic_assets_touch
  before update on public.comic_assets
  for each row execute function public.comic_projects_touch();

alter table public.comic_assets enable row level security;

-- Writes go through the server, which validates them and sets the author:
-- signed-in people can only read and delete here.
revoke all on public.comic_assets from anon, authenticated;
grant select on public.comic_assets to anon, authenticated;
grant delete on public.comic_assets to authenticated;

create policy "Everyone reads public assets"
  on public.comic_assets for select to anon, authenticated
  using (is_public and not hidden);

create policy "Owners read their assets"
  on public.comic_assets for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners delete their assets"
  on public.comic_assets for delete to authenticated
  using (user_id = (select auth.uid()));

-- Saves and uses are per person, and keyed by text so they also cover the
-- official assets, whose ids aren't uuids.
create table public.comic_asset_saves (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id text not null check (char_length(asset_id) <= 64),
  created_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);

create index comic_asset_saves_asset_idx on public.comic_asset_saves (asset_id);

alter table public.comic_asset_saves enable row level security;
revoke all on public.comic_asset_saves from anon, authenticated;
grant select, insert, delete on public.comic_asset_saves to authenticated;

create policy "People read their saves"
  on public.comic_asset_saves for select to authenticated
  using (user_id = (select auth.uid()));

create policy "People save for themselves"
  on public.comic_asset_saves for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "People remove their saves"
  on public.comic_asset_saves for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.comic_asset_uses (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id text not null check (char_length(asset_id) <= 64),
  created_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);

create index comic_asset_uses_asset_idx on public.comic_asset_uses (asset_id);

alter table public.comic_asset_uses enable row level security;
revoke all on public.comic_asset_uses from anon, authenticated;
-- `on conflict` reads the key, so recording a use needs select too.
grant select, insert on public.comic_asset_uses to authenticated;

create policy "People read their uses"
  on public.comic_asset_uses for select to authenticated
  using (user_id = (select auth.uid()));

create policy "People record their own use"
  on public.comic_asset_uses for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Totals are public, who saved or used what is not.
create function public.comic_asset_stats()
returns table (asset_id text, saves bigint, uses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select id, sum(s)::bigint, sum(u)::bigint
  from (
    select asset_id as id, 1 as s, 0 as u from public.comic_asset_saves
    union all
    select asset_id, 0, 1 from public.comic_asset_uses
  ) counted
  group by id;
$$;

revoke all on function public.comic_asset_stats() from public;
grant execute on function public.comic_asset_stats() to anon, authenticated;

-- Reports. Three people reporting an asset take it down until it's reviewed.
create table public.comic_asset_reports (
  asset_id uuid not null references public.comic_assets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('sexual', 'minor', 'hate', 'copyright', 'else')),
  created_at timestamptz not null default now(),
  primary key (asset_id, user_id)
);

-- No policies and no grants: only the server reads and writes reports.
alter table public.comic_asset_reports enable row level security;
revoke all on public.comic_asset_reports from anon, authenticated;

create function public.comic_asset_reported()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A single report of sexualised minors is enough to take it down.
  if new.reason = 'minor' or (
    select count(*) from public.comic_asset_reports where asset_id = new.asset_id
  ) >= 3 then
    update public.comic_assets set hidden = true where id = new.asset_id;
  end if;
  return new;
end;
$$;

create trigger comic_asset_reported
  after insert on public.comic_asset_reports
  for each row execute function public.comic_asset_reported();
