-- Centro de Distribuição (CD) DropCore: fn_fornecedor_sku_estoque_mercadolivre_set não pode
-- mais sobrescrever skus.estoque_atual quando o fornecedor opera no CD — o número que vale
-- pra vender é o conferido fisicamente (fn_cd_conferencia_confirmar/_baixa_manual), nunca o
-- saldo que o Mercado Livre devolve pro próprio anúncio do fornecedor. Mantém o carimbo de
-- ml_sync_status/ml_sync_at (hover "última confirmação" continua funcionando), só não toca
-- no número. Execute no SQL Editor do Supabase (ou via MCP).

CREATE OR REPLACE FUNCTION public.fn_fornecedor_sku_estoque_mercadolivre_set(
  p_sku_id uuid,
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_novo_estoque integer,
  p_estoque_anterior integer DEFAULT NULL
)
RETURNS public.skus
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.skus;
  v_opera_no_cd boolean;
BEGIN
  SELECT opera_no_cd INTO v_opera_no_cd FROM public.fornecedores WHERE id = p_fornecedor_id;

  IF v_opera_no_cd IS TRUE THEN
    UPDATE public.skus
    SET ml_sync_status = 'ok',
        ml_sync_at = now(),
        ml_estoque_anterior = p_estoque_anterior
    WHERE id = p_sku_id AND org_id = p_org_id AND fornecedor_id = p_fornecedor_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.skus
    SET estoque_atual = p_novo_estoque,
        ml_sync_status = 'ok',
        ml_sync_at = now(),
        ml_estoque_anterior = p_estoque_anterior
    WHERE id = p_sku_id AND org_id = p_org_id AND fornecedor_id = p_fornecedor_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_fornecedor_sku_estoque_mercadolivre_set(uuid, uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_sku_estoque_mercadolivre_set(uuid, uuid, uuid, integer, integer) TO service_role;
