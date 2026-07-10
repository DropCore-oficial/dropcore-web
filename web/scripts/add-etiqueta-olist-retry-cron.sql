-- Lock advisory pro cron de retry da etiqueta real de envio (Olist) — espelha os locks
-- Olist/Bling/pedidos-bloqueados em supabase-cron-jobs.sql / add-bling-sync-cron.sql /
-- add-pedidos-bloqueados-retry-cron.sql, com ID numérico novo: 913001, 913002 (Olist),
-- 913010 (Bling) e 913011 (pedidos-bloqueados-retry) já usados.
CREATE OR REPLACE FUNCTION public.dropcore_try_etiqueta_olist_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913012);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_etiqueta_olist_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913012);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_etiqueta_olist_retry_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_etiqueta_olist_retry_lock() TO postgres;

-- Retry dedicado: busca a etiqueta real de envio na Olist até conseguir (a tentativa
-- original só roda uma vez, no momento da importação/promoção do pedido) -- a cada
-- 15 min (UTC), mesma cadência do retry de pedidos bloqueados.
SELECT cron.schedule(
  'dropcore-etiqueta-olist-retry',
  '*/15 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/etiqueta-olist-retry');$$
);
