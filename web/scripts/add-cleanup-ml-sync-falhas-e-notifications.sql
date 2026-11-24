-- Incidente 2026-11-24: nem ml_sync_falhas nem notifications tinham qualquer limpeza — Sr
-- Stark pegou isso antes de eu adicionar mais volume ainda (alerta recorrente pro admin).
-- ml_sync_falhas: 1543 linhas (1173 resolvido + 327 esgotado + 43 pendente), notifications:
-- 19,5 mil linhas desde 2026-03, 14MB.

-- ml_sync_falhas: nunca apaga "pendente" (fila de retry ativa) — só resolvido/esgotado
-- depois de 14 dias (esgotado fica um pouco mais pra dar tempo de investigar antes de sumir).
select cron.schedule(
  'dropcore-cleanup-ml-sync-falhas',
  '12 3 * * *',
  $$ delete from public.ml_sync_falhas where status in ('resolvido','esgotado') and criado_em < now() - interval '14 days'; $$
);

-- notifications: só apaga já lida (lido=true) — não lida fica até o usuário ver, sem prazo.
-- 180 dias é bem mais generoso que ml_sync_log/falhas de propósito: é histórico visível
-- pro próprio usuário (seller/fornecedor/admin), não log técnico interno.
select cron.schedule(
  'dropcore-cleanup-notifications',
  '13 3 * * *',
  $$ delete from public.notifications where lido = true and criado_em < now() - interval '180 days'; $$
);

select cron.schedule(
  'dropcore-vacuum-ml-sync-falhas',
  '26 3 * * *',
  $$ vacuum full public.ml_sync_falhas; $$
);

select cron.schedule(
  'dropcore-vacuum-notifications',
  '27 3 * * *',
  $$ vacuum full public.notifications; $$
);
