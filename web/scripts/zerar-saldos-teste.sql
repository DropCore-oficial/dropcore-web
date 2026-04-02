-- =============================================================================
-- ZERAR SALDOS E ENTRADA NO MÊS (para testar do zero)
-- Execute no SQL Editor do Supabase.
-- Substitua o UUID abaixo pela sua org (ou use este se for a sua: 68a53d8e-8542-480d-b07f-4be371367362).
-- =============================================================================

DO $$
DECLARE
  v_org_id uuid := '68a53d8e-8542-480d-b07f-4be371367362'::uuid;
BEGIN
  -- 1) Remove ledger (fonte da verdade do saldo); o trigger vai recalcular sellers
  DELETE FROM public.financial_ledger
  WHERE org_id = v_org_id;

  -- 2) Remove depósitos PIX (pendentes e aprovados) → Entrada no mês volta a 0
  DELETE FROM public.seller_depositos_pix
  WHERE org_id = v_org_id;

  -- 3) Remove movimentações (extrato do seller)
  DELETE FROM public.seller_movimentacoes
  WHERE seller_id IN (SELECT id FROM public.sellers WHERE org_id = v_org_id);

  -- 4) Zera saldo em conta de todos os sellers da org
  UPDATE public.sellers
  SET saldo_atual = 0, saldo_bloqueado = 0, atualizado_em = now()
  WHERE org_id = v_org_id;

  RAISE NOTICE 'Saldos e entradas zerados para a org %', v_org_id;
END $$;

-- Para zerar TODAS as orgs (cuidado), use os comandos abaixo em vez do bloco acima:
/*
DELETE FROM public.financial_ledger;
DELETE FROM public.seller_depositos_pix;
DELETE FROM public.seller_movimentacoes;
UPDATE public.sellers SET saldo_atual = 0, saldo_bloqueado = 0, atualizado_em = now();
*/
