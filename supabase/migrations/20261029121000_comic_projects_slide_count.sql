-- Lets the projects list show slide counts without loading every project.
alter table public.comic_projects
  add column slide_count integer
  generated always as (coalesce(jsonb_array_length(data -> 'pages'), 0)) stored;
