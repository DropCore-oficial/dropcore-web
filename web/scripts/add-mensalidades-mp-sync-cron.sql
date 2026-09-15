-- dropcore-mensalidades-mp-sync estava escrito em supabase-cron-jobs.sql como se
-- estivesse ativo (não comentado), mas nunca tinha sido de fato aplicado no banco —
-- achado ao construir o healthcheck de crons (2026-09-14): confirma pagamento PIX de
-- mensalidade em segundo plano; sem ele só confirmava quando a tela de bloqueio estava
-- aberta ativamente (MensalidadeBloqueioGate faz o próprio sync no polling do frontend).

SELECT cron.schedule(
  'dropcore-mensalidades-mp-sync',
  '*/5 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/mensalidades-mp-sync');$$
);
