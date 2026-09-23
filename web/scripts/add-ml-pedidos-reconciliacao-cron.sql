-- Lock advisory pro cron de reconciliação de pedidos ML (espelha os locks Olist/Bling/
-- bloqueados em supabase-cron-jobs.sql / add-pedidos-bloqueados-retry-cron.sql, com ID
-- numérico novo: 913001, 913002 (Olist), 913010 (Bling), 913011 (bloqueados), 913012
-- (etiqueta-olist-retry), 913014 (postado-auto-retry) já usados).
CREATE OR REPLACE FUNCTION public.dropcore_try_ml_pedidos_reconciliacao_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913015);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_ml_pedidos_reconciliacao_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913015);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_ml_pedidos_reconciliacao_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_ml_pedidos_reconciliacao_lock() TO postgres;

-- Rede de segurança pro webhook do ML — a cada 15 min (UTC), mesmo ritmo do
-- pedidos-bloqueados-retry. Varre pedidos recentes (janela de 3h) de cada seller com ML
-- direto conectado e sem Olist ativo, e importa o que o webhook não pegou.
SELECT cron.schedule(
  'dropcore-ml-pedidos-reconciliacao',
  '*/15 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/ml-pedidos-reconciliacao');$$
);
