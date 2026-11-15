-- Remoção completa do suporte a Bling (zero uso real: seller_bling_integrations e
-- bling_webhook_logs com 0 linhas, nunca ninguém conectou, sem FK de nenhuma outra tabela
-- apontando pra elas — confirmado antes de rodar). Olist mantém tabela/rotas/código
-- intactos, só perde os crons automáticos (zero uso real hoje também, mas com conexões já
-- configuradas — ver memória de projeto). Decisão 2026-11-15, motivada por alerta de Disk
-- IO Budget do Supabase: dropcore-olist-sync/dropcore-fornecedor-olist-sync-estoque
-- rodavam a cada minuto, 24/7, pra uma feature desativada do menu desde 2026-11-04.

select cron.unschedule('dropcore-bling-sync');

drop table if exists public.bling_webhook_logs;
drop table if exists public.seller_bling_integrations;

drop function if exists public.dropcore_try_bling_sync_lock();
drop function if exists public.dropcore_release_bling_sync_lock();

-- Olist: só desliga o sync automático. Tabela/rotas/tokens de conexão ficam intactos.
select cron.unschedule('dropcore-olist-sync');
select cron.unschedule('dropcore-fornecedor-olist-sync-estoque');
select cron.unschedule('dropcore-olist-sync-precos');
select cron.unschedule('dropcore-etiqueta-olist-retry');
