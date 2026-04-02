-- Tabela de pedidos (integração com bloqueio pré-pago)
-- Execute no Supabase SQL Editor.
-- Pedido criado ao "enviar" → block-sale bloqueia saldo e grava ledger_id aqui.

-- Se pedidos já existia com schema antigo (sem status), adiciona colunas faltantes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pedidos') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'status') THEN
      ALTER TABLE public.pedidos ADD COLUMN status text NOT NULL DEFAULT 'enviado';
      ALTER TABLE public.pedidos ADD CONSTRAINT chk_pedidos_status CHECK (status IN ('enviado','entregue','devolvido','cancelado','erro_saldo'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'ledger_id') THEN
      ALTER TABLE public.pedidos ADD COLUMN ledger_id uuid REFERENCES public.financial_ledger(id) ON DELETE SET NULL;
    END IF;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  fornecedor_id uuid NOT NULL,
  valor_fornecedor numeric NOT NULL DEFAULT 0 CHECK (valor_fornecedor >= 0),
  valor_dropcore numeric NOT NULL DEFAULT 0 CHECK (valor_dropcore >= 0),
  valor_total numeric NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  status text NOT NULL DEFAULT 'enviado' CHECK (status IN (
    'enviado',            -- bloqueio feito, aguardando o fornecedor postar
    'aguardando_repasse', -- fornecedor postou, entra no ciclo de repasse
    'entregue',           -- cliente confirmou recebimento
    'devolvido',          -- devolvido (antes ou após repasse)
    'cancelado',          -- cancelado antes do bloqueio ou estornado
    'erro_saldo'          -- falhou por saldo insuficiente
  )),
  ledger_id uuid REFERENCES public.financial_ledger(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pedido_valor_total CHECK (valor_total = valor_fornecedor + valor_dropcore)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_org ON public.pedidos(org_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_seller ON public.pedidos(seller_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fornecedor ON public.pedidos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado ON public.pedidos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_ledger ON public.pedidos(ledger_id);

COMMENT ON TABLE public.pedidos IS 'Pedidos enviados ao fornecedor. Criado ao bloquear saldo (block-sale). ledger_id vincula ao financial_ledger.';

-- pedido_itens (opcional, para futuro: pedido com itens do catálogo)
CREATE TABLE IF NOT EXISTS public.pedido_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  sku_id uuid REFERENCES public.skus(id) ON DELETE SET NULL,
  quantidade int NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON public.pedido_itens(pedido_id);

COMMENT ON TABLE public.pedido_itens IS 'Itens do pedido (futuro: calcular valor a partir do catálogo).';
