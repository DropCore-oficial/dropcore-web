-- Segurança: só o backend (service_role) pode executar rpc_toggle_finance_access.
-- A API /api/org/toggle-finance usa supabaseAdmin (service role) + valida owner/admin.
--
-- Execute no Supabase SQL Editor.

REVOKE EXECUTE ON FUNCTION rpc_toggle_finance_access(UUID, UUID, BOOLEAN) FROM authenticated;
REVOKE EXECUTE ON FUNCTION rpc_toggle_finance_access(UUID, UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION rpc_toggle_finance_access(UUID, UUID, BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION rpc_toggle_finance_access(UUID, UUID, BOOLEAN) TO service_role;

-- Conferir (esperado: postgres + service_role; sem anon/authenticated):
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
--   AND routine_name = 'rpc_toggle_finance_access';
