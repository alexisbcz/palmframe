-- Websites built in Frontage. `data` is the working copy the editor saves.
-- Visitors only ever get a release, a snapshot taken on publish, so edits stay
-- private until the owner publishes them.
create table public.comic_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),
  template text not null default '' check (char_length(template) <= 60),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  -- Bumped on every save so a stale tab cannot overwrite a newer one.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_sites_user_updated_idx
  on public.comic_sites (user_id, updated_at desc);

create trigger comic_sites_touch
  before update on public.comic_sites
  for each row execute function public.comic_projects_touch();

alter table public.comic_sites enable row level security;

revoke all on public.comic_sites from anon;
grant select, insert, update, delete on public.comic_sites to authenticated;

create policy "Owners read their sites"
  on public.comic_sites for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create sites"
  on public.comic_sites for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their sites"
  on public.comic_sites for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners delete their sites"
  on public.comic_sites for delete to authenticated
  using (user_id = (select auth.uid()));

-- What /s/:slug serves. Visitors read it through comic_site_release, one slug
-- at a time, so the table can't be listed with the publishable key.
create table public.comic_site_releases (
  site_id uuid primary key references public.comic_sites (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  title text not null default '' check (char_length(title) <= 120),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  indexable boolean not null default false,
  version integer not null default 1,
  published_at timestamptz not null default now()
);

alter table public.comic_site_releases enable row level security;

revoke all on public.comic_site_releases from anon;
grant select, insert, update, delete on public.comic_site_releases to authenticated;

create policy "Owners read their releases"
  on public.comic_site_releases for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners publish their sites"
  on public.comic_site_releases for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.comic_sites s
      where s.id = site_id and s.user_id = (select auth.uid())
    )
  );

create policy "Owners update their releases"
  on public.comic_site_releases for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners withdraw their releases"
  on public.comic_site_releases for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.comic_site_release(p_slug text)
returns table (
  site_id uuid,
  slug text,
  title text,
  data jsonb,
  indexable boolean,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.site_id, r.slug, r.title, r.data, r.indexable, r.published_at
  from public.comic_site_releases r
  where r.slug = p_slug;
$$;

revoke all on function public.comic_site_release(text) from public;
grant execute on function public.comic_site_release(text) to anon, authenticated;

-- One snapshot per publish, so an owner can go back to any of them.
create table public.comic_site_versions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.comic_sites (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version integer not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  unique (site_id, version)
);

alter table public.comic_site_versions enable row level security;

revoke all on public.comic_site_versions from anon;
grant select, insert, delete on public.comic_site_versions to authenticated;

create policy "Owners read their versions"
  on public.comic_site_versions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners add versions"
  on public.comic_site_versions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.comic_sites s
      where s.id = site_id and s.user_id = (select auth.uid())
    )
  );

create policy "Owners delete their versions"
  on public.comic_site_versions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Everything visitors send: form entries, bookings, orders, RSVPs and newsletter
-- sign-ups. Rows arrive only through comic_site_submit, from the server, which
-- checks them against the release and works out order totals itself.
create table public.comic_site_submissions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.comic_sites (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('form', 'booking', 'order', 'rsvp', 'newsletter')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  -- The booked time, as `<service id>@<iso date time>`. Null for everything else.
  slot text check (char_length(slot) <= 120),
  status text not null default 'new' check (status in ('new', 'read', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);

create index comic_site_submissions_site_idx
  on public.comic_site_submissions (site_id, created_at desc);

-- One booking per time, even when two visitors press the button together.
create unique index comic_site_submissions_slot_idx
  on public.comic_site_submissions (site_id, slot)
  where slot is not null and status <> 'cancelled';

alter table public.comic_site_submissions enable row level security;

revoke all on public.comic_site_submissions from anon;
grant select, update, delete on public.comic_site_submissions to authenticated;

create policy "Owners read their submissions"
  on public.comic_site_submissions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners update their submissions"
  on public.comic_site_submissions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners delete their submissions"
  on public.comic_site_submissions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Returns 'ok', 'taken' for a slot that went first, 'limited' past the caps.
create function public.comic_site_submit(
  p_slug text,
  p_kind text,
  p_data jsonb,
  p_slot text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site uuid;
  v_user uuid;
begin
  select r.site_id, r.user_id into v_site, v_user
  from public.comic_site_releases r
  where r.slug = p_slug;
  if v_site is null then
    return 'limited';
  end if;
  if octet_length(p_data::text) > 16384 then
    return 'limited';
  end if;
  if (
    select count(*) from public.comic_site_submissions s
    where s.site_id = v_site and s.created_at > now() - interval '1 hour'
  ) >= 120 then
    return 'limited';
  end if;
  begin
    insert into public.comic_site_submissions (site_id, user_id, kind, data, slot)
    values (v_site, v_user, p_kind, p_data, p_slot);
  exception when unique_violation then
    return 'taken';
  end;
  return 'ok';
end;
$$;

revoke all on function public.comic_site_submit(text, text, jsonb, text) from public;
revoke all on function public.comic_site_submit(text, text, jsonb, text) from anon, authenticated;
grant execute on function public.comic_site_submit(text, text, jsonb, text) to service_role;

-- The times already booked on a site, and nothing about who booked them.
create function public.comic_site_taken(p_slug text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select s.slot
  from public.comic_site_submissions s
  join public.comic_site_releases r on r.site_id = s.site_id
  where r.slug = p_slug and s.slot is not null and s.status <> 'cancelled';
$$;

revoke all on function public.comic_site_taken(text) from public;
grant execute on function public.comic_site_taken(text) to anon, authenticated;

-- A count per page and day. No visitor is identified or stored.
create table public.comic_site_views (
  site_id uuid not null references public.comic_sites (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  path text not null check (char_length(path) <= 200),
  views integer not null default 0,
  primary key (site_id, day, path)
);

alter table public.comic_site_views enable row level security;

revoke all on public.comic_site_views from anon;
grant select on public.comic_site_views to authenticated;

create policy "Owners read their views"
  on public.comic_site_views for select to authenticated
  using (
    exists (
      select 1 from public.comic_sites s
      where s.id = site_id and s.user_id = (select auth.uid())
    )
  );

create function public.comic_site_viewed(p_slug text, p_path text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.comic_site_views (site_id, path, views)
  select r.site_id, left(p_path, 200), 1
  from public.comic_site_releases r
  where r.slug = p_slug
  on conflict (site_id, day, path)
  do update set views = public.comic_site_views.views + 1;
$$;

revoke all on function public.comic_site_viewed(text, text) from public;
revoke all on function public.comic_site_viewed(text, text) from anon, authenticated;
grant execute on function public.comic_site_viewed(text, text) to service_role;
