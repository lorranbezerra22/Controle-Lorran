create table if not exists public.cartao_recorrentes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  templates jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cartao_recorrentes enable row level security;

drop policy if exists "Users manage their own card recurring templates"
  on public.cartao_recorrentes;

create policy "Users manage their own card recurring templates"
  on public.cartao_recorrentes
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete
  on public.cartao_recorrentes
  to authenticated;