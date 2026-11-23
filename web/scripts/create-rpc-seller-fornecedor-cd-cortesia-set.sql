-- Centro de Distribuição (CD) DropCore: admin liga/desliga cortesia por vínculo individual
-- (não por seller inteiro). Execute no SQL Editor do Supabase (ou via MCP).

CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_cd_cortesia_set(
  p_vinculo_id uuid,
  p_org_id uuid,
  p_cortesia boolean,
  p_cortesia_ate date DEFAULT NULL
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
  SET cortesia = p_cortesia,
      cortesia_ate = p_cortesia_ate,
      atualizado_em = now()
  WHERE id = p_vinculo_id AND org_id = p_org_id AND desvinculado_em IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('ok', true, 'vinculo', to_jsonb(v_row));
END;
$$;

COMMENT ON FUNCTION public.fn_seller_fornecedor_cd_cortesia_set IS
  'Admin liga/desliga cortesia (e data de expiração opcional) de 1 vínculo CD específico.';

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_cd_cortesia_set(uuid, uuid, boolean, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_cd_cortesia_set(uuid, uuid, boolean, date) TO service_role;
