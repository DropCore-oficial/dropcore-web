-- Complementa unificar-vinculo-seller-fornecedor.sql (já aplicado): admin marca/desmarca
-- "liberação antecipada" numa linha de vínculo específica (avulso ou CD) — equivalente
-- unificado do que a rota admin geral (app/api/org/sellers/[id]/route.ts) fazia direto em
-- sellers.fornecedor_desvinculo_liberado. Não desvincula sozinho: só libera o seller pra
-- agir (desvincular/trocar) antes do prazo de 3 meses, igual o fluxo avulso de sempre.
-- Execute no SQL Editor do Supabase (ou via MCP).

CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_liberar_desvinculo(
  p_vinculo_id uuid,
  p_org_id uuid,
  p_liberado boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.seller_fornecedor_vinculos;
BEGIN
  UPDATE public.seller_fornecedor_vinculos
  SET desvinculo_liberado = p_liberado,
      desvinculo_liberado_em = CASE WHEN p_liberado THEN now() ELSE NULL END,
      atualizado_em = now()
  WHERE id = p_vinculo_id AND org_id = p_org_id AND desvinculado_em IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND');
  END IF;

  PERFORM public.fn_seller_fornecedor_sync_cache(v_row.seller_id);

  RETURN jsonb_build_object('ok', true, 'vinculo', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_liberar_desvinculo(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_liberar_desvinculo(uuid, uuid, boolean) TO service_role;
