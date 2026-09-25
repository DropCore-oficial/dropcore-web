-- Adiciona 'anuncio_sem_sku' à lista de status permitidos em pedidos.status.
--
-- Caso real (2026-09-25): pedido pago no Mercado Livre chega sem `seller_sku` no item
-- (anúncio ainda não tem o SKU do DropCore cadastrado na variação) — hoje
-- mercadoLivrePedidoIngest.ts descarta esse pedido silenciosamente (erro não-retryable,
-- só loga e esquece), igual ao "incidente Galileus" original antes do fix de
-- produto_nao_vinculado. Esse novo status grava um placeholder visível pro seller,
-- igual ao padrão já existente pra produto_nao_vinculado.

ALTER TABLE pedidos DROP CONSTRAINT pedidos_status_check;

ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check CHECK (
  status = ANY (ARRAY[
    'enviado'::text,
    'aguardando_repasse'::text,
    'entregue'::text,
    'devolvido'::text,
    'cancelado'::text,
    'erro_saldo'::text,
    'pendente_estoque'::text,
    'bloqueado'::text,
    'produto_nao_vinculado'::text,
    'anuncio_sem_sku'::text
  ])
);
