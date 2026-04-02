-- Adiciona mp_order_id e mp_payment_id para polling automático (fallback do webhook)
-- Execute no Supabase SQL Editor.

ALTER TABLE public.financial_mensalidades
  ADD COLUMN IF NOT EXISTS mp_order_id text,
  ADD COLUMN IF NOT EXISTS mp_payment_id text;

CREATE INDEX IF NOT EXISTS idx_mensalidades_mp_order
  ON public.financial_mensalidades(mp_order_id) WHERE mp_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mensalidades_mp_payment
  ON public.financial_mensalidades(mp_payment_id) WHERE mp_payment_id IS NOT NULL;

COMMENT ON COLUMN public.financial_mensalidades.mp_order_id IS 'ID da order no Mercado Pago (modo teste, para checar status via polling)';
COMMENT ON COLUMN public.financial_mensalidades.mp_payment_id IS 'ID do payment no Mercado Pago (produção, para checar status via polling)';
