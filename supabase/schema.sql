create table if not exists public.pokemon_progress (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pokemon_progress enable row level security;
