create table if not exists public.pokemon_progress (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pokemon_progress enable row level security;

create table if not exists public.pokemon_app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_key text not null unique,
  password_hash text not null,
  salt text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pokemon_app_sessions (
  token_hash text primary key,
  user_id uuid not null references public.pokemon_app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists pokemon_app_sessions_user_id_idx
  on public.pokemon_app_sessions(user_id);

create index if not exists pokemon_app_sessions_expires_at_idx
  on public.pokemon_app_sessions(expires_at);

alter table public.pokemon_app_users enable row level security;
alter table public.pokemon_app_sessions enable row level security;
