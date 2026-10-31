-- Content machines become media: each one keeps an inbox of what its sources
-- said, an agent turns that into posts on a schedule, and posts go out to the
-- owner's connected accounts and to a public page.
alter table public.comic_machines
  add column next_run_at timestamptz,
  -- 'review' waits for the owner. 'auto' posts without asking.
  add column publish_mode text not null default 'review'
    check (publish_mode in ('review', 'auto')),
  -- The connected accounts this machine posts to (MachineOutput[]).
  add column outputs jsonb not null default '[]',
  -- Failed runs in a row. The runner pauses the machine after a few.
  add column failures integer not null default 0,
  -- A public page at /m/:slug, with an RSS feed.
  add column slug text unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'),
  add column public boolean not null default false;

create index comic_machines_next_run_idx on public.comic_machines (next_run_at nulls first)
  where enabled;

-- Everything a machine has heard, once. Written only by the server.
create table public.comic_machine_items (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.comic_machines (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) <= 300),
  source text not null check (char_length(source) <= 120),
  title text not null check (char_length(title) <= 500),
  summary text not null default '' check (char_length(summary) <= 2000),
  url text not null check (url like 'https://%' and char_length(url) <= 2000),
  published_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'used', 'skipped')),
  created_at timestamptz not null default now(),
  unique (machine_id, key)
);

create index comic_machine_items_inbox_idx
  on public.comic_machine_items (machine_id, published_at desc)
  where status = 'new';

alter table public.comic_machine_items enable row level security;
revoke all on public.comic_machine_items from anon;
grant select on public.comic_machine_items to authenticated;
create policy "Owners read their machine items"
  on public.comic_machine_items for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.comic_machine_drafts
  drop constraint comic_machine_drafts_status_check,
  add constraint comic_machine_drafts_status_check check (
    status in ('new', 'used', 'dismissed', 'approved', 'publishing', 'published', 'failed')
  ),
  alter column signal drop not null,
  -- The inbox items this post is built on: its evidence.
  add column sources jsonb not null default '[]',
  add column link text check (link is null or link like 'https://%'),
  add column image_url text check (image_url is null or image_url like 'https://%'),
  -- Why an auto machine held this post back for a person.
  add column held text check (char_length(held) <= 300),
  -- Per account: the post's address, or why it failed (PublishReceipt[]).
  add column receipts jsonb not null default '[]',
  add column published_at timestamptz;

create index comic_machine_drafts_queue_idx
  on public.comic_machine_drafts (created_at) where status = 'approved';
create index comic_machine_drafts_public_idx
  on public.comic_machine_drafts (machine_id, published_at desc) where status = 'published';

-- Owners can no longer write these directly: status and receipts decide what
-- gets published, so every change goes through the checked API.
drop policy "Owners create drafts" on public.comic_machine_drafts;
drop policy "Owners update their drafts" on public.comic_machine_drafts;
revoke insert, update on public.comic_machine_drafts from authenticated;

-- Images on a machine's posts are public by design: they go on its feed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machine-images', 'machine-images', true, 8388608, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
