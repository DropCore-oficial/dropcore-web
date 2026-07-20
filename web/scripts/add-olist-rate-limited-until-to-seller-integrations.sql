-- Cooldown persistido de rate limit da Tiny/Olist, por seller/token.
-- Usado por: web/lib/olistRateLimitCooldown.ts, chamado de
-- web/lib/sellerOlistSync.ts, web/lib/etiquetaOlistRetry.ts e
-- web/lib/runOlistSyncPrecosTodosSellers.ts.
--
-- Antes desta coluna, a detecção de "API Bloqueada" (isTinyRateLimitMessage) só evitava
-- gastar chamada DENTRO da própria execução do cron — o próximo tick (1 a 15 min depois,
-- e há 3 crons diferentes batendo no mesmo token) começava do zero e martelava a Olist de
-- novo enquanto o bloqueio dela ainda estava valendo. Confirmado ao vivo em 2026-07-19:
-- o seller DJULIOS bateu "API Bloqueada" várias vezes dentro de uma única execução do
-- sync, e 16/16 pedidos ativos seguiam sem etiqueta.

ALTER TABLE public.seller_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_rate_limited_until timestamptz;

COMMENT ON COLUMN public.seller_olist_integrations.olist_rate_limited_until IS 'Até quando os crons devem pular este seller sem tentar chamar a API da Tiny/Olist, por já ter sinalizado rate limit recentemente (10 min de cooldown, renovado a cada nova detecção).';

-- Acelera o skip: crons filtram sellers ainda em cooldown antes de decidir processar.
CREATE INDEX IF NOT EXISTS idx_seller_olist_integrations_rate_limited_until
  ON public.seller_olist_integrations(olist_rate_limited_until)
  WHERE olist_rate_limited_until IS NOT NULL;
