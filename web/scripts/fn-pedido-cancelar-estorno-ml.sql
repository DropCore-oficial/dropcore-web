-- =============================================================================
-- RPC: fn_pedido_cancelar_estorno_ml
-- Reconciliação de cancelamento no Mercado Livre sem sync (achado 2026-10-09, caso real:
-- seller Vinz Collection, pedido 91b6f93b-3992-4e51-a666-16dd16c17ac2). Hoje o ML pode
-- cancelar uma venda (ex.: nota fiscal nunca emitida, etiqueta nunca liberada) e o
-- DropCore nunca fica sabendo: o pedido trava em status "enviado" pra sempre e o
-- financial_ledger continua BLOQUEADO, sem estornar o saldo do seller.
--
-- Regra 9 do CLAUDE.md: tabela/rota nova (mesmo em tabela já existente) vai por RPC
-- SECURITY DEFINER, grant só pra service_role — chamada por web/lib/cancelamentoMlReconciliacao.ts
-- via supabaseAdmin.rpc(...), depois de confirmar o cancelamento de verdade na API do ML
-- (nunca confia no payload de webhook).
--
-- Não insere uma linha nova tipo DEVOLUCAO: o status CANCELADO já existe no enum
-- financial_ledger_status desde financial-module-v2.sql e fn_seller_saldo_from_ledger já
-- EXCLUI esse status tanto do saldo bloqueado quanto do pago — só mudar BLOQUEADO -> CANCELADO
-- já libera o saldo. O trigger tr_financial_ledger_sync_seller (mesmo arquivo) já resincroniza
-- sellers.saldo_atual/saldo_bloqueado sozinho em qualquer UPDATE no ledger.
--
-- Escopo deliberadamente restrito: só agora quando o pedido ainda está intacto do lado
-- DropCore (status='enviado', ledger ainda BLOQUEADO — nunca chegou a ENTREGUE/
-- AGUARDANDO_REPASSE). Cancelamento do ML depois de já ENTREGUE é mais raro e mais delicado
-- (fornecedor pode já ter trabalhado) — fica de fora do automático, cai pro fluxo manual de
-- devolução que já existe (PATCH /api/org/financial/ledger/[id]).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_pedido_cancelar_estorno_ml(
  p_pedido_id uuid,
  p_org_id uuid
)
RETURNS TABLE(
  ok boolean,
  already_cancelled boolean,
  seller_id uuid,
  valor_estornado numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_valor numeric;
BEGIN
  SELECT p.id, p.seller_id, p.status, p.canal_venda
  INTO v_pedido
  FROM public.pedidos p
  WHERE p.id = p_pedido_id AND p.org_id = p_org_id
  FOR UPDATE;

  IF v_pedido.id IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::uuid, 0::numeric;
    RETURN;
  END IF;

  -- Idempotente: se não bater mais (já cancelado antes, ou mudou de canal/status entre a
  -- checagem no ML e a chamada aqui), não faz nada — webhook + cron podem concorrer.
  IF v_pedido.status <> 'enviado' OR v_pedido.canal_venda <> 'mercado_livre' THEN
    RETURN QUERY SELECT true, true, v_pedido.seller_id, 0::numeric;
    RETURN;
  END IF;

  UPDATE public.pedidos
  SET status = 'cancelado', atualizado_em = now()
  WHERE id = p_pedido_id;

  WITH atualizados AS (
    UPDATE public.financial_ledger
    SET status = 'CANCELADO'
    WHERE pedido_id = p_pedido_id
      AND org_id = p_org_id
      AND tipo IN ('BLOQUEIO', 'VENDA')
      AND status = 'BLOQUEADO'
    RETURNING valor_total
  )
  SELECT COALESCE(SUM(valor_total), 0) INTO v_valor FROM atualizados;

  RETURN QUERY SELECT true, false, v_pedido.seller_id, v_valor;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_pedido_cancelar_estorno_ml(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pedido_cancelar_estorno_ml(uuid, uuid) TO service_role;
