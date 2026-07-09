-- search_path fixo nas funções que estavam com search_path mutável.
-- Não muda comportamento (todas já referenciam objetos do schema public),
-- só fecha a brecha de search_path hijacking em funções SECURITY DEFINER.
ALTER FUNCTION public.fn_segunda_feira_semana(date) SET search_path = public;
ALTER FUNCTION public.fn_ciclo_repasse(timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.fn_seller_saldo_from_ledger(uuid) SET search_path = public;
ALTER FUNCTION public.fn_sync_seller_saldo_from_ledger() SET search_path = public;
ALTER FUNCTION public.is_active_org_member(uuid) SET search_path = public;
ALTER FUNCTION public.is_org_member(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.is_org_privileged(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.can_view_finance(uuid) SET search_path = public;
ALTER FUNCTION public.rpc_add_org_member(uuid, uuid, text) SET search_path = public;

-- rpc_get_emails_by_user_ids / rpc_get_user_id_by_email: lookup de PII (e-mail <-> user_id).
-- Confirmado por busca no código que só são chamadas via supabaseAdmin (service role)
-- em web/app/api/org/membros/route.ts. Nenhum client-component chama direto.
REVOKE EXECUTE ON FUNCTION public.rpc_get_emails_by_user_ids(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_emails_by_user_ids(uuid[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_user_id_by_email(text) TO service_role;

-- dropcore_cron_http_post: dispara HTTP POST arbitrário. Só é chamada pelos jobs do
-- pg_cron (rodam como role postgres), confirmado em web/scripts/supabase-cron-jobs.sql.
REVOKE ALL ON FUNCTION public.dropcore_cron_http_post(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dropcore_cron_http_post(text, integer) TO postgres;

-- rpc_add_org_member: não é chamada em nenhum lugar do app (membros são inseridos
-- direto via supabaseAdmin.from("org_members").insert(...) em
-- web/app/api/org/membros/route.ts). Tranca por segurança.
REVOKE EXECUTE ON FUNCTION public.rpc_add_org_member(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
