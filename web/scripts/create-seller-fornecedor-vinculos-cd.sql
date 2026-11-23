-- Centro de Distribuição (CD) DropCore: vínculo seller<->fornecedor multi (só para
-- fornecedores que operam no CD). Fornecedor avulso (fora do CD) continua usando
-- sellers.fornecedor_id, sem mudança. Execute no SQL Editor do Supabase (ou via MCP).

CREATE TABLE IF NOT EXISTS public.seller_fornecedor_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE RESTRICT,
  vinculado_em timestamptz NOT NULL DEFAULT now(),
  desvinculado_em timestamptz,
  desvinculo_liberado boolean NOT NULL DEFAULT false,
  desvinculo_liberado_em timestamptz,
  criado_por_tipo text NOT NULL CHECK (criado_por_tipo IN ('seller', 'admin')),
  criado_por_user_id uuid,
  cortesia boolean NOT NULL DEFAULT false,
  cortesia_ate date,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_seller_fornecedor_vinculo_ativo UNIQUE NULLS NOT DISTINCT (seller_id, fornecedor_id, desvinculado_em)
);

COMMENT ON TABLE public.seller_fornecedor_vinculos IS
  'Vínculo seller<->fornecedor dentro do CD DropCore (multi-fornecedor simultâneo). '
  'desvinculado_em NULL = vínculo ativo. Avulso fora do CD continua em sellers.fornecedor_id.';

CREATE INDEX IF NOT EXISTS idx_sfv_seller_ativo ON public.seller_fornecedor_vinculos (seller_id) WHERE desvinculado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_sfv_fornecedor_ativo ON public.seller_fornecedor_vinculos (fornecedor_id) WHERE desvinculado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_sfv_org ON public.seller_fornecedor_vinculos (org_id);

ALTER TABLE public.seller_fornecedor_vinculos ENABLE ROW LEVEL SECURITY;

-- Deny-all: acesso só via RPC SECURITY DEFINER (service_role). Nenhuma policy permissiva
-- pra authenticated/anon — seguindo o mesmo padrão de tabelas sensíveis do projeto.
DROP POLICY IF EXISTS rls_sfv_deny_all ON public.seller_fornecedor_vinculos;
CREATE POLICY rls_sfv_deny_all ON public.seller_fornecedor_vinculos
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.seller_fornecedor_vinculos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.seller_fornecedor_vinculos TO service_role;
