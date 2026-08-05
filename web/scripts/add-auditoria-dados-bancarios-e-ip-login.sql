-- Fase 1 de auditoria: troca de dados bancários do fornecedor (maior vetor de fraude do
-- sistema — conta invadida trocando a chave PIX de repasse) e IP nos fluxos de login.
--
-- Hoje POST /api/fornecedor/dados-bancarios/confirmar aplica a troca e deleta a linha
-- pendente na sequência: não sobra valor antigo, quem confirmou nem de qual IP. Esta
-- tabela vira o destino desse registro antes do delete (ver route.ts).

create table if not exists public.fornecedor_dados_bancarios_historico (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  dados_antigos jsonb not null,
  dados_novos jsonb not null,
  ip_confirmacao text,
  confirmado_em timestamptz not null default now()
);

create index if not exists idx_fornecedor_dados_bancarios_historico_fornecedor
  on public.fornecedor_dados_bancarios_historico(fornecedor_id, confirmado_em desc);

alter table public.fornecedor_dados_bancarios_historico enable row level security;
-- Deny-all (mesmo padrão de fornecedor_dados_bancarios_pendentes) — só service role grava
-- e só service role lê (consulta feita por admin via API route, não direto do front).

-- IP em quem solicitou o código de verificação de dispositivo novo (POST
-- /api/auth/solicitar-codigo-dispositivo) e em quem confirmou o dispositivo como
-- confiável (POST /api/auth/confirmar-dispositivo) — hoje nenhuma das duas tabelas
-- guarda IP, então não dá pra investigar login suspeito depois do fato.
alter table public.login_verification_codes add column if not exists ip_solicitacao text;
alter table public.trusted_devices add column if not exists ip_confirmacao text;
