-- Comic carousels made in the canvas editor. The database is shared with the
-- palmframe editor app, hence the `comic_` prefix.
create table public.comic_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  -- The editor's ComicProject. Images are URLs into the `comics` bucket.
  data jsonb not null,
  -- Public URL of a small render of the first slide.
  cover text,
  -- Bumped on every save so a stale tab cannot overwrite a newer one.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_projects_user_updated_idx
  on public.comic_projects (user_id, updated_at desc);

create function public.comic_projects_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger comic_projects_touch
  before update on public.comic_projects
  for each row execute function public.comic_projects_touch();

alter table public.comic_projects enable row level security;

revoke all on public.comic_projects from anon;
grant select, insert, update, delete on public.comic_projects to authenticated;

create policy "Owners read their comics"
  on public.comic_projects for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create comics"
  on public.comic_projects for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their comics"
  on public.comic_projects for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners delete their comics"
  on public.comic_projects for delete to authenticated
  using (user_id = (select auth.uid()));

-- Panel images, portraits and covers, under `<user id>/`. Public so the
-- canvas can draw them without signing each URL; paths are content hashes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comics',
  'comics',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "Owners read their comic images"
  on storage.objects for select to authenticated
  using (bucket_id = 'comics' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners upload comic images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'comics' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners replace their comic images"
  on storage.objects for update to authenticated
  using (bucket_id = 'comics' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners delete their comic images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'comics' and (storage.foldername(name))[1] = (select auth.uid())::text);
