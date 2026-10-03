-- Limpeza do bloat de cron.job_run_details (tabela interna do pg_cron) e correção definitiva
-- do bloat recorrente de net._http_response — rodado em produção em 2026-10-03.
--
-- Contexto: cron.job_run_details nunca teve limpeza desde que o projeto começou a usar
-- pg_cron (22/05/2026) — chegou a 519.951 linhas / 197 MB. net._http_response já tinha
-- limpeza diária (dropcore-cleanup-net-http-response, ver supabase-cron-jobs.sql) mas só
-- fazia DELETE sem VACUUM — o espaço nunca era devolvido ao banco, voltando a acumular
-- bloat com o tempo (chegou a 63 MB de novo depois do fix original de 17/08).
--
-- Banco total: 339 MB -> 181 MB depois de rodar isso uma vez.

-- 1) Limpeza única (já rodada manualmente em 2026-10-03 via mcp supabase):
--    delete from cron.job_run_details where end_time < now() - interval '7 days';
--    delete from net._http_response where created < now() - interval '2 days';
--    vacuum full cron.job_run_details;
--    vacuum full net._http_response;

-- 2) Manutenção permanente (2 crons novos, já aplicados):
SELECT cron.schedule(
  'dropcore-cleanup-cron-job-run-details',
  '10 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days'; $$
);

-- VACUUM FULL trava a tabela por alguns segundos (ACCESS EXCLUSIVE) — só afeta o registro
-- de execução de cron que terminar nesse exato instante (fica na fila, não falha); não
-- afeta a execução dos crons em si. Rodado de madrugada (03:20 UTC) de propósito.
SELECT cron.schedule(
  'dropcore-vacuum-cron-logs',
  '20 3 * * *',
  $$ vacuum full net._http_response; vacuum full cron.job_run_details; $$
);

-- Conferir:
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname LIKE 'dropcore-%';
