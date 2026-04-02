-- API Key para integração ERP → DropCore
-- Execute no Supabase SQL Editor.
-- Permite que a org autentique requisições do ERP via header X-API-Key.

-- 1. Colunas na tabela orgs para armazenar hash e prefixo da chave
-- (a chave completa nunca é armazenada — só o hash SHA256 e os primeiros 8 caracteres para exibição)
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS erp_api_key_hash text;

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS erp_api_key_prefix text;

CREATE INDEX IF NOT EXISTS idx_orgs_erp_api_key_hash ON public.orgs(erp_api_key_hash) WHERE erp_api_key_hash IS NOT NULL;

COMMENT ON COLUMN public.orgs.erp_api_key_hash IS 'SHA256 da API key do ERP (para autenticação). A chave completa é mostrada apenas uma vez ao gerar.';
COMMENT ON COLUMN public.orgs.erp_api_key_prefix IS 'Primeiros 8 caracteres da chave (ex: dc_12ab) para exibir na UI.';

-- 2. Coluna referencia_externa no pedido (ID do pedido no ERP/Marketplace)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS referencia_externa text;

CREATE INDEX IF NOT EXISTS idx_pedidos_referencia_externa ON public.pedidos(referencia_externa) WHERE referencia_externa IS NOT NULL;

COMMENT ON COLUMN public.pedidos.referencia_externa IS 'ID externo do pedido (ex: MLB-123, ID do ERP).';
