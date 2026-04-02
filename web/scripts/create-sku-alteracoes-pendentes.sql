-- Alterações de produto enviadas pelo fornecedor, aguardando aprovação do admin (estilo Shein)
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.sku_alteracoes_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL,
  org_id uuid NOT NULL,
  dados_propostos jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  motivo_rejeicao text,
  analisado_em timestamptz,
  analisado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sku_alteracoes_sku ON public.sku_alteracoes_pendentes(sku_id);
CREATE INDEX IF NOT EXISTS idx_sku_alteracoes_fornecedor ON public.sku_alteracoes_pendentes(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_sku_alteracoes_org_status ON public.sku_alteracoes_pendentes(org_id, status);
CREATE INDEX IF NOT EXISTS idx_sku_alteracoes_criado ON public.sku_alteracoes_pendentes(criado_em DESC);

COMMENT ON TABLE public.sku_alteracoes_pendentes IS 'Edições de produto enviadas pelo fornecedor, aguardando aprovação do admin';
