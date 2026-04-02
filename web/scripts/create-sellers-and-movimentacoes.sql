-- Tabela de Sellers e movimentações de saldo (extrato)
-- Execute no SQL Editor do Supabase.

-- Sellers (por organização)
CREATE TABLE IF NOT EXISTS public.sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  nome text NOT NULL,
  documento text,
  plano text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
  saldo_atual numeric NOT NULL DEFAULT 0 CHECK (saldo_atual >= 0),
  saldo_bloqueado numeric NOT NULL DEFAULT 0 CHECK (saldo_bloqueado >= 0),
  data_entrada date,
  termo_aceite_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sellers_org_id ON public.sellers(org_id);
CREATE INDEX IF NOT EXISTS idx_sellers_status ON public.sellers(status);

COMMENT ON TABLE public.sellers IS 'Sellers (vendedores) por organização DropCore';
COMMENT ON COLUMN public.sellers.documento IS 'CNPJ ou CPF';
COMMENT ON COLUMN public.sellers.saldo_atual IS 'Crédito operacional disponível';
COMMENT ON COLUMN public.sellers.saldo_bloqueado IS 'Valor bloqueado (ex.: penalidade)';

-- Movimentações de saldo do seller (extrato)
CREATE TABLE IF NOT EXISTS public.seller_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('credito', 'debito', 'ajuste')),
  valor numeric NOT NULL,
  motivo text,
  referencia text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_movimentacoes_seller_id ON public.seller_movimentacoes(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_movimentacoes_criado_em ON public.seller_movimentacoes(criado_em DESC);

COMMENT ON TABLE public.seller_movimentacoes IS 'Extrato de crédito/débito dos sellers';
COMMENT ON COLUMN public.seller_movimentacoes.referencia IS 'Ex.: pedido_id para débitos';

-- RLS: apenas quem tem acesso à org pode ver/editar (opcional; se usar service role no backend, pode deixar desabilitado)
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_movimentacoes ENABLE ROW LEVEL SECURITY;

-- Com service role o Supabase ignora RLS. Se usar anon key, crie políticas que chequem org_id via org_members.
