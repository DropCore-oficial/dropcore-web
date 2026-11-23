-- Complementa unificar-vinculo-seller-fornecedor.sql (já aplicado): re-tranca o compromisso
-- de 3 meses na própria linha de vínculo (reinicia vinculado_em, limpa liberação) — usada
-- pelo cron fornecedor-troca-janela-expira (lib/sellerFornecedorTrocaJanelaExpira.ts) ao
-- fechar sozinho a janela de escolha que o seller não usou. Sem isso o cron escrevia só no
-- cache (sellers.*) e um fn_seller_fornecedor_sync_cache seguinte revertia o re-trancamento
-- lendo os valores antigos ainda salvos na linha de vínculo.
-- Execute no SQL Editor do Supabase (ou via MCP).

CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_renovar_compromisso(
  p_vinculo_id uuid,
  p_org_id uuid
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
  SET vinculado_em = now(),
      desvinculo_liberado = false,
      desvinculo_liberado_em = NULL,
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

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_renovar_compromisso(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_renovar_compromisso(uuid, uuid) TO service_role;
