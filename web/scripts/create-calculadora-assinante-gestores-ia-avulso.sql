-- Gestores de IA avulso (standalone, fora do hub) — reaberto 2026-10-04 depois de
-- descartado em 2026-09-30. Decisão: produto 100% isolado de `sellers`/`skus`/`pedidos`,
-- preso em `calculadora_assinantes` (mesma tabela já usada pela Calculadora avulsa).
--
-- Pacote "Calculadora + Gestores de IA" R$797,90/mês (convite, não self-serve) — inclui
-- Andrey (Anúncios & SEO), Amanda (Reputação & Atendimento), Ulisses (Ads) e Tiago Silva
-- (Gestor Mestre/chat). Diogo (Risco de Ruptura) fica de fora por enquanto — depende de
-- estoque/venda interna que o assinante avulso não tem.
--
-- Já aplicado em produção via mcp__supabase__apply_migration em 2026-10-04 — este arquivo
-- é só o registro/fonte de verdade, não precisa rodar de novo.

-- 1) calculadora_assinantes: produto, orçamento de IA e BYOK
alter table public.calculadora_assinantes
  add column inclui_gestores_ia boolean not null default false,
  add column gestores_custo_mes numeric not null default 0,
  add column gestores_limite_mes numeric not null default 120,
  add column gestores_mes_ref text,
  add column anthropic_api_key_encriptada text,
  add column anthropic_api_key_configurada_em timestamptz;

-- 2) Conexão ML do assinante avulso (isolada de sellers/seller_mercadolivre_integrations)
create table public.calculadora_assinante_mercadolivre_integrations (
  id uuid primary key default gen_random_uuid(),
  assinante_id uuid not null unique references public.calculadora_assinantes(id) on delete cascade,
  ml_user_id text,
  ml_access_token text,
  ml_refresh_token text,
  ml_access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.calculadora_assinante_mercadolivre_integrations enable row level security;
revoke all on public.calculadora_assinante_mercadolivre_integrations from public, anon, authenticated;

-- 3) Resultado de cada rodada dos gestores pro assinante avulso
create table public.calculadora_assinante_ai_runs (
  id uuid primary key default gen_random_uuid(),
  assinante_id uuid not null references public.calculadora_assinantes(id) on delete cascade,
  gestor text not null check (gestor in ('anuncios_seo', 'reputacao_atendimento', 'ads', 'gestor_mestre')),
  status text not null default 'pendente' check (status in ('pendente', 'ok', 'erro')),
  resultado jsonb,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.calculadora_assinante_ai_runs enable row level security;
revoke all on public.calculadora_assinante_ai_runs from public, anon, authenticated;

-- 4) Reaproveita calculadora_recebimentos (já existe) pro histórico de crédito extra também
alter table public.calculadora_recebimentos
  add column tipo text not null default 'renovacao' check (tipo in ('renovacao', 'credito_extra_gestores'));
