-- Diagnóstico principal do Andrey avulso não tinha NENHUM cron (só rodava via clique manual
-- em "Rodar de novo agora") — o hub tem gestores-ia-submeter/resultado, mas filtrado "por
-- seller", não cobre calculadora_assinantes. Roda 1x/dia, horário diferente do cron do hub
-- (07:00 UTC) pra não competir recurso.
select cron.schedule(
  'gestores-ia-avulso-andrey',
  '0 8 * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-andrey'); $$
);
