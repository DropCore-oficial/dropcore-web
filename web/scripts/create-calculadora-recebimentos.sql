-- Histórico de PIX de renovação da calculadora (receita DropCore — assinatura calc-only).
-- Rode no SQL Editor do Supabase após deploy do código que grava nesta tabela.

create table if not exists public.calculadora_recebimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mp_payment_id text not null,
  -- Preferencialmente líquido na conta (API MP: transaction_details.net_received_amount); fallback valor da cobrança.
  valor numeric not null check (valor >= 0),
  external_reference text,
  pago_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  constraint calculadora_recebimentos_mp_payment_id_key unique (mp_payment_id)
);

create index if not exists idx_calculadora_recebimentos_pago_em
  on public.calculadora_recebimentos (pago_em desc);

create index if not exists idx_calculadora_recebimentos_user_id
  on public.calculadora_recebimentos (user_id);

comment on table public.calculadora_recebimentos is
  'PIX aprovados de renovação da calculadora (calc-only). Somente service role / API admin.';

alter table public.calculadora_recebimentos enable row level security;
