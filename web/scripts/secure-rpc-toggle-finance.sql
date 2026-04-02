-- Segurança: revogar execução da RPC rpc_toggle_finance_access do role authenticated.
-- Assim apenas o backend (service role) pode chamá-la; a API /api/org/toggle-finance já valida owner/admin.
--
-- Execute no Supabase SQL Editor.

REVOKE EXECUTE ON FUNCTION rpc_toggle_finance_access(UUID, UUID, BOOLEAN) FROM authenticated;

-- Opcional: garantir que apenas service_role e o usuário do backend possam executar
-- (no Supabase, as funções são executadas pelo role do cliente que chama; o Next.js usa service_role no servidor)
-- GRANT EXECUTE ON FUNCTION rpc_toggle_finance_access(UUID, UUID, BOOLEAN) TO service_role;
