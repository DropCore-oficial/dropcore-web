-- Tabela de medidas por grupo de produto (ex.: DJU001000).
-- PRODUÇÃO já usa: grupo_key (PK), tipo_produto, medidas, criado_em, atualizado_em.
-- Ver migrate-produto-tabela-medidas-doc.sql — não recriar com org_id/fornecedor_id em prod.

CREATE TABLE IF NOT EXISTS public.produto_tabela_medidas (
  grupo_key text PRIMARY KEY,
  tipo_produto text NOT NULL DEFAULT 'generico',
  medidas jsonb NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.produto_tabela_medidas IS 'Tabela de dimensões por grupo (paiKey). Aprovada pelo admin; visível ao seller no catálogo.';
COMMENT ON COLUMN public.produto_tabela_medidas.medidas IS 'Ex.: { "P": { "ombro": 42, "comprimento": 60 }, "M": { ... } }';
