-- Marca pedidos que vieram do mesmo "pack" do Mercado Livre (comprador levou >1 unidade
-- num único checkout; o ML às vezes devolve vários order_id separados que compartilham
-- um pack_id e UMA etiqueta/envio só — confirmado ao vivo em 2026-09-23 com pedido real
-- da LINA1745173: 3 order_id, mesmo pack_id, mesmo shipping_id).
-- Sem tabela nova, sem tocar pedido_itens — cada order_id continua virando seu próprio
-- pedidos (nada muda no cálculo financeiro/estoque); a coluna só permite a tela agrupar
-- na exibição (ver web/app/api/seller/pedidos/route.ts e
-- web/app/api/fornecedor/pedidos/route.ts).
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS marketplace_pack_id text;

CREATE INDEX IF NOT EXISTS idx_pedidos_marketplace_pack_id
  ON public.pedidos (org_id, seller_id, marketplace_pack_id)
  WHERE marketplace_pack_id IS NOT NULL;
