-- Fecha os locks de cron que ficaram abertos pra anon/authenticated desde a criação (mesmo
-- bug recorrente: GRANT ... TO postgres sozinho não revoga os outros roles, função SECURITY
-- DEFINER nasce aberta por default do Supabase). Risco era baixo (só dá pra travar/destravar
-- o advisory lock do cron, não expõe dado nenhum), mas não devia ficar assim.

revoke all on function public.dropcore_try_anuncio_sem_sku_retry_lock from public, anon, authenticated;
revoke all on function public.dropcore_release_anuncio_sem_sku_retry_lock from public, anon, authenticated;
grant execute on function public.dropcore_try_anuncio_sem_sku_retry_lock to postgres;
grant execute on function public.dropcore_release_anuncio_sem_sku_retry_lock to postgres;

revoke all on function public.dropcore_try_bling_sync_lock from public, anon, authenticated;
revoke all on function public.dropcore_release_bling_sync_lock from public, anon, authenticated;
grant execute on function public.dropcore_try_bling_sync_lock to postgres;
grant execute on function public.dropcore_release_bling_sync_lock to postgres;

revoke all on function public.dropcore_try_etiqueta_olist_retry_lock from public, anon, authenticated;
revoke all on function public.dropcore_release_etiqueta_olist_retry_lock from public, anon, authenticated;
grant execute on function public.dropcore_try_etiqueta_olist_retry_lock to postgres;
grant execute on function public.dropcore_release_etiqueta_olist_retry_lock to postgres;

revoke all on function public.dropcore_try_ml_pedidos_reconciliacao_lock from public, anon, authenticated;
revoke all on function public.dropcore_release_ml_pedidos_reconciliacao_lock from public, anon, authenticated;
grant execute on function public.dropcore_try_ml_pedidos_reconciliacao_lock to postgres;
grant execute on function public.dropcore_release_ml_pedidos_reconciliacao_lock to postgres;

revoke all on function public.dropcore_try_ml_sync_retry_lock from public, anon, authenticated;
revoke all on function public.dropcore_release_ml_sync_retry_lock from public, anon, authenticated;
grant execute on function public.dropcore_try_ml_sync_retry_lock to postgres;
grant execute on function public.dropcore_release_ml_sync_retry_lock to postgres;

revoke all on function public.dropcore_try_pedidos_bloqueados_retry_lock from public, anon, authenticated;
revoke all on function public.dropcore_release_pedidos_bloqueados_retry_lock from public, anon, authenticated;
grant execute on function public.dropcore_try_pedidos_bloqueados_retry_lock to postgres;
grant execute on function public.dropcore_release_pedidos_bloqueados_retry_lock to postgres;

revoke all on function public.dropcore_try_pedidos_erro_saldo_retry_lock from public, anon, authenticated;
revoke all on function public.dropcore_release_pedidos_erro_saldo_retry_lock from public, anon, authenticated;
grant execute on function public.dropcore_try_pedidos_erro_saldo_retry_lock to postgres;
grant execute on function public.dropcore_release_pedidos_erro_saldo_retry_lock to postgres;

revoke all on function public.dropcore_try_pedidos_postado_auto_retry_lock from public, anon, authenticated;
revoke all on function public.dropcore_release_pedidos_postado_auto_retry_lock from public, anon, authenticated;
grant execute on function public.dropcore_try_pedidos_postado_auto_retry_lock to postgres;
grant execute on function public.dropcore_release_pedidos_postado_auto_retry_lock to postgres;
