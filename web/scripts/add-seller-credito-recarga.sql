-- Recarga de créditos: aceite, validade e lotes (12 meses, FIFO, expiração).

ALTER TABLE public.seller_depositos_pix
  ADD COLUMN IF NOT EXISTS credito_termos_versao text,
  ADD COLUMN IF NOT EXISTS credito_aceite_em timestamptz,
  ADD COLUMN IF NOT EXISTS credito_expira_em timestamptz;

COMMENT ON COLUMN public.seller_depositos_pix.credito_termos_versao IS 'Versão dos termos aceitos na solicitação da recarga (ex. credit_terms_v1)';
COMMENT ON COLUMN public.seller_depositos_pix.credito_aceite_em IS 'Momento do aceite dos termos de crédito pré-pago';
COMMENT ON COLUMN public.seller_depositos_pix.credito_expira_em IS 'Validade dos créditos desta recarga (12 meses após aprovação)';

CREATE TABLE IF NOT EXISTS public.seller_credit_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  deposito_id uuid REFERENCES public.seller_depositos_pix(id) ON DELETE SET NULL,
  ledger_id uuid REFERENCES public.financial_ledger(id) ON DELETE SET NULL,
  valor_inicial numeric NOT NULL CHECK (valor_inicial > 0),
  valor_restante numeric NOT NULL CHECK (valor_restante >= 0),
  creditado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'esgotado', 'expirado')),
  aviso_30_enviado_em timestamptz,
  aviso_7_enviado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_credit_lots_seller ON public.seller_credit_lots(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_credit_lots_expira ON public.seller_credit_lots(seller_id, expira_em)
  WHERE status = 'ativo' AND valor_restante > 0;

COMMENT ON TABLE public.seller_credit_lots IS 'Lotes de crédito pré-pago do seller (validade 12 meses; consumo FIFO)';

-- Saldo: CREDITO negativo = expiração / débito de crédito não utilizado
CREATE OR REPLACE FUNCTION public.fn_seller_saldo_from_ledger(p_seller_id uuid)
RETURNS TABLE(saldo_disponivel numeric, saldo_bloqueado numeric, saldo_total numeric)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_credito numeric;
  v_bloqueado numeric;
  v_pago numeric;
  v_devolucao numeric;
BEGIN
  SELECT COALESCE(SUM(valor_total), 0) INTO v_credito
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id AND tipo = 'CREDITO';

  SELECT COALESCE(SUM(valor_total), 0) INTO v_bloqueado
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id
    AND tipo IN ('BLOQUEIO', 'VENDA')
    AND status IN ('BLOQUEADO', 'ENTREGUE', 'AGUARDANDO_REPASSE', 'EM_DEVOLUCAO');

  SELECT COALESCE(SUM(valor_total), 0) INTO v_pago
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id
    AND tipo IN ('BLOQUEIO', 'VENDA')
    AND status = 'PAGO';

  SELECT COALESCE(SUM(valor_total), 0) INTO v_devolucao
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id AND tipo = 'DEVOLUCAO' AND valor_total > 0;

  saldo_bloqueado := v_bloqueado;
  saldo_disponivel := GREATEST(0, v_credito - v_bloqueado - v_pago + v_devolucao);
  saldo_total := saldo_disponivel + saldo_bloqueado;
  RETURN NEXT;
END;
$$;
