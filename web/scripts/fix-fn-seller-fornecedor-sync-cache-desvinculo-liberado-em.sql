-- Corrige fn_seller_fornecedor_sync_cache (unificar-vinculo-seller-fornecedor.sql, já
-- aplicado): faltava sincronizar sellers.fornecedor_desvinculo_liberado_em a partir do
-- vínculo — sem isso o cron fornecedor-troca-janela-expira
-- (lib/sellerFornecedorTrocaJanelaExpira.ts) para de enxergar quando a liberação antecipada
-- venceu pra quem passar a usar o fluxo novo (fn_seller_fornecedor_liberar_desvinculo).
-- Execute no SQL Editor do Supabase (ou via MCP).

CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_sync_cache(p_seller_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_unico public.seller_fornecedor_vinculos;
  v_unico_opera_no_cd boolean;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.seller_fornecedor_vinculos
  WHERE seller_id = p_seller_id AND desvinculado_em IS NULL;

  IF v_count = 1 THEN
    SELECT v.* INTO v_unico
    FROM public.seller_fornecedor_vinculos v
    WHERE v.seller_id = p_seller_id AND v.desvinculado_em IS NULL;

    SELECT opera_no_cd INTO v_unico_opera_no_cd
    FROM public.fornecedores WHERE id = v_unico.fornecedor_id;

    IF v_unico_opera_no_cd = false THEN
      UPDATE public.sellers
      SET fornecedor_id = v_unico.fornecedor_id,
          fornecedor_vinculado_em = v_unico.vinculado_em,
          fornecedor_desvinculo_liberado = v_unico.desvinculo_liberado,
          fornecedor_desvinculo_liberado_em = v_unico.desvinculo_liberado_em,
          atualizado_em = now()
      WHERE id = p_seller_id;
      RETURN;
    END IF;
  END IF;

  UPDATE public.sellers
  SET fornecedor_id = NULL,
      fornecedor_vinculado_em = NULL,
      fornecedor_desvinculo_liberado = false,
      fornecedor_desvinculo_liberado_em = NULL,
      atualizado_em = now()
  WHERE id = p_seller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_sync_cache(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_sync_cache(uuid) TO service_role;
