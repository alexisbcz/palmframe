-- Styles learned from comics people upload. A style holds a written analysis
-- and a few downscaled reference pages; the source file never leaves the
-- browser. Styles are private to their owner and are never published.
create table public.comic_styles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- Draft until its pages are in and the analysis has come back.
  status text not null default 'draft' check (status in ('draft', 'ready')),
  -- When the owner confirmed they may use these pages for reference.
  rights_confirmed_at timestamptz not null,
  -- Storage paths in `comic-style-refs`, in the order they were picked.
  pages text[] not null check (cardinality(pages) between 1 and 8),
  -- { prose, tags, negative }: see StyleAnalysis.
  analysis jsonb check (analysis is null or jsonb_typeof(analysis) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'draft' or analysis is not null)
);

create index comic_styles_user_idx on public.comic_styles (user_id, created_at desc);

create trigger comic_styles_touch
  before update on public.comic_styles
  for each row execute function public.comic_projects_touch();

alter table public.comic_styles enable row level security;

-- Hard limit per person, drafts included. `prepareStyle` checks first; this
-- settles two requests racing past that check.
create function public.comic_styles_quota()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('comic_styles:' || new.user_id::text, 0));
  if (select count(*) from public.comic_styles where user_id = new.user_id) >= 50 then
    raise exception 'style limit reached' using errcode = 'P0409';
  end if;
  return new;
end;
$$;

create trigger comic_styles_quota
  before insert on public.comic_styles
  for each row execute function public.comic_styles_quota();

alter table public.comic_styles enable row level security;

-- Owners read. Every write comes from the server with the admin client, after
-- its checks: a row with a borrowed `pages` path, a deleted row that strands
-- its pages, or a style turned ready by hand are all out of reach.
revoke all on public.comic_styles from anon, authenticated;
grant select on public.comic_styles to authenticated;

create policy "Owners read their styles"
  on public.comic_styles for select to authenticated
  using (user_id = (select auth.uid()));

-- Private, unlike `comics`: these are pages of someone else's work, so they
-- are only reachable through short-lived signed URLs. Under `<user id>/`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comic-style-refs',
  'comic-style-refs',
  false,
  8388608,
  array['image/jpeg']
)
on conflict (id) do nothing;

-- Read only, on purpose. Uploads arrive on one-time signed slots issued after
-- the quota check, and without insert, update or delete here a page can't be
-- swapped once it has been analyzed: renders sign whatever sits at the path.
create policy "Owners read their style pages"
  on storage.objects for select to authenticated
  using (bucket_id = 'comic-style-refs' and (storage.foldername(name))[1] = (select auth.uid())::text);
