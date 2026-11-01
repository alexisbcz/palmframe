-- Comics to anime: an episode is a comic's panels, directed into shots. Each
-- shot goes through its own keyframe, voice and video stages, because a person
-- retries one shot at a time and a run outlives any single function call.
create table public.comic_anime_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  source text not null check (source in ('file', 'project')),
  project_id uuid references public.comic_projects (id) on delete set null,
  rtl boolean not null default false,
  -- Who confirmed they may adapt an uploaded comic, and when.
  rights_confirmed_at timestamptz,
  -- uploading: panels on their way. directing: the director is reading them.
  -- ready: shots can be edited and rendered.
  status text not null default 'uploading'
    check (status in ('uploading', 'directing', 'ready')),
  settings jsonb not null,
  cast_list jsonb not null default '[]',
  directed integer not null default 0 check (directed >= 0),
  director_error text,
  final_path text,
  final_at timestamptz,
  -- One runner at a time.
  leased_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_anime_episodes_user_idx
  on public.comic_anime_episodes (user_id, updated_at desc);

create table public.comic_anime_shots (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.comic_anime_episodes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null check (position >= 0),
  page integer not null default 0 check (page >= 0),
  panel_path text not null,
  -- Lettering the comic already holds as text, for the director to read.
  hint text not null default '' check (char_length(hint) <= 4000),
  skip boolean not null default false,
  action text not null default '' check (char_length(action) <= 2000),
  dialogue jsonb not null default '[]',
  duration integer not null default 5 check (duration between 1 and 30),
  camera jsonb not null default '{}',
  keyframe_status text not null default 'none'
    check (keyframe_status in ('none', 'queued', 'working', 'ready', 'failed')),
  keyframe_path text,
  keyframe_error text,
  voice_status text not null default 'none'
    check (voice_status in ('none', 'queued', 'working', 'ready', 'failed')),
  voice_path text,
  voice_error text,
  -- submitting holds a claimed shot during the call that spends money. One
  -- left behind by a dead function fails, and is never sent twice on its own.
  video_status text not null default 'none'
    check (video_status in ('none', 'queued', 'submitting', 'rendering', 'ready', 'failed')),
  video_job text,
  video_path text,
  video_error text,
  video_cost numeric(10, 4),
  leased_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_anime_shots_episode_idx
  on public.comic_anime_shots (episode_id, position);

-- What the once-a-minute tick looks for.
create index comic_anime_shots_active_idx
  on public.comic_anime_shots (episode_id)
  where keyframe_status in ('queued', 'working')
    or voice_status in ('queued', 'working')
    or video_status in ('queued', 'submitting', 'rendering');

create function public.comic_anime_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger comic_anime_episodes_touch
  before update on public.comic_anime_episodes
  for each row execute function public.comic_anime_touch();

create trigger comic_anime_shots_touch
  before update on public.comic_anime_shots
  for each row execute function public.comic_anime_touch();

alter table public.comic_anime_episodes enable row level security;
alter table public.comic_anime_shots enable row level security;

-- People read their rows and the server writes them. Paths in these rows get
-- signed and read with the service key, so a row a person could edit would let
-- them point at someone else's private file.
revoke all on public.comic_anime_episodes from anon, authenticated;
revoke all on public.comic_anime_shots from anon, authenticated;
grant select on public.comic_anime_episodes to authenticated;
grant select on public.comic_anime_shots to authenticated;

create policy "Owners read their episodes"
  on public.comic_anime_episodes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners read their shots"
  on public.comic_anime_shots for select to authenticated
  using (user_id = (select auth.uid()));

-- Private: an upload can be someone else's published comic, so nothing here
-- gets a public URL. Reads go through short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anime',
  'anime',
  false,
  524288000,
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'audio/mpeg']
)
on conflict (id) do nothing;

create policy "Owners read their anime files"
  on storage.objects for select to authenticated
  using (bucket_id = 'anime' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners upload anime files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'anime' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners replace their anime files"
  on storage.objects for update to authenticated
  using (bucket_id = 'anime' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners delete their anime files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'anime' and (storage.foldername(name))[1] = (select auth.uid())::text);
