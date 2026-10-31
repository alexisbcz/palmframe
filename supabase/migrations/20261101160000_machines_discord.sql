-- A machine's Discord webhook. Anyone holding the URL can post to the channel, so
-- it's a credential: encrypted by the server (AES-256-GCM, OPENROUTER_KEY_SECRET)
-- like an OpenRouter key, and only the server's secret key can read or write this
-- table. Pages get the hint and state from the server.
create table public.comic_machine_discord (
  machine_id uuid primary key references public.comic_machines (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- base64 of iv (12 bytes) + ciphertext + auth tag (16 bytes).
  webhook_ciphertext text not null,
  -- The end of the webhook's id, so it can be recognised. Never of its token.
  webhook_hint text not null check (char_length(webhook_hint) <= 8),
  -- Discord said this webhook is gone, so nothing is sent until a new one is saved.
  state text not null default 'active' check (state in ('active', 'disabled')),
  -- Discord asked for a wait: nothing goes to this webhook before then.
  retry_at timestamptz,
  last_sent_at timestamptz,
  last_test_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger comic_machine_discord_touch
  before update on public.comic_machine_discord
  for each row execute function public.comic_projects_touch();

alter table public.comic_machine_discord enable row level security;
revoke all on public.comic_machine_discord from anon, authenticated;

-- A post's way to Discord. It sits apart from `receipts`, because a person still
-- has to post it: a post in a Discord channel hasn't been published anywhere.
alter table public.comic_machine_drafts
  add column discord_status text
    check (discord_status in ('pending', 'sent', 'failed', 'withdrawn', 'left')),
  add column discord_message_id text check (char_length(discord_message_id) <= 32),
  add column discord_attempts integer not null default 0
    check (discord_attempts >= 0),
  add column discord_next_at timestamptz;

create index comic_machine_drafts_discord_queue
  on public.comic_machine_drafts (discord_next_at)
  where discord_status = 'pending';
