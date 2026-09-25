-- Adiciona 'produto_nao_vinculado' à lista de status permitidos em pedidos.status.
--
-- Bug encontrado ao vivo 2026-09-25: o código (submitSellerErpPedido.ts,
-- mercadoLivrePedidoIngest.ts, sellerOlistPedidoImport.ts, sellerBlingPedidoImport.ts) já usa
-- status "produto_nao_vinculado" pra gravar um pedido placeholder visível quando o SKU vendido
-- não está no catálogo do fornecedor vinculado ao seller (evita a venda sumir sem rastro — ver
-- comentário "incidente Galileus" em submitSellerErpPedido.ts). Só que a constraint
-- `pedidos_status_check` nunca foi atualizada pra aceitar esse valor: todo INSERT com esse
-- status vem sendo rejeitado pelo Postgres desde que o código foi escrito, silenciosamente
-- (cron de reconciliação loga erro e tenta de novo a cada 15min, pra sempre, sem nunca gravar).
--
-- Achado real: seller Galileus (fornecedor vinculado: Consenso) com 10 pedidos pagos no
-- Mercado Livre nas últimas 24h pro SKU DJU001033 (pertence a outro fornecedor, Djulios
-- Vestuario Ltda) — nenhum virou linha em `pedidos` por causa dessa constraint desatualizada.

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
    'produto_nao_vinculado'::text
  ])
);
