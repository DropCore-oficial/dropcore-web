-- Incidente 2026-11-24: estoque não atualizava pro Mercado Livre (3 bugs reais, ver
-- lib/fornecedorEstoqueSyncOnChange.ts e lib/sellerMercadoLivreSyncEstoque.ts pro código).
-- Este script cobre a parte de infra: trava anti-sobreposição pro cron que mapeia
-- SKU<->anúncio (não tinha nenhuma) e encurta 2 crons que estavam espaçados demais.

-- 1) Trava anti-sobreposição pro cron gestores-ia-sync-sku-ml (não existia nenhuma até
-- agora — esse cron roda sequencial por todo seller conectado e pode ultrapassar o
-- intervalo entre execuções).
create or replace function public.dropcore_try_gestores_ia_sync_sku_ml_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_try_advisory_lock(913026);
$$;

create or replace function public.dropcore_release_gestores_ia_sync_sku_ml_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_advisory_unlock(913026);
$$;

revoke all on function public.dropcore_try_gestores_ia_sync_sku_ml_lock() from public;
revoke all on function public.dropcore_release_gestores_ia_sync_sku_ml_lock() from public;
grant execute on function public.dropcore_try_gestores_ia_sync_sku_ml_lock() to service_role;
grant execute on function public.dropcore_release_gestores_ia_sync_sku_ml_lock() to service_role;

-- 2) Encurta os crons: gestores-ia-sync-sku-ml era 1x/dia (06:00) — era a causa raiz do
-- SKU DJU003031 do seller Felipão ficar até horas sem controle de estoque no ML antes de
-- vender um pedido real já sem estoque. ml-sync-retry era a cada 15min.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'dropcore-gestores-ia-sync-sku-ml'),
  schedule := '* * * * *'
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'dropcore-ml-sync-retry'),
  schedule := '* * * * *'
);

-- 3) Limpeza de ml_sync_log — já tem 245 mil linhas / 90MB num mês rodando devagar; com os
-- 2 crons acima indo de 1x/dia e 15min pra 1 em 1 minuto, o volume de log sobe bastante.
-- Mesmo padrão de retenção de 7 dias já usado pra cron.job_run_details/net._http_response.
select cron.schedule(
  'dropcore-cleanup-ml-sync-log',
  '15 3 * * *',
  $$ delete from public.ml_sync_log where criado_em < now() - interval '7 days'; $$
);

select cron.schedule(
  'dropcore-vacuum-ml-sync-log',
  '25 3 * * *',
  $$ vacuum full public.ml_sync_log; $$
);
