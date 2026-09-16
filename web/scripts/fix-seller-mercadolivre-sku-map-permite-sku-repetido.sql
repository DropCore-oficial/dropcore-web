-- seller_mercadolivre_sku_map tinha UNIQUE (seller_id, sku), assumindo que cada produto
-- só teria 1 anúncio no ML. Errado: seller republica anúncio do mesmo produto (prática
-- normal), com o MESMO sku — o sync silenciosamente ignorava o 2º anúncio em diante.
-- Achado ao investigar 7 itens sem custo na oferta relâmpago da Galileus (2026-09-16):
-- 5 deles tinham sku certinho no anúncio, só que já linkado a outro ml_item_id.
--
-- Corrige pra: cada ANÚNCIO (ml_item_id + variação) só pode ter 1 sku — mas o mesmo sku
-- pode aparecer em vários anúncios.
UPDATE public.seller_mercadolivre_sku_map SET ml_variation_id = 0 WHERE ml_variation_id IS NULL;
ALTER TABLE public.seller_mercadolivre_sku_map ALTER COLUMN ml_variation_id SET DEFAULT 0;
ALTER TABLE public.seller_mercadolivre_sku_map ALTER COLUMN ml_variation_id SET NOT NULL;
ALTER TABLE public.seller_mercadolivre_sku_map DROP CONSTRAINT seller_mercadolivre_sku_map_seller_id_sku_key;
ALTER TABLE public.seller_mercadolivre_sku_map
  ADD CONSTRAINT seller_mercadolivre_sku_map_seller_item_var_key
  UNIQUE (seller_id, ml_item_id, ml_variation_id);
