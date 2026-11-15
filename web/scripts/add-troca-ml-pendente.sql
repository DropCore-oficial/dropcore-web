-- Troca (exchange) do Mercado Livre — 2026-11-14/15. Achado real: cliente pediu troca de
-- tamanho, ML enviou reposição grátis (coberta internamente, applied_coverage=true) e
-- cancelou+reembolsou o pedido original direto pro comprador — tudo isso sem o DropCore
-- saber. O pedido original ficava "entregue" pra sempre (igual venda normal) e, se a
-- reposição virasse um pedido novo no ML, o seller era cobrado de novo (dobrado).
--
-- Diferencial real da claim de troca (confirmado ao vivo na API do ML, claim 5605671551):
-- `resolution.reason === 'item_changed'` — não é `type` nem `stage` (esses só dizem "virou
-- mediação formal"). A claim pode estar `status: closed` (já julgada pelo mediador) e ainda
-- assim ter ação pendente do fornecedor — por isso a detecção não pode filtrar só claims
-- "opened".
--
-- O sinal de entrega física do retorno é o MESMO já usado na devolução normal
-- (`GET /post-purchase/v2/claims/{id}/returns` → shipments[].status === 'delivered'`,
-- `mlDevolucaoEntregueFisicamente` em mercadoLivreApiClient.ts) — confirmado ao vivo, sem
-- precisar de lógica nova de rastreio.
--
-- Decisão de produto (Sr Stark, 2026-11-14): nunca creditar o seller antes do fornecedor
-- confirmar que a peça devolvida chegou certa — mesmo quando o ledger original já está PAGO
-- (dinheiro já saiu num repasse passado). Por isso a tabela nova abaixo: fica "aguardando"
-- até (a) ML confirmar entrega física E (b) fornecedor confirmar — nunca libera por prazo
-- fixo (o mesmo erro já corrigido uma vez pra devolução normal, ver notifyFornecedorDevolucao.ts).

-- 1) Novos status de pedido — ficam pra sempre visíveis na aba Devolução (mesmo padrão já
-- usado por `devolucao_nao_procede`), nunca revertem pra "entregue" genérico.
alter table public.pedidos drop constraint pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status = any (array[
  'enviado','aguardando_repasse','entregue','devolvido','cancelado','erro_saldo',
  'pendente_estoque','bloqueado','produto_nao_vinculado','anuncio_sem_sku',
  'em_devolucao','devolucao_sem_fornecedor','devolucao_nao_procede',
  'troca_em_andamento','troca_concluida'
]));

-- 2) Link do pedido de reposição pro pedido original da troca (pra mostrar "Reposição de
-- troca" com referência ao original nas 3 telas).
alter table public.pedidos add column if not exists pedido_origem_troca_id uuid references public.pedidos(id);
create index if not exists idx_pedidos_origem_troca on public.pedidos (pedido_origem_troca_id) where pedido_origem_troca_id is not null;

-- 3) Tabela de troca pendente — ver corpo completo das funções abaixo pra entender o fluxo
-- (criar → ML confirma entrega → fornecedor confirma/contesta → só aí nasce o lançamento
-- financeiro). RLS ligada, só service_role (regra 9 do CLAUDE.md).
create table public.financial_troca_pendente (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  pedido_original_id uuid not null references public.pedidos(id),
  pedido_reposicao_id uuid references public.pedidos(id),
  ledger_original_id uuid not null references public.financial_ledger(id),
  ml_claim_id text not null,
  seller_id uuid not null references public.sellers(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  valor_total numeric not null,
  valor_fornecedor numeric not null,
  valor_dropcore numeric not null,
  entrega_confirmada_em timestamptz,
  status text not null default 'aguardando_entrega'
    check (status in ('aguardando_entrega','aguardando_confirmacao_fornecedor','confirmado','contestado')),
  fornecedor_contestou_em timestamptz,
  fornecedor_contestacao_texto text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index idx_troca_pendente_ledger_original on public.financial_troca_pendente (ledger_original_id);
create index idx_troca_pendente_fornecedor_status on public.financial_troca_pendente (fornecedor_id, status);
create index idx_troca_pendente_status on public.financial_troca_pendente (status);
alter table public.financial_troca_pendente enable row level security;
revoke all on public.financial_troca_pendente from public, anon, authenticated;
grant all on public.financial_troca_pendente to service_role;
create policy "service_role_only" on public.financial_troca_pendente
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 4) RPCs — ver definições completas ao vivo no banco (copiadas abaixo pra referência futura):
--    fn_troca_pendente_criar(p_ledger_original_id, p_pedido_reposicao_id, p_ml_claim_id, p_entrega_ja_confirmada)
--    fn_troca_pendente_marcar_entrega_confirmada(p_id) — chamado por cron, mesmo sinal da devolução normal
--    fn_troca_pendente_fornecedor_confirmar(p_id) — só aqui nasce o crédito do seller + débito do fornecedor
--    fn_troca_pendente_fornecedor_contestar(p_id, p_texto)
-- + fn_fornecedor_pedidos_lista e fn_seller_pedidos_lista atualizadas: `tem_devolucao` passou
--   a incluir troca_em_andamento/troca_concluida, e o SELECT final passou a expor
--   `pedido_origem_troca_id`.

-- 5) Caso real resolvido manualmente nessa sessão (não pela automação, que ainda não existe):
-- ledger original 07f348cb-ce34-438b-bdac-ce52abc7d24e (pedido 2000019249286374), reposição
-- 7f1fe5ff-ab4c-4cb2-ae26-2639d7dd35ac (pedido 2000019330244146), claim ML 5605671551.
-- fn_troca_pendente_criar(..., p_entrega_ja_confirmada=true) + fn_troca_pendente_fornecedor_confirmar
-- já rodados — seller creditado R$38,50, débito de R$35,00 do fornecedor agendado pro ciclo
-- 2026-11-17. Pendente ainda: cron de detecção automática (ainda não construído — hoje só
-- existe o caminho manual via estas RPCs).
