-- Visual novels made in the Stage. `data` is the working copy, the one the
-- editor saves. Readers only ever see a release, a snapshot taken on publish,
-- so edits stay private until the author releases them.
create table public.comic_novels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  cover text,
  -- Bumped on every save so a stale tab cannot overwrite a newer one.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_novels_user_updated_idx
  on public.comic_novels (user_id, updated_at desc);

create trigger comic_novels_touch
  before update on public.comic_novels
  for each row execute function public.comic_projects_touch();

alter table public.comic_novels enable row level security;

revoke all on public.comic_novels from anon;
grant select, insert, update, delete on public.comic_novels to authenticated;

create policy "Owners read their novels"
  on public.comic_novels for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create novels"
  on public.comic_novels for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their novels"
  on public.comic_novels for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners delete their novels"
  on public.comic_novels for delete to authenticated
  using (user_id = (select auth.uid()));

-- What a link at /vn/:slug plays. Anyone with the link can read a release, and
-- nothing lists them, so a release is as public as the link it was given to.
create table public.comic_novel_releases (
  novel_id uuid primary key references public.comic_novels (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title text not null default '' check (char_length(title) <= 120),
  synopsis text not null default '' check (char_length(synopsis) <= 2000),
  cover text,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  plays integer not null default 0,
  published_at timestamptz not null default now()
);

alter table public.comic_novel_releases enable row level security;

revoke all on public.comic_novel_releases from anon;
grant select (novel_id, slug, title, synopsis, cover, data, plays, published_at)
  on public.comic_novel_releases to anon;
grant select, insert, update, delete on public.comic_novel_releases to authenticated;

create policy "Anyone reads a release"
  on public.comic_novel_releases for select to anon, authenticated
  using (true);

create policy "Owners release their novels"
  on public.comic_novel_releases for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.comic_novels n
      where n.id = novel_id and n.user_id = (select auth.uid())
    )
  );

create policy "Owners update their releases"
  on public.comic_novel_releases for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners withdraw their releases"
  on public.comic_novel_releases for delete to authenticated
  using (user_id = (select auth.uid()));

-- Counts a play, and nothing else. Readers can't update a release themselves.
create function public.comic_novel_played(p_slug text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.comic_novel_releases set plays = plays + 1 where slug = p_slug;
$$;

revoke all on function public.comic_novel_played(text) from public;
grant execute on function public.comic_novel_played(text) to anon, authenticated;

-- Music, ambience, sound effects and recorded voices, under `<user id>/`. The
-- `comics` bucket only takes images. Public, because readers stream these.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'novel-audio',
  'novel-audio',
  true,
  31457280,
  array[
    'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav',
    'audio/wave', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
    'audio/flac', 'audio/opus'
  ]
)
on conflict (id) do nothing;

create policy "Owners upload novel audio"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'novel-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners replace novel audio"
  on storage.objects for update to authenticated
  using (bucket_id = 'novel-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners delete novel audio"
  on storage.objects for delete to authenticated
  using (bucket_id = 'novel-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
