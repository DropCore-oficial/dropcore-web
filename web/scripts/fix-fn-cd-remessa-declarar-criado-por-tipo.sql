-- Corretivo: fn_cd_remessa_declarar gravava sempre criado_por_tipo = 'fornecedor', mesmo
-- quando quem declarou foi o admin (em nome do fornecedor). Agora aceita um parâmetro
-- p_criado_por_tipo com default 'fornecedor' (preserva 100% o comportamento da rota
-- /api/fornecedor/cd/remessa, que não passa o parâmetro) — só a rota admin nova passa 'admin'.
-- Precisa de DROP antes: acrescentar parâmetro muda a assinatura (6 → 7 args), então
-- CREATE OR REPLACE sozinho criaria uma função sobrecarregada ambígua em vez de substituir.

DROP FUNCTION IF EXISTS public.fn_cd_remessa_declarar(uuid, uuid, numeric, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_cd_remessa_declarar(
  p_fornecedor_id uuid,
  p_sku_id uuid,
  p_quantidade numeric,
  p_org_id uuid,
  p_criado_por_user_id uuid,
  p_observacao text DEFAULT NULL::text,
  p_criado_por_tipo text DEFAULT 'fornecedor'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sku_fornecedor_id uuid;
  v_opera_no_cd boolean;
  v_row public.cd_movimentos_estoque;
BEGIN
  IF p_quantidade <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'QUANTIDADE_INVALIDA');
  END IF;

  SELECT fornecedor_id INTO v_sku_fornecedor_id FROM public.skus WHERE id = p_sku_id AND org_id = p_org_id;
  IF v_sku_fornecedor_id IS NULL OR v_sku_fornecedor_id <> p_fornecedor_id THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'SKU_NAO_PERTENCE_AO_FORNECEDOR');
  END IF;

  SELECT opera_no_cd INTO v_opera_no_cd FROM public.fornecedores WHERE id = p_fornecedor_id AND org_id = p_org_id;
  IF v_opera_no_cd IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'FORNECEDOR_NAO_OPERA_NO_CD');
  END IF;

  INSERT INTO public.cd_movimentos_estoque (
    org_id, fornecedor_id, sku_id, tipo, quantidade, observacao, criado_por_user_id, criado_por_tipo
  ) VALUES (
    p_org_id, p_fornecedor_id, p_sku_id, 'remessa_declarada', p_quantidade, p_observacao, p_criado_por_user_id, p_criado_por_tipo
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'movimento', to_jsonb(v_row));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cd_remessa_declarar(uuid, uuid, numeric, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cd_remessa_declarar(uuid, uuid, numeric, uuid, uuid, text, text) TO service_role;
