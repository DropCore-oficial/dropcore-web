-- CNPJ normalizado (só dígitos) para casar webhook de pedidos da Olist/Tiny com o seller.
-- URL do webhook é única no DropCore; a Olist envia o CNPJ da conta no payload.
-- Execute no Supabase SQL Editor.

ALTER TABLE public.seller_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_account_cnpj_normalized text;

CREATE INDEX IF NOT EXISTS idx_seller_olist_integrations_cnpj_norm
  ON public.seller_olist_integrations(olist_account_cnpj_normalized)
  WHERE olist_account_cnpj_normalized IS NOT NULL AND length(olist_account_cnpj_normalized) > 0;

COMMENT ON COLUMN public.seller_olist_integrations.olist_account_cnpj_normalized IS 'CPF/CNPJ da conta Olist (só dígitos), vindo do info.php ao salvar o token — usado no webhook de pedidos.';

CREATE TABLE IF NOT EXISTS public.olist_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  org_id uuid,
  olist_cnpj_normalized text,
  tipo text,
  olist_pedido_id int,
  payload jsonb,
  resultado text,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_olist_webhook_logs_created_at ON public.olist_webhook_logs(created_at DESC);

COMMENT ON TABLE public.olist_webhook_logs IS 'Recebimentos de webhook de pedidos Olist/Tiny (auditoria).';
