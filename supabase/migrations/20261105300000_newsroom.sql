-- Newsroom: a deep dive can follow a template (wire, explainer, profile...)
-- and carry a cover picture. Studio's own stories keep a null template.
alter table public.comic_deep_dives
  add column template text
    check (template in ('wire', 'breakdown', 'explainer', 'feature', 'profile', 'pulse')),
  add column cover jsonb not null default '{}';

create index comic_deep_dives_template_idx on public.comic_deep_dives (user_id, created_at desc)
  where template is not null;

grant select (template, cover) on public.comic_deep_dives to authenticated;
