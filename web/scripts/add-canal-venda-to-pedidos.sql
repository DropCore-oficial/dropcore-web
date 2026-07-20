-- Marketplace de origem do pedido (Shopee/Mercado Livre/Shein/TikTok Shop/outro).
-- Usado por: web/lib/olistTinyApi.ts (normalizeCanalVenda), web/lib/erp/submitSellerErpPedido.ts.
--
-- A Tiny/Olist já devolve isso em `pedido.ecommerce.nomeEcommerce`/`canalVenda` na resposta
-- de pedido.obter.php (mesma chamada que já fazemos por pedido — sem custo extra de API),
-- só que o parser nunca capturava esse campo. É pré-requisito pra aplicar regra de SLA de
-- postagem específica por marketplace (cada um tem corte de horário/prazo diferente).

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS canal_venda text;

COMMENT ON COLUMN public.pedidos.canal_venda IS 'Marketplace de origem normalizado: shopee | mercado_livre | shein | tiktok_shop | outro. Null em pedidos importados antes desta coluna existir ou sem canal identificável (ex.: import via Bling).';
