-- =============================================================================
-- Correção: quando o repasse é fechado, status vira PAGO. O dinheiro foi para
-- fornecedor + DropCore, então NÃO pode voltar para o seller. A função de saldo
-- não considerava PAGO como "saída" e devolvia o valor ao saldo do seller.
-- Agora: PAGO conta como débito (dinheiro que já saiu). Execute no Supabase.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_seller_saldo_from_ledger(p_seller_id uuid)
RETURNS TABLE(saldo_disponivel numeric, saldo_bloqueado numeric, saldo_total numeric)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_credito numeric;
  v_bloqueado numeric;
  v_pago numeric;   -- BLOQUEIO/VENDA já pagos (fornecedor + DropCore) — não volta ao seller
  v_devolucao numeric;
BEGIN
  SELECT COALESCE(SUM(valor_total), 0) INTO v_credito
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id AND tipo = 'CREDITO' AND valor_total > 0;

  -- Bloqueios ainda ativos (não pagos, não devolvidos)
  SELECT COALESCE(SUM(valor_total), 0) INTO v_bloqueado
  FROM public.financial_ledger
  WHERE seller_id = p_seller_id
    AND tipo IN ('BLOQUEIO', 'VENDA')
    AND status IN ('BLOQUEADO', 'ENTREGUE', 'AGUARDANDO_REPASSE', 'EM_DEVOLUCAO');

  -- Já repassado (fornecedor + DropCore) — continua sendo débito do seller
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

-- Reaplicar saldo em todos os sellers que têm ledger (corrige saldo_atual na tabela sellers)
DO $$
DECLARE
  rec_seller RECORD;
  rec_saldo RECORD;
  sid uuid;
BEGIN
  FOR rec_seller IN SELECT DISTINCT seller_id FROM public.financial_ledger WHERE seller_id IS NOT NULL
  LOOP
    sid := rec_seller.seller_id;
    FOR rec_saldo IN SELECT * FROM public.fn_seller_saldo_from_ledger(sid)
    LOOP
      UPDATE public.sellers
      SET saldo_atual = rec_saldo.saldo_disponivel, saldo_bloqueado = rec_saldo.saldo_bloqueado, atualizado_em = now()
      WHERE id = sid;
      EXIT;
    END LOOP;
  END LOOP;
END $$;
