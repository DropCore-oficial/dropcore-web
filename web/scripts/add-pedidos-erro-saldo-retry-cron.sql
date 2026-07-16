-- Lock advisory pro cron catch-all de pedidos erro_saldo (espelha
-- add-pedidos-bloqueados-retry-cron.sql, ID numérico novo: 913011 já usado por bloqueado).
CREATE OR REPLACE FUNCTION public.dropcore_try_pedidos_erro_saldo_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913012);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_pedidos_erro_saldo_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913012);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_pedidos_erro_saldo_retry_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_pedidos_erro_saldo_retry_lock() TO postgres;

-- Catch-all + expiração: reavalia pedidos erro_saldo que o gatilho pontual (recarga de
-- crédito / aprovação PIX) não pegou, e expira (devolve estoque, cancela) os parados há
-- mais de 48h -- a cada 1 min (UTC). Mais frequente que o de bloqueado (15 min) porque
-- aqui o fornecedor está esperando pra postar um pedido já vendido de verdade; o advisory
-- lock evita execuções sobrepostas caso alguma rodada demore mais que 1 min.
SELECT cron.schedule(
  'dropcore-pedidos-erro-saldo-retry',
  '* * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/pedidos-erro-saldo-retry');$$
);
