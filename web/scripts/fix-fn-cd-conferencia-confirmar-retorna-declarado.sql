-- Corretivo: fn_cd_conferencia_confirmar passa a devolver a quantidade DECLARADA junto do
-- movimento de conferência — necessário pra notificar o fornecedor com "declarado X,
-- conferido Y" sem a rota precisar de uma query extra. Não muda nenhum comportamento
-- existente, só adiciona o campo "declarado" no retorno de sucesso.

CREATE OR REPLACE FUNCTION public.fn_cd_conferencia_confirmar(
  p_remessa_ref_id uuid,
  p_quantidade_conferida numeric,
  p_org_id uuid,
  p_criado_por_user_id uuid,
  p_observacao text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remessa public.cd_movimentos_estoque;
  v_ja_conferida boolean;
  v_row public.cd_movimentos_estoque;
BEGIN
  IF p_quantidade_conferida <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'QUANTIDADE_INVALIDA');
  END IF;

  SELECT * INTO v_remessa
  FROM public.cd_movimentos_estoque
  WHERE id = p_remessa_ref_id AND org_id = p_org_id AND tipo = 'remessa_declarada';

  IF v_remessa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'REMESSA_NAO_ENCONTRADA');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.cd_movimentos_estoque WHERE remessa_ref_id = p_remessa_ref_id AND tipo = 'conferencia_entrada'
  ) INTO v_ja_conferida;
  IF v_ja_conferida THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'REMESSA_JA_CONFERIDA');
  END IF;

  INSERT INTO public.cd_movimentos_estoque (
    org_id, fornecedor_id, sku_id, tipo, quantidade, remessa_ref_id, observacao, criado_por_user_id, criado_por_tipo
  ) VALUES (
    p_org_id, v_remessa.fornecedor_id, v_remessa.sku_id, 'conferencia_entrada', p_quantidade_conferida, p_remessa_ref_id, p_observacao, p_criado_por_user_id, 'admin'
  )
  RETURNING * INTO v_row;

  UPDATE public.skus SET estoque_atual = estoque_atual + p_quantidade_conferida WHERE id = v_remessa.sku_id;

  RETURN jsonb_build_object('ok', true, 'movimento', to_jsonb(v_row), 'declarado', v_remessa.quantidade);
END;
$function$;
