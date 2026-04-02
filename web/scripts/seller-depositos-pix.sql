-- Depósitos PIX pendentes: registrar depósito e aprovar manualmente quando o valor entrar na conta.
-- Depois dá para automatizar via webhook/API do banco.

CREATE TABLE IF NOT EXISTS public.seller_depositos_pix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  valor numeric NOT NULL CHECK (valor > 0),
  chave_pix text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'cancelado')),
  referencia text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  aprovado_em timestamptz,
  aprovado_por uuid
);

CREATE INDEX IF NOT EXISTS idx_seller_depositos_pix_org ON public.seller_depositos_pix(org_id);
CREATE INDEX IF NOT EXISTS idx_seller_depositos_pix_seller ON public.seller_depositos_pix(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_depositos_pix_status ON public.seller_depositos_pix(status);
CREATE INDEX IF NOT EXISTS idx_seller_depositos_pix_criado ON public.seller_depositos_pix(criado_em DESC);

COMMENT ON TABLE public.seller_depositos_pix IS 'Depósitos PIX pendentes de aprovação manual (futuro: automação via banco)';
