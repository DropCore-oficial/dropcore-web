-- =============================================================================
-- Correção de fn_pedido_cancelar_estorno_ml (não reescreve fn-pedido-cancelar-estorno-ml.sql,
-- já aplicado em produção — ver regra de migrations do CLAUDE.md).
--
-- 1) Bug real encontrado na 1ª aplicação: `SELECT id, seller_id, status, canal_venda ...`
--    sem alias dava "column reference seller_id is ambiguous" (colide com a coluna de saída
--    `seller_id` do RETURNS TABLE) — corrigido qualificando com alias `p.`.
-- 2) Nova coluna `pedidos.cancelado_motivo` (achado 2026-10-09: tela de Pedidos mostrava
--    "Cancelado" genérico, sem destacar que foi o ML cancelando sozinho e que o saldo já
--    foi estornado — Sr Stark pediu mais ênfase + admin/fornecedor também verem). A função
--    agora grava `cancelado_motivo = 'ml_sem_sync'` junto com `status = 'cancelado'`.
-- =============================================================================

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS cancelado_motivo text
  CHECK (cancelado_motivo IS NULL OR cancelado_motivo IN ('ml_sem_sync'));

COMMENT ON COLUMN public.pedidos.cancelado_motivo IS
  'Causa do cancelamento quando status=cancelado e é relevante mostrar/distinguir na UI. Hoje só ml_sem_sync (ver fn_pedido_cancelar_estorno_ml) — null nos outros cancelamentos (admin manual, erro de saldo, etc.).';

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

  IF v_pedido.status <> 'enviado' OR v_pedido.canal_venda <> 'mercado_livre' THEN
    RETURN QUERY SELECT true, true, v_pedido.seller_id, 0::numeric;
    RETURN;
  END IF;

  UPDATE public.pedidos
  SET status = 'cancelado', cancelado_motivo = 'ml_sem_sync', atualizado_em = now()
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

-- Backfill: pedido da Vinz Collection (91b6f93b-3992-4e51-a666-16dd16c17ac2) já tinha sido
-- corrigido manualmente antes dessa coluna existir.
UPDATE public.pedidos
SET cancelado_motivo = 'ml_sem_sync'
WHERE id = '91b6f93b-3992-4e51-a666-16dd16c17ac2'
  AND status = 'cancelado';
