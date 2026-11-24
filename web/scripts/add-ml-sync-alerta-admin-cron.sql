-- Cron novo: avisa admin quando falha de sync com o ML vira recorrente (ver
-- lib/mlSyncAlertaAdmin.ts). A cada 10 min — não precisa ser tão rápido quanto o sync em
-- si, é só o alerta.

create or replace function public.dropcore_try_ml_sync_alerta_admin_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_try_advisory_lock(913027);
$$;

create or replace function public.dropcore_release_ml_sync_alerta_admin_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_advisory_unlock(913027);
$$;

revoke all on function public.dropcore_try_ml_sync_alerta_admin_lock() from public;
revoke all on function public.dropcore_release_ml_sync_alerta_admin_lock() from public;
grant execute on function public.dropcore_try_ml_sync_alerta_admin_lock() to service_role;
grant execute on function public.dropcore_release_ml_sync_alerta_admin_lock() to service_role;

select cron.schedule(
  'dropcore-ml-sync-alerta-admin',
  '*/10 * * * *',
  $$ select public.dropcore_cron_http_post('/api/cron/ml-sync-alerta-admin'); $$
);
