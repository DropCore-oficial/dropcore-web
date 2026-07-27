-- Adiciona metadata do pedido (comprador, nº marketplace, canal de venda) na reserva de
-- estoque, pra dar pro seller uma pré-visualização "Aguardando pagamento" sem precisar
-- criar linha em `pedidos`/`financial_ledger` nesse estágio (pedido Olist "Em aberto").
-- Colunas nullable, sem impacto em RLS existente.

alter table estoque_reservas
  add column if not exists comprador_nome text,
  add column if not exists marketplace_numero text,
  add column if not exists canal_venda text;
