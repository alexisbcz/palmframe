-- Studio: brand kits read from a website, and storyboards made from a source
-- (an ad, a video, a product page). A storyboard can become a comic project.
create table public.comic_brand_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  domain text not null check (char_length(domain) between 3 and 253),
  name text not null check (char_length(name) between 1 and 120),
  slogan text not null default '' check (char_length(slogan) <= 300),
  description text not null default '' check (char_length(description) <= 2000),
  colors jsonb not null default '[]',
  logos jsonb not null default '[]',
  fonts jsonb not null default '[]',
  -- How posts should sound. Starts from the site's own words; the owner edits it.
  voice text not null default '' check (char_length(voice) <= 1000),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, domain)
);

-- At most one kit is in use at a time.
create unique index comic_brand_kits_active_idx
  on public.comic_brand_kits (user_id) where active;

create function public.comic_brand_kits_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 2));
  if (select count(*) from public.comic_brand_kits where user_id = new.user_id) >= 5 then
    raise exception 'Brand kit limit reached' using errcode = 'P0429';
  end if;
  return new;
end;
$$;

create trigger comic_brand_kits_limit
  before insert on public.comic_brand_kits
  for each row execute function public.comic_brand_kits_limit();

create table public.comic_studio_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('ad', 'video', 'product')),
  title text not null check (char_length(title) between 1 and 200),
  -- What the board was made from (StudioSource).
  source jsonb not null,
  -- The hook, angle, reasons and scenes (Board).
  board jsonb not null,
  brand_id uuid references public.comic_brand_kits (id) on delete set null,
  project_id uuid references public.comic_projects (id) on delete set null,
  prompt text,
  created_at timestamptz not null default now()
);

create index comic_studio_boards_user_idx
  on public.comic_studio_boards (user_id, created_at desc);

alter table public.comic_brand_kits enable row level security;
alter table public.comic_studio_boards enable row level security;

revoke all on public.comic_brand_kits, public.comic_studio_boards from anon;
grant select, insert, update, delete on public.comic_brand_kits to authenticated;
grant select, insert, update, delete on public.comic_studio_boards to authenticated;

create policy "Owners read their brand kits"
  on public.comic_brand_kits for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owners create brand kits"
  on public.comic_brand_kits for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Owners update their brand kits"
  on public.comic_brand_kits for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Owners delete their brand kits"
  on public.comic_brand_kits for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners read their boards"
  on public.comic_studio_boards for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owners create boards"
  on public.comic_studio_boards for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Owners update their boards"
  on public.comic_studio_boards for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Owners delete their boards"
  on public.comic_studio_boards for delete to authenticated
  using (user_id = (select auth.uid()));
