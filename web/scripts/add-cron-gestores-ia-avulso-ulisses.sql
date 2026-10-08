-- Diagnóstico diário do Ulisses avulso (Ads/Preço) — mesmo padrão dos crons do Andrey/Amanda
-- avulso, horário diferente pra não competir recurso.
select cron.schedule(
  'gestores-ia-avulso-ulisses',
  '30 8 * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-ulisses'); $$
);
