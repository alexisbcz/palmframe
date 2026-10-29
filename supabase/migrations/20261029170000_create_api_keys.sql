-- The developer API and MCP server: keys people create in Settings, and the
-- jobs those keys estimate, start and poll. Requests carry a key, not a
-- session, so the server acts for the key's owner with the secret key; the
-- `_for` credit functions below are its only way to spend credits.

-- Only a SHA-256 of each key is kept; the key itself is shown once.
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  -- The first characters, so a key can be recognised in the list.
  prefix text not null check (char_length(prefix) between 8 and 20),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index api_keys_user_idx on public.api_keys (user_id, created_at desc);

alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
grant select, insert on public.api_keys to authenticated;
grant update (revoked_at) on public.api_keys to authenticated;

create policy "Users read their API keys"
  on public.api_keys for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users create API keys"
  on public.api_keys for insert to authenticated
  with check (user_id = (select auth.uid()) and revoked_at is null and last_used_at is null);

create policy "Users revoke their API keys"
  on public.api_keys for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and revoked_at is not null);

-- One row per estimate. Starting it turns the same row into the job, so an
-- estimate runs at most once and its price is the price charged.
create table public.api_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key_id uuid references public.api_keys (id) on delete set null,
  -- estimated → queued → running → succeeded | failed | cancelled
  status text not null default 'estimated'
    check (status in ('estimated', 'queued', 'running', 'succeeded', 'failed', 'cancelled')),
  -- An operation from COSTS (panel, panel_ref).
  operation text not null,
  cost integer not null check (cost > 0),
  project_id uuid not null references public.comic_projects (id) on delete cascade,
  page_id text not null,
  panel_id text not null,
  -- The project revision the estimate was made against.
  page_version integer not null,
  -- The render request (prompt, size, seed, engine, refs).
  params jsonb not null,
  idempotency_key text check (char_length(idempotency_key) between 1 and 255),
  -- { image_url, seed, render_ms } once it succeeded.
  result jsonb,
  error text,
  expires_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index api_jobs_active_idx on public.api_jobs (status, user_id)
  where status in ('queued', 'running');

create trigger api_jobs_touch
  before update on public.api_jobs
  for each row execute function public.comic_projects_touch();

alter table public.api_jobs enable row level security;
revoke all on public.api_jobs from anon, authenticated;
grant select on public.api_jobs to authenticated;

create policy "Users read their API jobs"
  on public.api_jobs for select to authenticated
  using (user_id = (select auth.uid()));

-- my_credits, spend_credits and refund_credits for a given user, for the
-- server alone. Same keys, so a job is charged and refunded at most once.
create function public.credits_for(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_ledger (user_id, delta, kind, idem_key)
  values (p_user, public.welcome_credits(), 'welcome', 'welcome:' || p_user)
  on conflict (idem_key) do nothing;
  return (select coalesce(sum(delta), 0)::integer from public.credit_ledger where user_id = p_user);
end;
$$;

create function public.spend_credits_for(p_user uuid, p_cost integer, p_kind text, p_job text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  balance integer;
begin
  if p_cost <= 0 or p_cost > 100000 then
    raise exception 'Invalid cost' using errcode = '22023';
  end if;
  if p_kind !~ '^[a-z][a-z0-9_]{1,30}$' or p_kind like '%\_failed' then
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  balance := public.credits_for(p_user);
  if balance < p_cost then
    raise exception 'Not enough credits: % needed, % left', p_cost, balance using errcode = 'P0402';
  end if;
  insert into public.credit_ledger (user_id, delta, kind, ref, idem_key)
  values (p_user, -p_cost, p_kind, p_job, 'charge:' || p_job);
  return balance - p_cost;
end;
$$;

create function public.refund_credits_for(p_user uuid, p_job text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.credit_ledger;
begin
  select * into charge from public.credit_ledger
  where idem_key = 'charge:' || p_job and user_id = p_user;
  if found then
    insert into public.credit_ledger (user_id, delta, kind, ref, idem_key)
    values (p_user, -charge.delta, charge.kind || '_failed', p_job, 'refund:' || p_job)
    on conflict (idem_key) do nothing;
  end if;
  return (select coalesce(sum(delta), 0)::integer from public.credit_ledger where user_id = p_user);
end;
$$;

revoke all on function public.credits_for(uuid) from public, anon, authenticated;
revoke all on function public.spend_credits_for(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.refund_credits_for(uuid, text) from public, anon, authenticated;
grant execute on function public.credits_for(uuid) to service_role;
grant execute on function public.spend_credits_for(uuid, integer, text, text) to service_role;
grant execute on function public.refund_credits_for(uuid, text) to service_role;
