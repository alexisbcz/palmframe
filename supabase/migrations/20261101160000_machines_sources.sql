-- What the runner remembers about each feed. It lives apart from
-- comic_machines.state, which every save wipes, and apart from the inbox, which
-- is pruned after two weeks while a slow dataset keeps returning older rows.
-- Written only by the server.
create table public.comic_machine_feed_state (
  machine_id uuid not null references public.comic_machines (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  feed_key text not null check (char_length(feed_key) between 1 and 600),
  -- Item keys a dataset has returned, newest first. The first read lands here and
  -- never in the inbox, because a backlog isn't news.
  seen jsonb not null default '[]'
    check (jsonb_typeof(seen) = 'array' and jsonb_array_length(seen) <= 500),
  outcome text not null default 'ok'
    check (outcome in ('ok', 'busy', 'unreadable', 'failed')),
  failures integer not null default 0 check (failures >= 0),
  last_read_at timestamptz,
  last_ok_at timestamptz,
  last_item_at timestamptz,
  last_item_title text check (char_length(last_item_title) <= 500),
  updated_at timestamptz not null default now(),
  primary key (machine_id, feed_key)
);

create trigger comic_machine_feed_state_touch
  before update on public.comic_machine_feed_state
  for each row execute function public.comic_projects_touch();

alter table public.comic_machine_feed_state enable row level security;
revoke all on public.comic_machine_feed_state from anon, authenticated;
grant select on public.comic_machine_feed_state to authenticated;
create policy "Owners read their machine feed state"
  on public.comic_machine_feed_state for select to authenticated
  using (user_id = (select auth.uid()));

-- A foil is another outlet's post, there to be answered. It never counts as
-- evidence for anything the machine states.
alter table public.comic_machine_items
  add column role text not null default 'fact' check (role in ('fact', 'foil'));
