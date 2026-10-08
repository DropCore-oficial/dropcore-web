-- Diagnóstico diário da Amanda avulsa (Reputação & Atendimento) — mesmo padrão do cron do
-- Andrey avulso (add-cron-gestores-ia-avulso-andrey.sql), horário diferente pra não competir
-- recurso com os outros crons de gestores de IA.
select cron.schedule(
  'gestores-ia-avulso-amanda',
  '15 8 * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/gestores-ia-avulso-amanda'); $$
);
