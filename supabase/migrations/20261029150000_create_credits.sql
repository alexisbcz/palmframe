-- Credits: an append-only ledger. A balance is the sum of a user's rows.
-- Every row carries an idempotency key, so a retried webhook, a second sync
-- or a double refund inserts nothing.

-- The Stripe customer behind each Palmframe user, and their subscription as
-- last read from Stripe (written only by syncStripeCustomer on the server).
create table public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  subscription jsonb not null default '{"status": "none"}',
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
revoke all on public.billing_customers from anon, authenticated;
grant select on public.billing_customers to authenticated;

create policy "Users read their billing customer"
  on public.billing_customers for select to authenticated
  using (user_id = (select auth.uid()));

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Positive: grants. Negative: charges.
  delta integer not null check (delta <> 0),
  -- welcome, subscription, pack, refund_clawback, adjustment,
  -- or an operation (panel, portrait, sheet) and its `_failed` refund.
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
  -- What the row is about: a Stripe invoice or session, a generation job.
  ref text,
  idem_key text not null unique,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from anon, authenticated;
grant select on public.credit_ledger to authenticated;

create policy "Users read their credit history"
  on public.credit_ledger for select to authenticated
  using (user_id = (select auth.uid()));

-- New and existing accounts start with this many credits, once.
create function public.welcome_credits()
returns integer language sql immutable as $$ select 100 $$;

-- The caller's balance. Grants the welcome credits on first use, so the
-- accounts created before credits existed get them too.
create function public.my_credits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  insert into public.credit_ledger (user_id, delta, kind, idem_key)
  values (uid, public.welcome_credits(), 'welcome', 'welcome:' || uid)
  on conflict (idem_key) do nothing;
  return (select coalesce(sum(delta), 0)::integer from public.credit_ledger where user_id = uid);
end;
$$;

-- Charges the caller before a job runs. The advisory lock serialises one
-- user's spends, so two tabs can't both pass the balance check.
-- Returns the new balance; raises P0402 when credits run short.
create function public.spend_credits(p_cost integer, p_kind text, p_job text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  balance integer;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_cost <= 0 or p_cost > 100000 then
    raise exception 'Invalid cost' using errcode = '22023';
  end if;
  if p_kind !~ '^[a-z][a-z0-9_]{1,30}$' or p_kind like '%\_failed' then
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  balance := public.my_credits();
  if balance < p_cost then
    raise exception 'Not enough credits: % needed, % left', p_cost, balance using errcode = 'P0402';
  end if;
  insert into public.credit_ledger (user_id, delta, kind, ref, idem_key)
  values (uid, -p_cost, p_kind, p_job, 'charge:' || p_job);
  return balance - p_cost;
end;
$$;

-- Gives back the charge of a job that failed or was cancelled. The refund
-- key is derived from the job, so it happens at most once.
create function public.refund_credits(p_job text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  charge public.credit_ledger;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into charge from public.credit_ledger
  where idem_key = 'charge:' || p_job and user_id = uid;
  if found then
    insert into public.credit_ledger (user_id, delta, kind, ref, idem_key)
    values (uid, -charge.delta, charge.kind || '_failed', p_job, 'refund:' || p_job)
    on conflict (idem_key) do nothing;
  end if;
  return (select coalesce(sum(delta), 0)::integer from public.credit_ledger where user_id = uid);
end;
$$;

-- Grants from Stripe (subscription invoices, packs) and their claw-backs.
-- Only the server's secret key may call it.
create function public.grant_credits(p_user uuid, p_delta integer, p_kind text, p_ref text, p_idem text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_ledger (user_id, delta, kind, ref, idem_key)
  values (p_user, p_delta, p_kind, p_ref, p_idem)
  on conflict (idem_key) do nothing;
  return found;
end;
$$;

revoke all on function public.my_credits() from public, anon;
revoke all on function public.spend_credits(integer, text, text) from public, anon;
revoke all on function public.refund_credits(text) from public, anon;
revoke all on function public.grant_credits(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.my_credits() to authenticated;
grant execute on function public.spend_credits(integer, text, text) to authenticated;
grant execute on function public.refund_credits(text) to authenticated;
grant execute on function public.grant_credits(uuid, integer, text, text, text) to service_role;
