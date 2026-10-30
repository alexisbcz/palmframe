-- Reader links: an unlisted, read-only link to one project. A project has a
-- link while this token is set; clearing it revokes the link for good, since
-- a new one gets a new token.
--
-- Nothing here opens the table: anon keeps no grants on comic_projects and the
-- owner policies are unchanged, so people only ever see their own tokens. The
-- /read/:token route looks a project up by exact token on the server, with the
-- secret key, and sends the browser only what it takes to draw the slides.
alter table public.comic_projects
  add column share_token text
  constraint comic_projects_share_token_format
    -- 32 random bytes in base64url. Owners can write this column, so the
    -- database is what keeps a short or malformed token out.
    check (share_token ~ '^[A-Za-z0-9_-]{43}$');

create unique index comic_projects_share_token_idx
  on public.comic_projects (share_token)
  where share_token is not null;
