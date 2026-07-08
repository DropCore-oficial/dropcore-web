-- Reserva de estoque para pedidos Olist "em aberto" (aguardando pagamento boleto/PIX).
-- Execute no Supabase SQL Editor.
--
-- Contexto: o mesmo SKU do fornecedor pode estar habilitado para vários sellers ao
-- mesmo tempo. Sem reserva, dois sellers podem vender a última unidade antes de
-- qualquer pagamento confirmar. Este script separa estoque_atual (físico) de
-- estoque_reservado (soma de pedidos em_aberto ainda não pagos/cancelados), para
-- que o sync de saída (DropCore -> Olist de cada seller) ofereça só o disponível.

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS estoque_reservado integer NOT NULL DEFAULT 0 CHECK (estoque_reservado >= 0);

COMMENT ON COLUMN public.skus.estoque_reservado IS
  'Soma das reservas ativas (pedidos Olist em_aberto) para este SKU. Disponível para venda = estoque_atual - estoque_reservado.';

CREATE TABLE IF NOT EXISTS public.estoque_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  fornecedor_id uuid NOT NULL,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE RESTRICT,
  quantidade int NOT NULL CHECK (quantidade > 0),
  referencia_externa text NOT NULL,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'liberada', 'cancelada', 'expirada')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Idempotência: cron (a cada 1 min) e webhook podem repetir o mesmo pedido "em aberto"
-- várias vezes enquanto ele não muda de situação. Índice parcial (só sobre 'ativa')
-- para permitir uma nova reserva depois que uma antiga já foi liberada/cancelada/expirada.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_estoque_reservas_ativa
  ON public.estoque_reservas (org_id, seller_id, referencia_externa, sku_id)
  WHERE status = 'ativa';

CREATE INDEX IF NOT EXISTS idx_estoque_reservas_org ON public.estoque_reservas(org_id);
CREATE INDEX IF NOT EXISTS idx_estoque_reservas_sku ON public.estoque_reservas(sku_id);
CREATE INDEX IF NOT EXISTS idx_estoque_reservas_status ON public.estoque_reservas(status);
CREATE INDEX IF NOT EXISTS idx_estoque_reservas_referencia ON public.estoque_reservas(referencia_externa);
CREATE INDEX IF NOT EXISTS idx_estoque_reservas_criado ON public.estoque_reservas(criado_em);

COMMENT ON TABLE public.estoque_reservas IS
  'Reservas de estoque por pedido Olist em_aberto (uma linha por item/SKU). status=ativa soma em skus.estoque_reservado.';

-- ---------------------------------------------------------------------------
-- RPCs (mesmo formato de retorno de rpc_debitar_estoque_sku/rpc_reverter_estoque_sku,
-- já usadas por web/lib/order/estoquePedido.ts: ok, error_code, error_message,
-- sku_id, sku, estoque_depois — aqui estoque_depois = novo estoque_reservado).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_reservar_estoque_sku(uuid, int);

CREATE OR REPLACE FUNCTION public.rpc_reservar_estoque_sku(
  p_sku_id uuid,
  p_quantidade int
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text,
  sku_id uuid,
  sku text,
  estoque_depois numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sku_codigo text;
  v_reservado_depois integer;
BEGIN
  IF p_sku_id IS NULL OR p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RETURN QUERY SELECT false, 'INVALID_QUANTITY'::text, 'Quantidade inválida para reserva de estoque.'::text,
      p_sku_id, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  UPDATE public.skus
  SET estoque_reservado = estoque_reservado + p_quantidade
  WHERE id = p_sku_id
  RETURNING skus.sku, skus.estoque_reservado INTO v_sku_codigo, v_reservado_depois;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'SKU_NOT_FOUND'::text, 'SKU não encontrado para reserva de estoque.'::text,
      p_sku_id, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, NULL::text, p_sku_id, v_sku_codigo, v_reservado_depois::numeric;
END;
$$;

COMMENT ON FUNCTION public.rpc_reservar_estoque_sku(uuid, int) IS
  'Incrementa skus.estoque_reservado (sem checar disponibilidade — o objetivo é sinalizar demanda, mesmo acima do físico).';

REVOKE ALL ON FUNCTION public.rpc_reservar_estoque_sku(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_reservar_estoque_sku(uuid, int) TO service_role;

DROP FUNCTION IF EXISTS public.rpc_liberar_reserva_estoque_sku(uuid, int);

CREATE OR REPLACE FUNCTION public.rpc_liberar_reserva_estoque_sku(
  p_sku_id uuid,
  p_quantidade int
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text,
  sku_id uuid,
  sku text,
  estoque_depois numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sku_codigo text;
  v_reservado_depois integer;
BEGIN
  IF p_sku_id IS NULL OR p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RETURN QUERY SELECT false, 'INVALID_QUANTITY'::text, 'Quantidade inválida para liberação de reserva.'::text,
      p_sku_id, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  UPDATE public.skus
  SET estoque_reservado = GREATEST(0, estoque_reservado - p_quantidade)
  WHERE id = p_sku_id
  RETURNING skus.sku, skus.estoque_reservado INTO v_sku_codigo, v_reservado_depois;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'SKU_NOT_FOUND'::text, 'SKU não encontrado para liberação de reserva.'::text,
      p_sku_id, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, NULL::text, p_sku_id, v_sku_codigo, v_reservado_depois::numeric;
END;
$$;

COMMENT ON FUNCTION public.rpc_liberar_reserva_estoque_sku(uuid, int) IS
  'Decrementa skus.estoque_reservado (piso em zero) ao aprovar, cancelar ou expirar uma reserva.';

REVOKE ALL ON FUNCTION public.rpc_liberar_reserva_estoque_sku(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_liberar_reserva_estoque_sku(uuid, int) TO service_role;
