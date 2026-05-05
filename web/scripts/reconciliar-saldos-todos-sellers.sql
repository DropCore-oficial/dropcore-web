-- =============================================================================
-- Reconciliar saldos de TODOS os sellers com o financial_ledger
-- Execute no SQL Editor do Supabase.
--
-- O que faz:
--   Recalcula saldo_atual e saldo_bloqueado em public.sellers usando
--   public.fn_seller_saldo_from_ledger (mesma regra do trigger do ledger).
--   Sellers sem nenhuma linha no ledger ficam com saldo 0 / bloqueado 0.
--
-- Use quando: saldos na tabela sellers ficaram “inventados” (ex.: PIX duplicado
-- na coluna antes do trigger, ou drift manual) mas o ledger ainda reflete o
-- que queres manter como verdade.
--
-- NÃO apaga financial_ledger, depósitos PIX nem movimentações.
--
-- Se quiseres APAGAR histórico financeiro de uma org e começar do zero, usa
-- web/scripts/zerar-saldos-teste.sql (ajusta o v_org_id).
-- =============================================================================

DO $$
DECLARE
  sid uuid;
  v_disp numeric;
  v_bloq numeric;
BEGIN
  FOR sid IN SELECT id FROM public.sellers
  LOOP
    SELECT f.saldo_disponivel, f.saldo_bloqueado
    INTO v_disp, v_bloq
    FROM public.fn_seller_saldo_from_ledger(sid) AS f
    LIMIT 1;

    IF v_disp IS NULL THEN
      v_disp := 0;
      v_bloq := 0;
    END IF;

    UPDATE public.sellers
    SET
      saldo_atual = v_disp,
      saldo_bloqueado = COALESCE(v_bloq, 0),
      atualizado_em = now()
    WHERE id = sid;
  END LOOP;

  RAISE NOTICE 'Reconciliação concluída: todos os sellers atualizados a partir do ledger.';
END $$;
