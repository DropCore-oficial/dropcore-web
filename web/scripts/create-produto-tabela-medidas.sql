-- Tabela de medidas por grupo de produto (ex.: DJU100000). Preenchida pelo fornecedor, aprovada pelo admin, visível ao seller.
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.produto_tabela_medidas (
  grupo_sku text NOT NULL,
  org_id uuid NOT NULL,
  fornecedor_id uuid NOT NULL,
  tipo_produto text NOT NULL DEFAULT 'generico',
  medidas jsonb NOT NULL DEFAULT '{}',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, fornecedor_id, grupo_sku)
);

COMMENT ON TABLE public.produto_tabela_medidas IS 'Tabela de dimensões por grupo (paiKey). Aprovada pelo admin; visível ao seller no catálogo.';
COMMENT ON COLUMN public.produto_tabela_medidas.medidas IS 'Ex.: { "P": { "ombro": 42, "comprimento": 60 }, "M": { ... } }';
