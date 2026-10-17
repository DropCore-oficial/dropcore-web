-- "Reunião matinal" dos gestores avulso — roda às 9h09, depois que Anúncio (8h), SAC (8h15),
-- ADS (8h30) e Estoque (8h45) já terminaram, e notifica o assinante (sino + e-mail) com o
-- resumo de top 3 ações.
-- Aplicado em produção em 2026-10-16.
select cron.schedule(
  'gestores-ia-avulso-resumo-diario',
  '9 9 * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-resumo-diario'); $$
);
