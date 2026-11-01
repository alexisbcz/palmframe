-- Manuscripts written at the Desk: novels, poems and screenplays. `data` is the
-- whole document, so a save is one row. Private to its author; nothing here is
-- published.
create table public.comic_manuscripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('novel', 'poetry', 'screenplay')),
  title text not null default '' check (char_length(title) <= 200),
  words integer not null default 0,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  -- Bumped on every save so a stale tab cannot overwrite a newer one.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comic_manuscripts_user_updated_idx
  on public.comic_manuscripts (user_id, updated_at desc);

create trigger comic_manuscripts_touch
  before update on public.comic_manuscripts
  for each row execute function public.comic_projects_touch();

alter table public.comic_manuscripts enable row level security;

revoke all on public.comic_manuscripts from anon;
grant select, insert, update, delete on public.comic_manuscripts to authenticated;

create policy "Owners read their manuscripts"
  on public.comic_manuscripts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners create manuscripts"
  on public.comic_manuscripts for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners update their manuscripts"
  on public.comic_manuscripts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Owners delete their manuscripts"
  on public.comic_manuscripts for delete to authenticated
  using (user_id = (select auth.uid()));

-- Named drafts of a manuscript, kept whole so one can be restored.
create table public.comic_manuscript_drafts (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.comic_manuscripts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 120),
  words integer not null default 0,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now()
);

create index comic_manuscript_drafts_manuscript_idx
  on public.comic_manuscript_drafts (manuscript_id, created_at desc);

alter table public.comic_manuscript_drafts enable row level security;

revoke all on public.comic_manuscript_drafts from anon;
grant select, insert, delete on public.comic_manuscript_drafts to authenticated;

create policy "Owners read their manuscript drafts"
  on public.comic_manuscript_drafts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners keep manuscript drafts"
  on public.comic_manuscript_drafts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.comic_manuscripts m
      where m.id = manuscript_id and m.user_id = (select auth.uid())
    )
  );

create policy "Owners delete their manuscript drafts"
  on public.comic_manuscript_drafts for delete to authenticated
  using (user_id = (select auth.uid()));
