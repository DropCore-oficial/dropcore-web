-- API Key por SELLER para integração ERP → DropCore (Modelo B)
-- Execute no Supabase SQL Editor.
-- Cada seller gera sua própria chave e configura no ERP dele.

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS erp_api_key_hash text;

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS erp_api_key_prefix text;

CREATE INDEX IF NOT EXISTS idx_sellers_erp_api_key_hash ON public.sellers(erp_api_key_hash) WHERE erp_api_key_hash IS NOT NULL;

COMMENT ON COLUMN public.sellers.erp_api_key_hash IS 'SHA256 da API key do ERP. A chave completa é mostrada apenas uma vez ao gerar.';
COMMENT ON COLUMN public.sellers.erp_api_key_prefix IS 'Primeiros 10 caracteres da chave (ex: dc_12ab...) para exibir na UI.';
