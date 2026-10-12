-- Achado 2026-10-11: ~36 funções SECURITY DEFINER que confiam no chamador (sem auth.uid()
-- interno, seguem o padrão "service_role only" da regra 9 do CLAUDE.md) estavam com EXECUTE
-- liberado pra anon/authenticated por causa do default privilege do schema public (ver
-- pg_default_acl) — ninguém tinha feito o revoke explícito. A mais grave:
-- fn_pedido_cancelar_estorno_ml cancela pedido + estorna ledger sem checar dono nenhum —
-- qualquer um com a chave anon pública podia chamar direto e cancelar/estornar pedido de
-- qualquer org. Já aplicado em produção via MCP do Supabase (2026-10-11); este arquivo é só
-- o registro, pra fonte única de schema (docs/SCHEMA.md) e auditoria futura.
--
-- As 4 fn_user_can_access_* e a rpc_touch_trusted_device ficam DE FORA de propósito — elas
-- conferem auth.uid() por dentro, são usadas por RLS/authenticated legitimamente.

revoke execute on function public.fn_pedido_cancelar_estorno_ml(uuid, uuid) from anon, authenticated;

revoke execute on function public.fn_calculadora_assinante_ai_runs_recentes(uuid, text, integer) from anon, authenticated;
revoke execute on function public.fn_calculadora_assinante_byok_configurado(uuid) from anon, authenticated;
revoke execute on function public.fn_calculadora_assinante_ml_status_get(uuid) from anon, authenticated;
revoke execute on function public.fn_calculadora_assinante_por_user_id(uuid) from anon, authenticated;
revoke execute on function public.fn_calculadora_assinante_ulisses_custo_delete(uuid, text) from anon, authenticated;
revoke execute on function public.fn_calculadora_assinante_ulisses_custo_upsert(uuid, text, numeric) from anon, authenticated;
revoke execute on function public.fn_calculadora_assinante_ulisses_custos_list(uuid) from anon, authenticated;
revoke execute on function public.fn_calculadora_assinante_ulisses_preferencias_get(uuid) from anon, authenticated;
revoke execute on function public.fn_calculadora_assinante_ulisses_preferencias_upsert(uuid, numeric, numeric, numeric, numeric, boolean, numeric, numeric, text, boolean, numeric, boolean, numeric, numeric, numeric) from anon, authenticated;

revoke execute on function public.fn_seller_ai_acoes_list(uuid, integer, timestamp with time zone) from anon, authenticated;
revoke execute on function public.fn_seller_ai_preferences_get(uuid) from anon, authenticated;
revoke execute on function public.fn_seller_ai_preferences_upsert(uuid, text, text, text, text, text) from anon, authenticated;
revoke execute on function public.fn_seller_ai_runs_list(uuid, integer, timestamp with time zone) from anon, authenticated;
revoke execute on function public.fn_seller_dashboard_analytics_30d(uuid, uuid) from anon, authenticated;
revoke execute on function public.fn_seller_ulisses_preferencias_get(uuid) from anon, authenticated;
revoke execute on function public.fn_seller_ulisses_preferencias_upsert(uuid, numeric, numeric, numeric, numeric, boolean, numeric, numeric, text, boolean, numeric, boolean, numeric) from anon, authenticated;

revoke execute on function public.fn_cron_job_status() from anon, authenticated;

revoke execute on function public.dropcore_release_anuncio_sem_sku_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_release_bling_sync_lock() from anon, authenticated;
revoke execute on function public.dropcore_release_etiqueta_ml_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_release_etiqueta_olist_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_release_ml_pedidos_reconciliacao_lock() from anon, authenticated;
revoke execute on function public.dropcore_release_pedidos_bloqueados_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_release_pedidos_erro_saldo_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_release_pedidos_postado_auto_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_release_pedidos_sla_despacho_check_lock() from anon, authenticated;
revoke execute on function public.dropcore_try_anuncio_sem_sku_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_try_bling_sync_lock() from anon, authenticated;
revoke execute on function public.dropcore_try_etiqueta_ml_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_try_etiqueta_olist_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_try_ml_pedidos_reconciliacao_lock() from anon, authenticated;
revoke execute on function public.dropcore_try_pedidos_bloqueados_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_try_pedidos_erro_saldo_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_try_pedidos_postado_auto_retry_lock() from anon, authenticated;
revoke execute on function public.dropcore_try_pedidos_sla_despacho_check_lock() from anon, authenticated;

-- Fecha a causa raiz: função nova criada pelo role postgres no schema public não nasce mais
-- aberta pra anon/authenticated por padrão. service_role continua liberado (não depende de
-- default privilege, é concedido explícito em cada função nova, como já é o padrão do projeto).
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
