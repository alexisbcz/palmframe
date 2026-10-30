-- Whole comics in the catalog. `project` is a snapshot taken at publish time,
-- so later edits to the carousel stay private until it's published again.
-- It's kept out of `payload` so that listing the catalog stays light.
alter table public.comic_assets
  add column project jsonb check (project is null or jsonb_typeof(project) = 'object'),
  -- The carousel it came from. Deleting that leaves the published comic.
  add column source_project uuid references public.comic_projects (id) on delete set null;

-- Publishing a carousel again updates its catalog entry.
create unique index comic_assets_source_project_idx
  on public.comic_assets (user_id, source_project)
  where source_project is not null;
