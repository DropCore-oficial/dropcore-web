-- Lock de concorrência POR SELLER entre os 3 crons que usam o token Olist do seller
-- (olist-sync 1min, etiqueta-olist-retry 15min, olist-sync-precos 10min) — a Tiny tem um
-- erro específico pra "excesso de requisições concorrentes" (diferente de rate limit de
-- volume, já coberto por olist_rate_limited_until). fornecedor-olist-sync-estoque fica de
-- fora de propósito: usa token do FORNECEDOR (fornecedor_olist_integrations), bucket
-- diferente, sem esse risco.
--
-- Coluna com TTL, não advisory lock do Postgres: supabaseAdmin fala com o Postgres via
-- PostgREST (HTTP) — "pegar" o lock numa chamada e "soltar" em outra não garante ser a
-- mesma conexão/sessão, que é a premissa do pg_try_advisory_lock/pg_advisory_unlock. Uma
-- coluna com UPDATE condicional é atômica independente de pooling de conexão.
ALTER TABLE public.seller_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_sync_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS olist_sync_locked_by text;
