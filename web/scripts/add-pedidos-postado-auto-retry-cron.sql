-- Lock advisory pro cron da Frente 3 (auto-marcar postado) — espelha os locks
-- Olist/Bling/pedidos-bloqueados/etiqueta-retry já usados: 913001, 913002 (Olist),
-- 913010 (Bling), 913011 (pedidos-bloqueados-retry), 913012 (etiqueta-olist-retry,
-- também usado por engano em add-pedidos-erro-saldo-retry-cron.sql — colisão pré-existente,
-- não mexida aqui). ID novo usado: 913014.
CREATE OR REPLACE FUNCTION public.dropcore_try_pedidos_postado_auto_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913014);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_pedidos_postado_auto_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913014);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_pedidos_postado_auto_retry_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_pedidos_postado_auto_retry_lock() TO postgres;

-- Reconsulta a situação de pedidos "enviado" já importados (a Olist atualiza sozinha pra
-- "enviado"/"entregue" quando o marketplace confirma o despacho) e promove pra
-- "aguardando_repasse" sem depender do fornecedor clicar "marcar postado" -- a cada 30 min
-- (UTC), cadência mais espaçada que a de etiqueta por não ser tão urgente por pedido e pra
-- reduzir pressão total na API da Olist.
SELECT cron.schedule(
  'dropcore-pedidos-postado-auto-retry',
  '*/30 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/pedidos-postado-auto-retry');$$
);
