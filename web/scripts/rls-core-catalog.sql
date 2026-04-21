-- =============================================================================
-- DropCore — RLS em orgs, fornecedores e skus (catálogo / núcleo)
-- Execute no Supabase SQL Editor (um único script).
--
-- Cria/atualiza as funções auxiliares abaixo (mesma lógica de rls-financeiro.sql).
-- Se você já rodou rls-financeiro.sql, isto só faz CREATE OR REPLACE (idempotente).
--
-- Efeito: usuários autenticados que consultarem o PostgREST direto (JWT)
-- só enxergam linhas permitidas. As APIs Next.js com service_role ignoram RLS.
-- =============================================================================

-- Função: owner/admin da org
CREATE OR REPLACE FUNCTION public.fn_user_can_access_org(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.user_id = auth.uid()
      AND om.org_id = p_org_id
      AND om.role_base IN ('owner','admin')
  );
END;
$$;

-- Função: owner/admin da org OU usuário vinculado ao fornecedor (org_members.fornecedor_id)
CREATE OR REPLACE FUNCTION public.fn_user_can_access_fornecedor(p_org_id uuid, p_fornecedor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.user_id = auth.uid()
      AND (
        (om.role_base IN ('owner','admin') AND om.org_id = p_org_id)
        OR (om.fornecedor_id IS NOT NULL AND om.fornecedor_id = p_fornecedor_id)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_user_can_access_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_user_can_access_fornecedor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_user_can_access_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_can_access_fornecedor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_can_access_org(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_user_can_access_fornecedor(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- orgs: qualquer membro da org vê a própria org (plano, etc.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_orgs_select_member" ON public.orgs;
CREATE POLICY "rls_orgs_select_member" ON public.orgs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.user_id = auth.uid()
        AND om.org_id = orgs.id
    )
  );

-- ---------------------------------------------------------------------------
-- fornecedores: owner/admin da org OU usuário vinculado a este fornecedor
-- ---------------------------------------------------------------------------
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_fornecedores_select" ON public.fornecedores;
CREATE POLICY "rls_fornecedores_select" ON public.fornecedores
  FOR SELECT USING (public.fn_user_can_access_fornecedor(org_id, id));

-- ---------------------------------------------------------------------------
-- skus: owner/admin da org OU fornecedor dono da linha
-- ---------------------------------------------------------------------------
ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_skus_select" ON public.skus;
CREATE POLICY "rls_skus_select" ON public.skus
  FOR SELECT USING (
    public.fn_user_can_access_org(org_id)
    OR public.fn_user_can_access_fornecedor(org_id, fornecedor_id)
  );
