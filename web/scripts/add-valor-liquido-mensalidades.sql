-- Líquido creditado no Mercado Pago (após taxas PIX), espelho de calculadora_recebimentos.valor.
-- Execute no Supabase SQL Editor.

ALTER TABLE public.financial_mensalidades
  ADD COLUMN IF NOT EXISTS valor_liquido_mp numeric CHECK (valor_liquido_mp IS NULL OR valor_liquido_mp >= 0);

COMMENT ON COLUMN public.financial_mensalidades.valor_liquido_mp IS
  'Líquido na conta MP (net_received_amount). NULL = marcar manual ou pagamento sem dado MP.';
