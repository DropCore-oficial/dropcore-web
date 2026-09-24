-- Lock advisory pro cron de SLA de postagem — espelha os locks já existentes
-- (913001, 913002, 913010, 913011, 913012, 913014, 913015, 913016 já usados) -> 913017.
CREATE OR REPLACE FUNCTION public.dropcore_try_pedidos_sla_despacho_check_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913017);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_pedidos_sla_despacho_check_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913017);
$$;

REVOKE ALL ON FUNCTION public.dropcore_try_pedidos_sla_despacho_check_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dropcore_release_pedidos_sla_despacho_check_lock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dropcore_try_pedidos_sla_despacho_check_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_pedidos_sla_despacho_check_lock() TO postgres;

-- Checa pedidos "enviado" com prazo de despacho vencido a cada 30 min.
SELECT cron.schedule(
  'dropcore-pedidos-sla-despacho-check',
  '*/30 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/pedidos-sla-despacho-check');$$
);
