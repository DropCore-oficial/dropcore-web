-- Agenda o próprio healthcheck de crons (web/app/api/cron/cron-healthcheck/route.ts).
-- Roda depois dos outros crons diários (07:00 UTC, mensalidades-mes é 09:00, os de hora
-- em hora já tiveram várias chances) pra checar com dado fresco.
SELECT cron.schedule(
  'dropcore-cron-healthcheck',
  '0 7 * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/cron-healthcheck');$$
);
