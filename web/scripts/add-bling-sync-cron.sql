-- Lock advisory pro cron de rede de segurança do Bling (espelha os locks Olist
-- em supabase-cron-jobs.sql, com ID numérico novo pra não colidir: 913001 e
-- 913002 já usados por Olist).
CREATE OR REPLACE FUNCTION public.dropcore_try_bling_sync_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913010);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_bling_sync_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913010);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_bling_sync_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_bling_sync_lock() TO postgres;

-- Reprocessa eventos de pedido Bling recentes sem pedido correspondente ainda —
-- a cada 5 min (UTC). Não precisa ser 1x/min como a Olist porque não é a via
-- principal (o webhook fire-and-forget já cobre o caminho rápido), é só rede de
-- segurança pra falha transitória.
SELECT cron.schedule(
  'dropcore-bling-sync',
  '*/5 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/bling-sync');$$
);
