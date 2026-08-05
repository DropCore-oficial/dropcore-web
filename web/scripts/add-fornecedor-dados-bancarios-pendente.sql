-- Confirmação por e-mail antes de aplicar troca de dados bancários do fornecedor.
-- PATCH /api/fornecedor/dados-bancarios passa a gravar aqui em vez de aplicar direto em
-- fornecedores; só aplica de fato quando o fornecedor confirma pelo link do e-mail
-- (POST /api/fornecedor/dados-bancarios/confirmar). Mesma lógica de carência que bancos
-- reais usam pra troca de chave PIX — reduz o risco de um token roubado desviar repasse.

create table if not exists public.fornecedor_dados_bancarios_pendentes (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null unique references public.fornecedores(id) on delete cascade,
  dados_propostos jsonb not null,
  token_hash text not null,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);

alter table public.fornecedor_dados_bancarios_pendentes enable row level security;
-- Deny-all (mesmo padrão de fornecedor_invites) — só service role toca aqui.
