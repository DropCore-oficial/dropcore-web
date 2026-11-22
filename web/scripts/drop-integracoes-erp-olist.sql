-- =============================================================================
-- Remoção final das integrações ERP (Olist/Tiny/Bling) do schema.
-- Pré-requisito já confirmado: zero código TypeScript referencia qualquer um
-- destes objetos (confirmado via grep em toda a árvore web/ antes de rodar).
-- Bling nunca teve tabela própria (nunca foi implementado de fato).
-- =============================================================================

-- Tabelas 100% dedicadas a Olist/ERP genérico — sem FK apontando pra elas de fora.
DROP TABLE IF EXISTS public.seller_olist_integrations;
DROP TABLE IF EXISTS public.fornecedor_olist_integrations;
DROP TABLE IF EXISTS public.olist_webhook_logs;
DROP TABLE IF EXISTS public.fornecedor_olist_webhook_logs;
DROP TABLE IF EXISTS public.erp_event_logs;
-- Rate limit genérico, mas 100% das linhas existentes são de /api/erp/pedidos (removido).
DROP TABLE IF EXISTS public.api_rate_limits;

-- Colunas do mecanismo de "seller conecta o próprio ERP via API key" (zero uso real).
ALTER TABLE public.sellers
  DROP COLUMN IF EXISTS erp_api_key_hash,
  DROP COLUMN IF EXISTS erp_api_key_prefix,
  DROP COLUMN IF EXISTS erp_estoque_webhook_url,
  DROP COLUMN IF EXISTS erp_estoque_webhook_secret;

ALTER TABLE public.orgs
  DROP COLUMN IF EXISTS erp_api_key_hash,
  DROP COLUMN IF EXISTS erp_api_key_prefix;

-- Locks de advisory lock usados só pelos crons de sync Olist (rotas já removidas).
DROP FUNCTION IF EXISTS public.dropcore_try_olist_sync_lock();
DROP FUNCTION IF EXISTS public.dropcore_release_olist_sync_lock();
DROP FUNCTION IF EXISTS public.dropcore_try_fornecedor_olist_estoque_sync_lock();
DROP FUNCTION IF EXISTS public.dropcore_release_fornecedor_olist_estoque_sync_lock();
