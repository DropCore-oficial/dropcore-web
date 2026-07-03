-- ID do payment MP (produção) para polling de depósitos PIX.
ALTER TABLE public.seller_depositos_pix
  ADD COLUMN IF NOT EXISTS mp_payment_id text;

CREATE INDEX IF NOT EXISTS idx_seller_depositos_pix_mp_payment
  ON public.seller_depositos_pix(mp_payment_id) WHERE mp_payment_id IS NOT NULL;

COMMENT ON COLUMN public.seller_depositos_pix.mp_payment_id IS 'ID do payment no Mercado Pago (produção, para checar status via polling)';
