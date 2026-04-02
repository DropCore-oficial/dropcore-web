-- Adiciona mp_order_id para polling automático (fallback do webhook)
ALTER TABLE public.seller_depositos_pix
  ADD COLUMN IF NOT EXISTS mp_order_id text;

CREATE INDEX IF NOT EXISTS idx_seller_depositos_pix_mp_order
  ON public.seller_depositos_pix(mp_order_id) WHERE mp_order_id IS NOT NULL;

COMMENT ON COLUMN public.seller_depositos_pix.mp_order_id IS 'ID da order no Mercado Pago (para checar status via polling)';
