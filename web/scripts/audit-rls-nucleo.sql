-- =============================================================================
-- DropCore — Auditoria de RLS (somente leitura)
-- Rode no Supabase SQL Editor. Não altera nada.
--
-- Depois de consolidar políticas, pode rodar (uma vez) em produção:
--   web/scripts/rls-legacy-cleanup.sql
-- e auditar de novo aqui.
-- =============================================================================

SELECT
  tablename AS table_name,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'orgs',
    'org_members',
    'skus',
    'fornecedores',
    'sellers',
    'financial_ledger',
    'notifications'
  )
ORDER BY tablename;

-- Políticas existentes nessas tabelas
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual IS NOT NULL AS has_using,
  with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'orgs',
    'org_members',
    'skus',
    'fornecedores',
    'sellers',
    'financial_ledger',
    'notifications'
  )
ORDER BY tablename, policyname;
