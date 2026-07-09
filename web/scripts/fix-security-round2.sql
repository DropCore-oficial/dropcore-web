-- Consolida as 3 RLS policies sobrepostas de repasses_fornecedor em 2, sem mudar
-- nenhum acesso: junta select_member + repasses_select_finance num único SELECT.
DROP POLICY IF EXISTS repasses_fornecedor_select_member ON public.repasses_fornecedor;
DROP POLICY IF EXISTS repasses_select_finance ON public.repasses_fornecedor;

CREATE POLICY rls_repasses_fornecedor_select ON public.repasses_fornecedor
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = repasses_fornecedor.org_id
        AND om.user_id = (select auth.uid())
        AND om.ativo = true
    )
    OR public.can_view_finance(org_id)
  );

-- Trava EXECUTE para anon/authenticated nas 18 funções SECURITY DEFINER confirmadas
-- (via busca no código) como usadas só via supabaseAdmin (service role), triggers, ou
-- não referenciadas em lugar nenhum do repo. DropCore não tem vitrine pública, então
-- nenhum caso legítimo de anon/authenticated chamando essas RPCs direto.
REVOKE ALL ON FUNCTION public.dropcore_release_fornecedor_olist_estoque_sync_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dropcore_release_fornecedor_olist_estoque_sync_lock() TO service_role;

REVOKE ALL ON FUNCTION public.dropcore_release_olist_sync_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dropcore_release_olist_sync_lock() TO service_role;

REVOKE ALL ON FUNCTION public.dropcore_try_fornecedor_olist_estoque_sync_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dropcore_try_fornecedor_olist_estoque_sync_lock() TO service_role;

REVOKE ALL ON FUNCTION public.dropcore_try_olist_sync_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dropcore_try_olist_sync_lock() TO service_role;

REVOKE ALL ON FUNCTION public.fn_calculadora_recebimentos_totais() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calculadora_recebimentos_totais() TO service_role;

REVOKE ALL ON FUNCTION public.fn_fornecedor_dashboard_stats(uuid, uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_dashboard_stats(uuid, uuid, timestamp with time zone, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.fn_org_dashboard_pro_30d(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_org_dashboard_pro_30d(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fn_org_dashboard_stats_agg(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_org_dashboard_stats_agg(uuid, timestamp with time zone, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.fn_org_repasse_futuros_preview(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_org_repasse_futuros_preview(uuid, date) TO service_role;

-- trigger function: nenhum client deveria poder chamá-la manualmente via RPC
REVOKE ALL ON FUNCTION public.fn_sync_seller_saldo_from_ledger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_seller_saldo_from_ledger() TO service_role;

REVOKE ALL ON FUNCTION public.rpc_debitar_estoque_sku(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_debitar_estoque_sku(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_liberar_reserva_estoque_sku(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_liberar_reserva_estoque_sku(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_reservar_estoque_sku(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reservar_estoque_sku(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_reverter_estoque_sku(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reverter_estoque_sku(uuid, integer) TO service_role;

-- orfas no codigo local (nao referenciadas em nenhum .ts/.sql do repo) -- travar por
-- seguranca; reversivel (basta re-conceder EXECUTE) se alguma automacao externa precisar
REVOKE ALL ON FUNCTION public.rpc_delete_sku_pai_safe(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_sku_pai_safe(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_delete_sku_safe(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_sku_safe(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_set_member_active(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_set_member_active(uuid, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_set_member_role(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_set_member_role(uuid, uuid, text) TO service_role;
