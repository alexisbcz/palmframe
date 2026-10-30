-- Which model drew an asset's image. Null for uploads and anything without one.
alter table public.comic_assets
  add column model text check (char_length(model) <= 120);
