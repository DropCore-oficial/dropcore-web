-- Assinatura "só calculadora" (usuário sem linha em sellers ou além dela).
-- Rode no SQL Editor do Supabase (projeto de produção quando for o caso).

create table if not exists public.calculadora_assinantes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  valido_ate timestamptz not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calculadora_assinantes_user_id_key unique (user_id)
);

create index if not exists idx_calculadora_assinantes_user_id
  on public.calculadora_assinantes (user_id);

create index if not exists idx_calculadora_assinantes_valido
  on public.calculadora_assinantes (valido_ate)
  where ativo = true;

comment on table public.calculadora_assinantes is
  'DropCore Calculadora: acesso por assinatura sem painel seller completo. API usa service role.';

alter table public.calculadora_assinantes enable row level security;

-- Sem políticas para anon/authenticated: leitura/escrita só via service role (API Next).

-- Exemplo: liberar 30 dias para um user já existente em auth.users
-- insert into public.calculadora_assinantes (user_id, valido_ate, ativo)
-- values ('COLE-O-UUID-DO-USUARIO', (now() + interval '30 days'), true)
-- on conflict (user_id) do update
--   set valido_ate = excluded.valido_ate,
--       ativo = true,
--       updated_at = now();
