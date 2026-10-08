-- Cron B do Andrey avulso: confere o batch pendente (Anthropic Batch API, até 24h pra
-- processar) e grava o resultado quando terminar — roda a cada 15min, mesmo padrão do cron B
-- do hub (dropcore-gestores-ia-resultado em supabase-cron-jobs.sql).
select cron.schedule(
  'gestores-ia-avulso-andrey-resultado',
  '*/15 * * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-andrey-resultado'); $$
);
