-- =============================================================================
-- DROP CORE — RLS para tabelas financeiras e relacionadas
-- Execute no Supabase SQL Editor.
-- Objetivo: owner/admin vê tudo da org; seller vê só seus dados; fornecedor vê só os seus.
-- Com service role (APIs) o RLS é bypassado; políticas protegem uso direto (anon/authenticated).
-- =============================================================================

-- 1) Adicionar seller_id e fornecedor_id em org_members (para futuro portal seller/fornecedor)
-- Quando preenchido: usuário age como aquele seller ou fornecedor e vê só seus dados.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'org_members' AND column_name = 'seller_id') THEN
    ALTER TABLE public.org_members ADD COLUMN seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL;
    COMMENT ON COLUMN public.org_members.seller_id IS 'Se preenchido: usuário é este seller e vê apenas seus dados (portal seller)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'org_members' AND column_name = 'fornecedor_id') THEN
    ALTER TABLE public.org_members ADD COLUMN fornecedor_id uuid;
    COMMENT ON COLUMN public.org_members.fornecedor_id IS 'Se preenchido: usuário é este fornecedor e vê apenas seus dados (portal fornecedor)';
  END IF;
END
$$;

-- 2) Função auxiliar: verifica se o usuário atual pode ver uma linha do ledger
-- Retorna true se: owner/admin da org OU seller da linha OU fornecedor da linha
CREATE OR REPLACE FUNCTION public.fn_user_can_access_ledger(
  p_org_id uuid,
  p_seller_id uuid,
  p_fornecedor_id uuid
)
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
        OR (om.seller_id IS NOT NULL AND om.seller_id = p_seller_id)
        OR (om.fornecedor_id IS NOT NULL AND om.fornecedor_id = p_fornecedor_id)
      )
  );
END;
$$;

-- 3) Função auxiliar: verifica acesso por org_id (owner/admin)
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

-- 4) Função auxiliar: verifica acesso a fornecedor (owner/admin da org OU fornecedor da linha)
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

-- 5) Função auxiliar: verifica acesso a seller (owner/admin da org OU seller da linha)
CREATE OR REPLACE FUNCTION public.fn_user_can_access_seller(p_org_id uuid, p_seller_id uuid)
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
        OR (om.seller_id IS NOT NULL AND om.seller_id = p_seller_id)
      )
  );
END;
$$;

-- =============================================================================
-- POLÍTICAS: apenas SELECT (INSERT/UPDATE/DELETE continuam bloqueados para client)
-- As APIs usam service role e ignoram RLS.
-- =============================================================================

-- financial_ledger
DROP POLICY IF EXISTS "rls_ledger_select" ON public.financial_ledger;
CREATE POLICY "rls_ledger_select" ON public.financial_ledger
  FOR SELECT USING (
    public.fn_user_can_access_ledger(org_id, seller_id, fornecedor_id)
  );

-- financial_ciclos_repasse
DROP POLICY IF EXISTS "rls_ciclos_select" ON public.financial_ciclos_repasse;
CREATE POLICY "rls_ciclos_select" ON public.financial_ciclos_repasse
  FOR SELECT USING (public.fn_user_can_access_org(org_id));

-- financial_repasse_fornecedor
DROP POLICY IF EXISTS "rls_repasse_fornecedor_select" ON public.financial_repasse_fornecedor;
CREATE POLICY "rls_repasse_fornecedor_select" ON public.financial_repasse_fornecedor
  FOR SELECT USING (public.fn_user_can_access_fornecedor(org_id, fornecedor_id));

-- financial_debito_descontar
DROP POLICY IF EXISTS "rls_debito_select" ON public.financial_debito_descontar;
CREATE POLICY "rls_debito_select" ON public.financial_debito_descontar
  FOR SELECT USING (public.fn_user_can_access_fornecedor(org_id, fornecedor_id));

-- sellers
DROP POLICY IF EXISTS "rls_sellers_select" ON public.sellers;
CREATE POLICY "rls_sellers_select" ON public.sellers
  FOR SELECT USING (public.fn_user_can_access_seller(org_id, id));

-- seller_movimentacoes (acesso via seller → org)
DROP POLICY IF EXISTS "rls_seller_mov_select" ON public.seller_movimentacoes;
CREATE POLICY "rls_seller_mov_select" ON public.seller_movimentacoes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = seller_movimentacoes.seller_id
        AND public.fn_user_can_access_seller(s.org_id, s.id)
    )
  );

-- seller_depositos_pix
ALTER TABLE public.seller_depositos_pix ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_depositos_pix_select" ON public.seller_depositos_pix;
CREATE POLICY "rls_depositos_pix_select" ON public.seller_depositos_pix
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = seller_depositos_pix.seller_id
        AND public.fn_user_can_access_seller(s.org_id, s.id)
    )
  );

-- =============================================================================
-- org_members: usuário pode ver apenas suas próprias linhas (para UI de perfil)
-- =============================================================================
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rls_org_members_select_own" ON public.org_members;
CREATE POLICY "rls_org_members_select_own" ON public.org_members
  FOR SELECT USING (user_id = auth.uid());

-- =============================================================================
-- RESUMO
-- =============================================================================
-- owner/admin: vê tudo da org (ledger, ciclos, repasses, débitos, sellers, depósitos)
-- seller (org_members.seller_id preenchido): vê apenas ledger/sellers/movimentações/depósitos onde seller_id = o seu
-- fornecedor (org_members.fornecedor_id preenchido): vê apenas ledger/repasses/débitos onde fornecedor_id = o seu
--
-- Para vincular um usuário a um seller: UPDATE org_members SET seller_id = '...' WHERE user_id = auth.uid() AND org_id = '...';
-- Para vincular um usuário a um fornecedor: UPDATE org_members SET fornecedor_id = '...' WHERE user_id = auth.uid() AND org_id = '...';
-- (A coluna fornecedor_id referencia tabela fornecedores se existir FK; senão é uuid livre)
