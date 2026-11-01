-- Book translation: a person uploads a book they have the right to translate,
-- and works through it segment by segment. Everything here is private to its
-- owner, and nothing publishes a book. Owners read; every write comes from the
-- server with the admin client, after its checks.
create table public.book_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 500),
  author text not null default '' check (char_length(author) <= 300),
  file_name text not null check (char_length(file_name) between 1 and 255),
  format text check (format in ('epub', 'pdf', 'docx', 'txt', 'md', 'html')),
  size_bytes bigint not null check (size_bytes between 1 and 209715200),
  -- In `book-sources`, under `<user id>/`.
  source_path text not null,
  source_lang text not null default 'en',
  target_lang text not null default 'fr',
  status text not null default 'uploading' check (status in (
    'uploading', 'parsing', 'needs_ocr', 'ocr', 'setup', 'glossary',
    'translating', 'review', 'failed'
  )),
  -- When the owner confirmed they own the book or may translate it.
  rights_confirmed_at timestamptz not null,
  style jsonb not null default '{}' check (jsonb_typeof(style) = 'object'),
  bible jsonb not null default '{}' check (jsonb_typeof(bible) = 'object'),
  -- Reusable glossaries in use, on top of the book's own.
  glossaries uuid[] not null default '{}',
  words integer not null default 0,
  segments integer not null default 0,
  pages integer not null default 0,
  error text,
  warnings jsonb not null default '[]',
  -- A PDF's bookmarks, kept until OCR is done and the pages can be assembled.
  outline jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index book_projects_user_idx on public.book_projects (user_id, created_at desc);

create trigger book_projects_touch
  before update on public.book_projects
  for each row execute function public.comic_projects_touch();

create function public.book_projects_quota()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('book_projects:' || new.user_id::text, 0));
  if tg_op = 'INSERT'
    and (select count(*) from public.book_projects where user_id = new.user_id) >= 200 then
    raise exception 'book limit reached' using errcode = 'P0409';
  end if;
  -- 2 GiB of originals per person. Checked again once a file's real size is
  -- known, since the size given at the start is only a claim.
  if (
    select coalesce(sum(size_bytes), 0) from public.book_projects
    where user_id = new.user_id and id is distinct from new.id
  ) + new.size_bytes > 2147483648 then
    raise exception 'storage limit reached' using errcode = 'P0409';
  end if;
  return new;
end;
$$;

create trigger book_projects_quota
  before insert or update of size_bytes on public.book_projects
  for each row execute function public.book_projects_quota();

create table public.book_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.book_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null,
  title text not null default '',
  href text,
  -- The rolling summary the next chapter's translator reads.
  summary text not null default '',
  score integer,
  segments integer not null default 0,
  unique (book_id, position)
);

create table public.book_segments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.book_projects (id) on delete cascade,
  chapter_id uuid not null references public.book_chapters (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null,
  kind text not null,
  level integer,
  group_key text,
  cell jsonb,
  locator text,
  page integer,
  asset text,
  ocr real check (ocr is null or ocr between 0 and 1),
  source text not null,
  tags jsonb not null default '[]',
  source_hash text not null,
  words integer not null default 0,
  translatable boolean not null default true,
  target text,
  status text not null default 'pending' check (status in (
    'pending', 'machine', 'reviewed', 'locked', 'fixed', 'failed'
  )),
  -- Filled from an identical segment, free of charge.
  from_memory boolean not null default false,
  attempts integer not null default 0,
  version integer not null default 1,
  job_id uuid,
  updated_at timestamptz not null default now(),
  unique (chapter_id, position)
);

create index book_segments_memory_idx on public.book_segments (book_id, source_hash);
create index book_segments_pending_idx on public.book_segments (book_id, status);

-- Locked means locked, whatever the code above this does: no path may change
-- a locked segment's text, and it can only leave the state by being unlocked
-- into a status that keeps it. Also keeps `version` honest for the editor.
create function public.book_segments_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'locked' then
    if new.target is distinct from old.target or new.source is distinct from old.source then
      raise exception 'segment is locked' using errcode = 'P0423';
    end if;
    if new.status not in ('locked', 'reviewed', 'machine') then
      raise exception 'segment is locked' using errcode = 'P0423';
    end if;
  end if;
  -- A running job was priced on this text. Changing it underneath would get
  -- different, longer text translated for the price of the old.
  if new.source is distinct from old.source and exists (
    select 1 from public.book_jobs j
    where j.book_id = new.book_id
      and j.kind in ('translate', 'ocr')
      and j.status in ('unpaid', 'queued', 'running')
  ) then
    raise exception 'a job is running' using errcode = 'P0424';
  end if;
  if new.target is distinct from old.target
    or new.source is distinct from old.source
    or new.status is distinct from old.status then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger book_segments_guard
  before update on public.book_segments
  for each row execute function public.book_segments_guard();

-- Scanned pages, and for a mixed PDF every page, so the book can be assembled
-- in order once OCR is done.
create table public.book_pages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.book_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  number integer not null,
  kind text not null default 'scan' check (kind in ('text', 'scan')),
  -- For an image-only EPUB: the chapter this page belongs to.
  chapter_position integer,
  href text,
  image_path text,
  width integer,
  height integer,
  status text not null default 'pending' check (status in (
    'pending', 'done', 'failed', 'unreadable'
  )),
  blocks jsonb not null default '[]',
  confidence real check (confidence is null or confidence between 0 and 1),
  attempts integer not null default 0,
  unique (book_id, number)
);

-- A book's own glossary has `book_id`; a reusable one doesn't.
create table public.book_glossaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid unique references public.book_projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  source_lang text,
  target_lang text,
  created_at timestamptz not null default now()
);

create index book_glossaries_user_idx on public.book_glossaries (user_id);

create table public.book_terms (
  id uuid primary key default gen_random_uuid(),
  glossary_id uuid not null references public.book_glossaries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (char_length(source) between 1 and 200),
  target text not null default '' check (char_length(target) <= 200),
  kind text not null default 'term' check (kind in ('name', 'place', 'term', 'title', 'phrase')),
  dnt boolean not null default false,
  note text not null default '' check (char_length(note) <= 500),
  case_sensitive boolean not null default false,
  state text not null default 'approved' check (state in ('suggested', 'approved', 'rejected')),
  occurrences integer not null default 0,
  created_at timestamptz not null default now(),
  unique (glossary_id, source)
);

-- One row per piece of paid or long work. The row is the job's whole state:
-- any function can pick it up after the last one stopped.
create table public.book_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.book_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The API key that started it, if any, so a refund finds its way back.
  key_id uuid references public.api_keys (id) on delete set null,
  kind text not null check (kind in ('ingest', 'ocr', 'extract', 'translate', 'qa', 'export')),
  -- `unpaid` holds the book's slot until `book_charge_job` moves it on. Nothing
  -- claims it, so no paid work can run ahead of the charge.
  status text not null default 'queued' check (status in (
    'unpaid', 'queued', 'running', 'succeeded', 'failed', 'cancelled'
  )),
  params jsonb not null default '{}',
  state jsonb not null default '{}',
  done integer not null default 0,
  total integer not null default 0,
  -- Source words actually sent to a model. What a job is billed on.
  billable integer not null default 0,
  credits_charged integer not null default 0,
  credits_used integer not null default 0,
  payer text not null default 'credits' check (payer in ('credits', 'openrouter', 'free')),
  usage jsonb not null default '{}',
  result jsonb,
  error text,
  slices integer not null default 0,
  -- Claims in a row with nothing to show. A file that kills its function never
  -- gets to report that, so this counts on the way in.
  claims integer not null default 0,
  claim_done integer not null default 0,
  leased_until timestamptz,
  next_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index book_jobs_book_idx on public.book_jobs (book_id, created_at desc);
create index book_jobs_active_idx on public.book_jobs (status, next_at) where status in ('queued', 'running');
create unique index book_jobs_idempotency_idx on public.book_jobs (user_id, idempotency_key)
  where idempotency_key is not null;
-- Two jobs rewriting one book would race. Exports only read, so they may overlap.
create unique index book_jobs_one_active_idx on public.book_jobs (book_id)
  where status in ('unpaid', 'queued', 'running') and kind <> 'export';

create trigger book_jobs_touch
  before update on public.book_jobs
  for each row execute function public.comic_projects_touch();

create table public.book_issues (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.book_projects (id) on delete cascade,
  chapter_id uuid not null references public.book_chapters (id) on delete cascade,
  segment_id uuid not null references public.book_segments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  severity text not null check (severity in ('error', 'warning')),
  detail jsonb not null default '{}',
  dismissed boolean not null default false,
  created_at timestamptz not null default now()
);

create index book_issues_book_idx on public.book_issues (book_id, chapter_id);

-- Changes the assistant proposes. Nothing touches the book until the owner
-- applies them, and locked segments are skipped even then.
create table public.book_change_sets (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.book_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  summary text not null default '' check (char_length(summary) <= 500),
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'discarded')),
  -- [{ segment_id, before, after, version }]
  items jsonb not null default '[]',
  applied integer not null default 0,
  skipped integer not null default 0,
  created_at timestamptz not null default now()
);

create index book_change_sets_book_idx on public.book_change_sets (book_id, created_at desc);

create table public.book_messages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.book_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  change_set_id uuid references public.book_change_sets (id) on delete set null,
  created_at timestamptz not null default now()
);

create index book_messages_book_idx on public.book_messages (book_id, created_at);

create table public.book_webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null check (url like 'https://%' and char_length(url) <= 500),
  secret text not null,
  events text[] not null,
  created_at timestamptz not null default now()
);

create index book_webhooks_user_idx on public.book_webhooks (user_id);

create table public.book_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.book_webhooks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  response_status integer,
  created_at timestamptz not null default now()
);

create index book_webhook_deliveries_due_idx on public.book_webhook_deliveries (next_at)
  where status = 'pending';

-- Row-level security on every table. Reads are the owner's; writes are nobody's
-- but the server's, so a row can't be forged, a charge can't be skipped and a
-- page can't be swapped from the browser.
do $$
declare
  t text;
begin
  foreach t in array array[
    'book_projects', 'book_chapters', 'book_segments', 'book_pages',
    'book_glossaries', 'book_terms', 'book_jobs', 'book_issues',
    'book_change_sets', 'book_messages', 'book_webhooks', 'book_webhook_deliveries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format(
      'create policy "Owners read" on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;

grant select on
  public.book_projects, public.book_chapters, public.book_segments, public.book_pages,
  public.book_glossaries, public.book_terms, public.book_jobs, public.book_issues,
  public.book_change_sets, public.book_messages, public.book_webhook_deliveries
to authenticated;

-- The signing secret is shown once, at creation, and never read back.
grant select (id, user_id, url, events, created_at) on public.book_webhooks to authenticated;

-- Saves one chunk. The filter on `pending` is the whole of idempotence: a reply
-- that lands twice, or after a lease moved on, updates nothing the second time,
-- and only what was really written counts toward the bill. Returns that count.
-- A job that has closed saves nothing: its bill is final, so work landing after
-- a cancel would be free. The row lock orders this against `book_close_job`.
create function public.book_save_translations(p_job uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.book_jobs;
  written integer;
  billed integer;
begin
  select * into job from public.book_jobs where id = p_job for update;
  if not found then
    raise exception 'Unknown job' using errcode = 'P0002';
  end if;
  if job.status <> 'running' then
    raise exception 'job is closed' using errcode = 'P0410';
  end if;
  with items as (
    select (i->>'id')::uuid as id, i->>'target' as target, coalesce((i->>'memory')::boolean, false) as memory
    from jsonb_array_elements(p_items) i
  ),
  saved as (
    update public.book_segments s
    set target = items.target, status = 'machine', from_memory = items.memory, job_id = p_job
    from items
    where s.id = items.id and s.book_id = job.book_id and s.status = 'pending'
    returning s.words, s.from_memory
  )
  select count(*), coalesce(sum(words) filter (where not from_memory), 0)
  into written, billed
  from saved;
  update public.book_jobs
  set done = done + written, billable = billable + billed
  where id = p_job;
  return written;
end;
$$;

-- Gives back what a finished job didn't use: the charge was the estimate, the
-- bill is what ran. Uses the refund key, so a job is settled at most once and
-- can't be both settled and refunded. Returns the credits given back.
create function public.settle_credits_for(p_user uuid, p_job text, p_used integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.credit_ledger;
  back integer;
begin
  select * into charge from public.credit_ledger
  where idem_key = 'charge:' || p_job and user_id = p_user;
  if not found then
    return 0;
  end if;
  back := greatest(-charge.delta - greatest(p_used, 0), 0);
  if back = 0 then
    return 0;
  end if;
  insert into public.credit_ledger (user_id, delta, kind, ref, idem_key, key_id)
  values (p_user, back, charge.kind || '_failed', p_job, 'refund:' || p_job, charge.key_id)
  on conflict (idem_key) do nothing;
  if not found then
    return 0;
  end if;
  if charge.key_id is not null then
    update public.api_keys
    set credits_spent = greatest(credits_spent - back, 0)
    where id = charge.key_id;
  end if;
  return back;
end;
$$;

-- One OCR page, under the same rule, billed in the same step.
create function public.book_save_page(
  p_job uuid,
  p_page uuid,
  p_status text,
  p_blocks jsonb,
  p_confidence real,
  p_attempts integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.book_jobs;
  moved integer;
begin
  select * into job from public.book_jobs where id = p_job for update;
  if not found or job.status <> 'running' then
    raise exception 'job is closed' using errcode = 'P0410';
  end if;
  update public.book_pages
  set status = p_status, blocks = coalesce(p_blocks, blocks),
    confidence = p_confidence, attempts = p_attempts
  where id = p_page and book_id = job.book_id and status = 'pending';
  get diagnostics moved = row_count;
  if moved > 0 and p_status = 'done' then
    update public.book_jobs set done = done + 1, billable = billable + 1 where id = p_job;
  end if;
end;
$$;

-- Takes a job for one slice. Counts the claim here, in the same statement that
-- takes the lease, so a function that dies at any point has still been counted.
-- New work since the last claim starts the count again.
create function public.book_claim_job(p_job uuid, p_lease_seconds integer)
returns public.book_jobs
language sql
security definer
set search_path = ''
as $$
  update public.book_jobs
  set status = 'running',
    leased_until = now() + make_interval(secs => p_lease_seconds),
    claims = case when done > claim_done then 1 else claims + 1 end,
    claim_done = done
  where id = p_job
    and status in ('queued', 'running')
    and (leased_until is null or leased_until < now())
  returning *;
$$;

-- The charge and the job's release are one transaction, so there is no state
-- where money moved and no job runs, or a job runs that nobody paid for. A lost
-- reply is harmless: read the row to learn which way it went.
create function public.book_charge_job(p_job uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.book_jobs;
  balance integer;
begin
  select * into job from public.book_jobs where id = p_job for update;
  if not found or job.status <> 'unpaid' then
    return null;
  end if;
  if job.key_id is not null then
    balance := public.spend_credits_for_key(
      job.user_id, job.key_id, job.credits_charged, 'book_' || job.kind, job.id::text
    );
  else
    balance := public.spend_credits_for(
      job.user_id, job.credits_charged, 'book_' || job.kind, job.id::text
    );
  end if;
  update public.book_jobs set status = 'queued' where id = p_job;
  return balance;
end;
$$;

-- Ends a job and settles it in one transaction, working the bill out from the
-- row it just locked, so no save can slip between the sum and the close.
-- `p_rate` is credits per billable unit; `p_flat` is for flat-price work.
-- Returns the credits used, or null if the job had already closed.
create function public.book_close_job(
  p_job uuid,
  p_status text,
  p_error text,
  p_result jsonb,
  p_usage jsonb,
  p_rate numeric,
  p_flat integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.book_jobs;
  used integer := 0;
begin
  select * into job from public.book_jobs where id = p_job for update;
  if not found or job.status not in ('unpaid', 'queued', 'running') then
    return null;
  end if;
  if job.payer = 'credits' then
    used := least(
      job.credits_charged,
      greatest(p_flat, ceil(job.billable * p_rate)::integer)
    );
  end if;
  update public.book_jobs
  set status = p_status, error = p_error, result = coalesce(p_result, result),
    usage = p_usage, credits_used = used, leased_until = null, next_at = null,
    finished_at = now(), settled_at = now()
  where id = p_job;
  if job.payer = 'credits' and job.credits_charged > 0 then
    perform public.settle_credits_for(job.user_id, job.id::text, used);
  end if;
  return used;
end;
$$;

-- The tick's housekeeping, for whatever a dead function left behind. Each step
-- is safe to repeat. Returns how many rows it touched.
create function public.book_sweep(p_stale_seconds integer default 300)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.book_jobs;
  touched integer := 0;
  n integer;
begin
  -- Never charged, since charging would have moved it on.
  delete from public.book_jobs
  where status = 'unpaid' and created_at < now() - interval '10 minutes';
  get diagnostics n = row_count;
  touched := touched + n;

  for job in
    select * from public.book_jobs
    where settled_at is null and status in ('succeeded', 'failed', 'cancelled')
    for update skip locked
    limit 100
  loop
    if job.payer = 'credits' and job.credits_charged > 0 then
      perform public.settle_credits_for(job.user_id, job.id::text, job.credits_used);
    end if;
    update public.book_jobs set settled_at = now() where id = job.id;
    touched := touched + 1;
  end loop;

  update public.book_projects b
  set status = case b.status
      when 'parsing' then 'failed'
      when 'ocr' then 'needs_ocr'
      when 'glossary' then 'setup'
      else case when exists (
        select 1 from public.book_segments s
        where s.book_id = b.id and s.status in ('machine', 'reviewed', 'locked')
      ) then 'review' else 'setup' end
    end,
    error = case when b.status = 'parsing' then 'stuck' else b.error end
  where b.status in ('parsing', 'ocr', 'glossary', 'translating')
    and b.updated_at <= now() - make_interval(secs => p_stale_seconds)
    and not exists (
      select 1 from public.book_jobs j
      where j.book_id = b.id and j.status in ('unpaid', 'queued', 'running')
    );
  get diagnostics n = row_count;
  return touched + n;
end;
$$;

revoke all on function public.book_save_translations(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.settle_credits_for(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.book_save_page(uuid, uuid, text, jsonb, real, integer) from public, anon, authenticated;
revoke all on function public.book_claim_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.book_charge_job(uuid) from public, anon, authenticated;
revoke all on function public.book_close_job(uuid, text, text, jsonb, jsonb, numeric, integer) from public, anon, authenticated;
revoke all on function public.book_sweep(integer) from public, anon, authenticated;
grant execute on function public.book_save_translations(uuid, jsonb) to service_role;
grant execute on function public.settle_credits_for(uuid, text, integer) to service_role;
grant execute on function public.book_save_page(uuid, uuid, text, jsonb, real, integer) to service_role;
grant execute on function public.book_claim_job(uuid, integer) to service_role;
grant execute on function public.book_charge_job(uuid) to service_role;
grant execute on function public.book_close_job(uuid, text, text, jsonb, jsonb, numeric, integer) to service_role;
grant execute on function public.book_sweep(integer) to service_role;

-- Private. Sources are the books themselves; pages are scans of them; exports
-- are their translations. All are reachable only through short-lived signed
-- URLs, under `<user id>/`. Read only, on purpose: uploads arrive on one-time
-- signed slots, and nothing a browser does can replace a file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('book-sources', 'book-sources', false, 209715200, null),
  ('book-pages', 'book-pages', false, 8388608, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('book-exports', 'book-exports', false, 536870912, null)
on conflict (id) do nothing;

create policy "Owners read their book files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('book-sources', 'book-pages', 'book-exports')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
