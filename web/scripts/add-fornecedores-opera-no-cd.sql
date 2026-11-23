-- Centro de Distribuição (CD) DropCore: sinalizador de quem opera no CD físico.
-- Execute no SQL Editor do Supabase (ou via MCP).

ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS opera_no_cd boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fornecedores.opera_no_cd IS
  'true = estoque físico desse fornecedor mora no CD DropCore (conferência de entrada, '
  'estoque somente leitura pro fornecedor, despacho centralizado pelo operador DropCore).';

CREATE INDEX IF NOT EXISTS idx_fornecedores_opera_no_cd ON public.fornecedores (org_id) WHERE opera_no_cd = true;
