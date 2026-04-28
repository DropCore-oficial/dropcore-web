-- Rascunho de criação de produtos no portal do fornecedor (ex.: «Criar variantes»).
-- Um registro por fornecedor + tipo de fluxo. Execute no Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS public.fornecedor_produto_rascunhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores (id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'criar-variantes-v1',
  payload jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fornecedor_produto_rascunhos_fornecedor_tipo_key UNIQUE (fornecedor_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_fornecedor_produto_rascunhos_org
  ON public.fornecedor_produto_rascunhos (org_id);

COMMENT ON TABLE public.fornecedor_produto_rascunhos IS
  'JSON do formulário de rascunho; a API fornecedor grava após auth (service role).';

-- Opcional: RLS desligado — acesso só via rotas Next com supabaseAdmin (igual a outras tabelas internas).
