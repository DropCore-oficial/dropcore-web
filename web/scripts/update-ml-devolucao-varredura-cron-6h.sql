-- Corretivo de add-ml-devolucao-varredura-cron.sql (já aplicado em produção, não reescrever
-- aquele script) — pedido do Sr Stark 2026-11-10: 1x/dia deixa uma janela grande demais
-- entre a devolução acontecer no ML e a gente travar o dinheiro antes do repasse sair.
-- Aumenta de 1x/dia pra 4x/dia (6 em 6 horas). Mesmo jobid, `cron.schedule` com o mesmo
-- nome atualiza o agendamento existente em vez de duplicar.
SELECT cron.schedule(
  'dropcore-ml-devolucao-varredura',
  '0 */6 * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/ml-devolucao-varredura', 120000);$$
);
