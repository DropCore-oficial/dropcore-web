-- Reagenda retry catch-all de pedido bloqueado/sem estoque: de 15 min para 1 min.
-- Rode no Supabase SQL Editor (produção). Não altera outros crons dropcore-*.
-- Lock advisory (913011) e funções dropcore_try/release_pedidos_bloqueados_retry_lock
-- já existem (add-pedidos-bloqueados-retry-cron.sql) — só reagenda o job.

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'dropcore-pedidos-bloqueados-retry';

SELECT cron.schedule(
  'dropcore-pedidos-bloqueados-retry',
  '* * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/pedidos-bloqueados-retry');$$
);

-- Conferir:
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'dropcore-pedidos-bloqueados-retry';
