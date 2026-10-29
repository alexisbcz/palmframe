-- Bring your own OpenRouter account: a person's OpenRouter key pays for
-- renders, edits and story plans instead of Palmframe credits. The key is
-- encrypted by the server (AES-256-GCM, OPENROUTER_KEY_SECRET) before it is
-- stored, and only the server's secret key can read or write this table.
create table public.openrouter_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- base64 of iv (12 bytes) + ciphertext + auth tag (16 bytes).
  key_ciphertext text not null,
  -- The last characters, so the key can be recognised in Settings.
  key_hint text not null check (char_length(key_hint) <= 8),
  -- When on, OpenRouter pays; when off, the key is kept but credits pay.
  enabled boolean not null default true,
  image_model text not null check (char_length(image_model) between 3 and 120),
  text_model text not null check (char_length(text_model) between 3 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.openrouter_connections enable row level security;
revoke all on public.openrouter_connections from anon, authenticated;
