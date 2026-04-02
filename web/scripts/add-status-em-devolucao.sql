-- =============================================================================
-- Devolução em duas etapas: EM_DEVOLUCAO (valor fica bloqueado) → DEVOLVIDO (valor volta ao seller após fornecedor conferir).
-- Execute no SQL Editor do Supabase após o financial-module-v2.sql.
-- =============================================================================

-- Novo status: devolução registrada, aguardando conferência do fornecedor (valor continua bloqueado)
DO $$ BEGIN
  ALTER TYPE financial_ledger_status ADD VALUE 'EM_DEVOLUCAO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Atualizar função de saldo: EM_DEVOLUCAO conta como bloqueado; PAGO conta como saída (não volta ao seller)
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
  WHERE seller_id = p_seller_id AND tipo = 'CREDITO' AND valor_total > 0;

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
