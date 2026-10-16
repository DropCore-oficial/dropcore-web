-- Diagnóstico diário do Estoque avulso — mesmo padrão dos crons dos 3 gestores irmãos
-- (add-cron-gestores-ia-avulso-amanda.sql etc), horário diferente pra não competir recurso.
-- Aplicado em produção em 2026-10-16.
select cron.schedule(
  'gestores-ia-avulso-estoque',
  '45 8 * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-estoque'); $$
);
