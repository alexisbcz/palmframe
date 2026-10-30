-- Scoped API keys: what a key may do (scopes), which projects it reaches and
-- how many credits it may spend. Every column defaults to what a key could
-- already do, so existing keys keep full access and no limit.

alter table public.api_keys
  -- From API_SCOPES in app/lib/api-scopes.ts.
  add column scopes text[] not null default '{read,generate}'
    check (scopes <@ array['read', 'generate']),
  -- Null: no limit. Otherwise a lifetime cap, compared to credits_spent.
  add column credit_limit integer check (credit_limit >= 0),
  -- Net of refunds. Written only by the credit functions below.
  add column credits_spent integer not null default 0 check (credits_spent >= 0),
  -- Null: all projects, including future ones. Otherwise only these.
  add column project_ids uuid[];

-- The key behind a charge, and behind its refund.
alter table public.credit_ledger
  add column key_id uuid references public.api_keys (id) on delete set null;

-- spend_credits_for, also held to the key's credit limit. The advisory lock
-- serialises the owner's spends and the row lock the key's, so concurrent
-- calls can't both pass the check; any failure rolls the whole charge back.
-- Returns the new balance; raises P0402 when credits run short, P0403 when
-- the key's limit does.
create function public.spend_credits_for_key(p_user uuid, p_key uuid, p_cost integer, p_kind text, p_job text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  balance integer;
  cap integer;
  spent integer;
begin
  if p_cost <= 0 or p_cost > 100000 then
    raise exception 'Invalid cost' using errcode = '22023';
  end if;
  if p_kind !~ '^[a-z][a-z0-9_]{1,30}$' or p_kind like '%\_failed' then
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select credit_limit, credits_spent into cap, spent
  from public.api_keys
  where id = p_key and user_id = p_user and revoked_at is null
  for update;
  if not found then
    raise exception 'Unknown or revoked key' using errcode = '28000';
  end if;
  if cap is not null and spent + p_cost > cap then
    raise exception 'Key credit limit: % needed, % left', p_cost, greatest(cap - spent, 0) using errcode = 'P0403';
  end if;
  balance := public.credits_for(p_user);
  if balance < p_cost then
    raise exception 'Not enough credits: % needed, % left', p_cost, balance using errcode = 'P0402';
  end if;
  update public.api_keys set credits_spent = spent + p_cost where id = p_key;
  insert into public.credit_ledger (user_id, delta, kind, ref, idem_key, key_id)
  values (p_user, -p_cost, p_kind, p_job, 'charge:' || p_job, p_key);
  return balance - p_cost;
end;
$$;

-- Same refund as before, which now also gives the charge back to its key.
-- The refund key still makes it happen at most once.
create or replace function public.refund_credits_for(p_user uuid, p_job text)
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
    insert into public.credit_ledger (user_id, delta, kind, ref, idem_key, key_id)
    values (p_user, -charge.delta, charge.kind || '_failed', p_job, 'refund:' || p_job, charge.key_id)
    on conflict (idem_key) do nothing;
    if found and charge.key_id is not null then
      update public.api_keys
      set credits_spent = greatest(credits_spent + charge.delta, 0)
      where id = charge.key_id;
    end if;
  end if;
  return (select coalesce(sum(delta), 0)::integer from public.credit_ledger where user_id = p_user);
end;
$$;

revoke all on function public.spend_credits_for_key(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.spend_credits_for_key(uuid, uuid, integer, text, text) to service_role;
