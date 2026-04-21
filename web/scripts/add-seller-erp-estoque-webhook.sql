-- Webhook opcional: após venda bem-sucedida (POST /api/erp/pedidos), o DropCore notifica o ERP com o estoque atualizado.
-- Execute no Supabase SQL Editor.

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS erp_estoque_webhook_url text NULL;

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS erp_estoque_webhook_secret text NULL;

COMMENT ON COLUMN public.sellers.erp_estoque_webhook_url IS 'HTTPS (ou http://localhost em dev) para POST com JSON de estoque após cada pedido ERP aceito.';
COMMENT ON COLUMN public.sellers.erp_estoque_webhook_secret IS 'Segredo opcional; enviado como HMAC-SHA256 do corpo em X-DropCore-Signature (hex).';
