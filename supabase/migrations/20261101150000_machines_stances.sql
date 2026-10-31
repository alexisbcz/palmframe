-- Declared political lines and funny styles. Both live in comic_machines.config,
-- so old rows parse as having neither. What's here is what a client must not be
-- able to skip: owners can write comic_machines directly through the API, so
-- these rules sit in a trigger, not only in the route.

alter table public.comic_machine_drafts
  -- The take as the agent wrote it, and why it was left out if it was.
  add column take text not null default '' check (char_length(take) <= 280),
  add column take_note text check (char_length(take_note) <= 300),
  -- What the standards desk said about these words. Null where it doesn't read.
  add column desk text check (desk in ('pass', 'hold', 'block', 'unread')),
  add column block_rule text check (char_length(block_rule) <= 40),
  add column retracted_at timestamptz,
  add column retract_reason text
    check (retract_reason in ('error', 'source', 'standards', 'owner')),
  drop constraint comic_machine_drafts_status_check,
  add constraint comic_machine_drafts_status_check check (
    status in ('new', 'used', 'dismissed', 'approved', 'publishing', 'published', 'failed', 'expired', 'blocked', 'retracted')
  );

alter table public.comic_machine_runs
  drop constraint comic_machine_runs_decision_check,
  add constraint comic_machine_runs_decision_check check (decision in (
    'running', 'filed', 'passed', 'refused', 'exhausted', 'invalid', 'failed', 'blocked',
    'empty', 'capped', 'ceiling', 'breaker', 'no_writer', 'no_credits', 'deadline', 'error',
    'frozen', 'no_calendar', 'not_public', 'no_desk'
  ));

-- A retracted post keeps its place on the public page, as a note.
create index comic_machine_drafts_page_idx
  on public.comic_machine_drafts (machine_id, published_at desc)
  where status in ('published', 'retracted');

-- One row per arena, kept by hand by staff. `reviewed_until` says someone has read
-- this arena's election dates up to that moment; past it, or with no row at all,
-- line machines in the arena don't run or publish. Deliberately empty here: no
-- date in this file has been reviewed by anyone. To open an arena:
--
--   insert into public.comic_arena_calendars (arena, reviewed_until, reviewed_by, windows)
--   values ('fr', '2027-01-01T00:00:00Z', 'name', '[{"from":"...","to":"...","label":"..."}]');
--
-- Nobody but the server reads it, so it has no policies.
create table public.comic_arena_calendars (
  arena text primary key check (arena ~ '^[a-z]{2}$'),
  reviewed_until timestamptz not null,
  reviewed_by text not null check (char_length(reviewed_by) between 1 and 120),
  -- [{ from, to, label }], ISO timestamps. Malformed counts as no calendar.
  windows jsonb not null default '[]' check (jsonb_typeof(windows) = 'array'),
  updated_at timestamptz not null default now()
);

create trigger comic_arena_calendars_touch
  before update on public.comic_arena_calendars
  for each row execute function public.comic_projects_touch();

alter table public.comic_arena_calendars enable row level security;
revoke all on public.comic_arena_calendars from anon, authenticated;

-- Every stance a machine has declared, shown on its public page. Written only by
-- the trigger below. It outlives the machine, so deleting one and starting over
-- doesn't reset the cooldown.
create table public.comic_machine_line_notes (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid references public.comic_machines (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  from_stance text,
  to_stance text,
  created_at timestamptz not null default now()
);

create index comic_machine_line_notes_user_idx
  on public.comic_machine_line_notes (user_id, created_at desc);
create index comic_machine_line_notes_machine_idx
  on public.comic_machine_line_notes (machine_id, created_at desc);

alter table public.comic_machine_line_notes enable row level security;
revoke all on public.comic_machine_line_notes from anon, authenticated;
grant select on public.comic_machine_line_notes to authenticated;
create policy "Owners read their line notes"
  on public.comic_machine_line_notes for select to authenticated
  using (user_id = (select auth.uid()));

-- The rules of a declared line, for anyone writing to comic_machines. The limits
-- match STANCE_COOLDOWN_DAYS and LINE_REVIEW_POSTS in lib/machines/stance.ts.
create function public.comic_machines_line_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_stance text := new.config -> 'line' ->> 'stance';
  old_stance text := case when tg_op = 'UPDATE' then old.config -> 'line' ->> 'stance' end;
  was_auto boolean := tg_op = 'UPDATE' and old.publish_mode = 'auto';
  since timestamptz;
begin
  if new_stance is null and old_stance is null then
    return new;
  end if;
  -- Two saves at once can't each see the other's stance.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 2));

  if new_stance is not null then
    if not new.public then
      raise exception 'A line machine needs its public page' using errcode = 'P0433';
    end if;
    if new_stance in ('far-left', 'far-right') and new.publish_mode <> 'review' then
      raise exception 'A far stance is always reviewed' using errcode = 'P0433';
    end if;
    if exists (
      select 1 from public.comic_machines m
      where m.user_id = new.user_id
        and m.id <> new.id
        and m.config -> 'line' ->> 'stance' <> new_stance
    ) then
      raise exception 'One stance per account' using errcode = 'P0430';
    end if;
  end if;

  if new_stance is distinct from old_stance then
    -- Only a stance that has gone public can't be changed. A note whose machine
    -- is gone counts as public, because nothing can show otherwise.
    if exists (
      select 1 from public.comic_machine_line_notes n
      where n.user_id = new.user_id
        and n.to_stance is distinct from new_stance
        and n.created_at > now() - interval '30 days'
        and (
          n.machine_id is null
          or exists (
            select 1 from public.comic_machine_drafts d
            where d.machine_id = n.machine_id and d.status in ('published', 'retracted')
          )
        )
    ) then
      raise exception 'Stance changed too recently' using errcode = 'P0431';
    end if;
    -- A new stance starts over in review, without being asked.
    if new_stance is not null then
      new.publish_mode := 'review';
    end if;
    return new;
  end if;

  -- The same stance going from review to auto has to have earned it.
  if new_stance is not null and new.publish_mode = 'auto' and not was_auto then
    select max(n.created_at) into since
    from public.comic_machine_line_notes n
    where n.machine_id = new.id and n.to_stance = new_stance;
    if (
      select count(*) from public.comic_machine_drafts d
      where d.machine_id = new.id
        and d.status = 'published'
        and d.published_at >= coalesce(since, '-infinity'::timestamptz)
    ) < 20 or exists (
      select 1 from public.comic_machine_drafts d
      where d.machine_id = new.id
        and d.status = 'blocked'
        and d.created_at > now() - interval '14 days'
    ) then
      raise exception 'This line has to stay in review for now' using errcode = 'P0432';
    end if;
  end if;
  return new;
end;
$$;

create trigger comic_machines_line_guard
  before insert or update of config, publish_mode, public
  on public.comic_machines
  for each row execute function public.comic_machines_line_guard();

-- After the write, so a new machine's id exists for the note to point at.
create function public.comic_machines_line_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_stance text := new.config -> 'line' ->> 'stance';
  old_stance text := case when tg_op = 'UPDATE' then old.config -> 'line' ->> 'stance' end;
begin
  if new_stance is distinct from old_stance then
    insert into public.comic_machine_line_notes (machine_id, user_id, from_stance, to_stance)
    values (new.id, new.user_id, old_stance, new_stance);
  end if;
  return new;
end;
$$;

create trigger comic_machines_line_note
  after insert or update of config
  on public.comic_machines
  for each row execute function public.comic_machines_line_note();

-- Only ever run as triggers.
revoke all on function public.comic_machines_line_guard() from public, anon, authenticated;
revoke all on function public.comic_machines_line_note() from public, anon, authenticated;
