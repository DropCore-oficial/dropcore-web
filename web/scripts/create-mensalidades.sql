-- Mensalidades de sellers e fornecedores (receita DropCore)
-- Execute no Supabase SQL Editor.
-- Seller: Starter R$ 97,90 | Pro R$ 147,90
-- Fornecedor: R$ 97,90 (plano único)

CREATE TABLE IF NOT EXISTS public.financial_planos (
  plano text PRIMARY KEY,
  valor_seller numeric NOT NULL DEFAULT 97.90 CHECK (valor_seller >= 0),
  valor_fornecedor numeric NOT NULL DEFAULT 97.90 CHECK (valor_fornecedor >= 0)
);

INSERT INTO public.financial_planos (plano, valor_seller, valor_fornecedor)
VALUES
  ('default', 97.90, 97.90),
  ('Starter', 97.90, 97.90),
  ('Pro', 147.90, 97.90)
ON CONFLICT (plano) DO UPDATE SET
  valor_seller = EXCLUDED.valor_seller,
  valor_fornecedor = EXCLUDED.valor_fornecedor;

-- Mensalidades geradas por ciclo (mês)
CREATE TABLE IF NOT EXISTS public.financial_mensalidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('seller', 'fornecedor')),
  entidade_id uuid NOT NULL,
  ciclo date NOT NULL,  -- primeiro dia do mês (YYYY-MM-01)
  valor numeric NOT NULL CHECK (valor >= 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'inadimplente', 'cancelado')),
  vencimento_em date,
  pago_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tipo, entidade_id, ciclo)
);

CREATE INDEX IF NOT EXISTS idx_mensalidades_org ON public.financial_mensalidades(org_id);
CREATE INDEX IF NOT EXISTS idx_mensalidades_ciclo ON public.financial_mensalidades(ciclo DESC);
CREATE INDEX IF NOT EXISTS idx_mensalidades_status ON public.financial_mensalidades(status);
CREATE INDEX IF NOT EXISTS idx_mensalidades_tipo ON public.financial_mensalidades(tipo);

COMMENT ON TABLE public.financial_mensalidades IS 'Mensalidades de sellers e fornecedores. Receita DropCore.';
COMMENT ON TABLE public.financial_planos IS 'Valor da mensalidade por plano (plano do seller/fornecedor).';
