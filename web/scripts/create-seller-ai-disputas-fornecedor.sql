-- Auditoria de disputas fornecedor x seller detectadas pela Amanda (Gestor 6, Reputação &
-- Atendimento) a partir de reclamação/devolução real do Mercado Livre com evidência (foto)
-- anexada pelo comprador. Registro admin-only: guarda a evidência coletada, a comparação
-- feita pela IA (anúncio vs. foto), a resposta do fornecedor (se contestar) e a decisão
-- final do admin — nunca visível pro seller, nunca decide/mexe em dinheiro sozinha.
--
-- IMPORTANTE: não existe função financeira nova aqui de propósito — o admin decide usando
-- o fluxo de devolução que já está em produção (/admin/devolucoes,
-- PATCH /api/org/financial/ledger/[id] com status EM_DEVOLUCAO->DEVOLVIDO, e
-- POST /api/org/financial/devolucao-pos-repasse pra ledger já PAGO). Essa tabela só guarda
-- o rastro de evidência + decisão; `ledger_id` aponta pro registro que o admin efetivamente
-- usou nesse fluxo já existente.
--
-- Padrão de acesso: RLS deny-all (mesmo padrão de financial_ledger, não RPC-only como
-- seller_ai_acoes) — leitura/escrita só via supabaseAdmin dentro de rotas admin
-- (requireAdmin) e de rota do fornecedor (getFornecedorContextFromBearer, valida dono do
-- caso antes de deixar responder).

create table public.seller_ai_disputas_fornecedor (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  seller_id uuid not null references public.sellers(id),
  fornecedor_id uuid references public.fornecedores(id),
  pedido_id uuid references public.pedidos(id),
  ledger_id uuid references public.financial_ledger(id),
  ml_claim_id text not null,
  ml_item_id text,
  ml_order_id text,
  -- {"fotos": [{"filename": "...", "descricao_ml": "..."}], "anuncio": {"titulo": "...", "atributo_esperado": "..."}}
  evidencia jsonb not null default '{}',
  -- {"comparacao": "texto da comparação anúncio vs. foto", "confianca": "alta|media|baixa"}
  analise_ia jsonb not null default '{}',
  veredito_ia text check (veredito_ia in ('fornecedor_provavel', 'seller_provavel', 'indeterminado')),
  status text not null default 'aberto' check (status in ('aberto', 'aguardando_fornecedor', 'decidido')),
  fornecedor_resposta text,
  fornecedor_respondeu_em timestamptz,
  decisao_admin text check (decisao_admin in ('reverter_repasse', 'manter_repasse', 'sem_acao')),
  decisao_detalhes text,
  decidido_por uuid,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);

create unique index idx_seller_ai_disputas_fornecedor_claim
  on public.seller_ai_disputas_fornecedor (ml_claim_id);

create index idx_seller_ai_disputas_fornecedor_seller
  on public.seller_ai_disputas_fornecedor (seller_id, criado_em desc);

create index idx_seller_ai_disputas_fornecedor_fornecedor
  on public.seller_ai_disputas_fornecedor (fornecedor_id, criado_em desc);

create index idx_seller_ai_disputas_fornecedor_status_aberto
  on public.seller_ai_disputas_fornecedor (criado_em desc)
  where status <> 'decidido';

alter table public.seller_ai_disputas_fornecedor enable row level security;
-- Sem policy: deny-all. Acesso só via supabaseAdmin (service role) nas API routes.

revoke all on public.seller_ai_disputas_fornecedor from public, anon, authenticated;
