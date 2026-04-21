-- =============================================================================
-- DropCore — RLS em orgs, fornecedores e skus (catálogo / núcleo)
-- Execute no Supabase SQL Editor.
--
-- Pré-requisito: web/scripts/rls-financeiro.sql já executado, pois usa:
--   public.fn_user_can_access_org(uuid)
--   public.fn_user_can_access_fornecedor(uuid, uuid)
--
-- Efeito: usuários autenticados que consultarem o PostgREST direto (JWT)
-- só enxergam linhas permitidas. As APIs Next.js com service_role ignoram RLS.
-- =============================================================================

DO $pre$
BEGIN
  IF to_regproc('public.fn_user_can_access_org(uuid)') IS NULL
     OR to_regproc('public.fn_user_can_access_fornecedor(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Execute antes web/scripts/rls-financeiro.sql (funções fn_user_can_access_org / fn_user_can_access_fornecedor ausentes).';
  END IF;
END
$pre$;

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
