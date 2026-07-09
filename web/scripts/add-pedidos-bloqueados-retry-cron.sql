-- Lock advisory pro cron catch-all de pedidos bloqueados (espelha os locks Olist/Bling
-- em supabase-cron-jobs.sql / add-bling-sync-cron.sql, com ID numérico novo: 913001,
-- 913002 (Olist) e 913010 (Bling) já usados).
CREATE OR REPLACE FUNCTION public.dropcore_try_pedidos_bloqueados_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913011);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_pedidos_bloqueados_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913011);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_pedidos_bloqueados_retry_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_pedidos_bloqueados_retry_lock() TO postgres;

-- Catch-all: reavalia pedidos bloqueado que os gatilhos pontuais (habilitar SKU,
-- reimport duplicado) não pegaram -- a cada 15 min (UTC). Não precisa ser mais frequente,
-- bloqueio não é evento de alta frequência e os gatilhos pontuais já cobrem o caso comum
-- quase instantaneamente.
SELECT cron.schedule(
  'dropcore-pedidos-bloqueados-retry',
  '*/15 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/pedidos-bloqueados-retry');$$
);
