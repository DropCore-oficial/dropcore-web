-- Centro de Distribuição (CD) DropCore: RPCs de vínculo seller<->fornecedor múltiplo.
-- SECURITY DEFINER, chamadas só via supabaseAdmin.rpc(...) a partir de rota que já validou
-- quem é o dono (seller autenticado ou admin). Nunca GRANT para authenticated/anon.
-- Execute no SQL Editor do Supabase (ou via MCP).

-- ===========================================================================================
-- fn_seller_fornecedor_cd_vincular: adiciona 1 vínculo CD. Sem trava de 3 meses (a trava só
-- vale pra REMOVER, não pra adicionar). Nunca mistura avulso com CD no mesmo seller.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_cd_vincular(
  p_seller_id uuid,
  p_fornecedor_id uuid,
  p_org_id uuid,
  p_criado_por_tipo text,
  p_criado_por_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fornecedor_opera_no_cd boolean;
  v_seller_fornecedor_avulso uuid;
  v_ja_vinculado boolean;
  v_row public.seller_fornecedor_vinculos;
BEGIN
  IF p_criado_por_tipo NOT IN ('seller', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'CRIADO_POR_TIPO_INVALIDO');
  END IF;

  SELECT opera_no_cd INTO v_fornecedor_opera_no_cd
  FROM public.fornecedores
  WHERE id = p_fornecedor_id AND org_id = p_org_id;

  IF v_fornecedor_opera_no_cd IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'FORNECEDOR_NAO_ENCONTRADO');
  END IF;
  IF NOT v_fornecedor_opera_no_cd THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'FORNECEDOR_NAO_OPERA_NO_CD');
  END IF;

  SELECT fornecedor_id INTO v_seller_fornecedor_avulso
  FROM public.sellers
  WHERE id = p_seller_id AND org_id = p_org_id;

  IF v_seller_fornecedor_avulso IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'AVULSO_ATIVO_IMPEDE_CD');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.seller_fornecedor_vinculos
    WHERE seller_id = p_seller_id AND fornecedor_id = p_fornecedor_id AND desvinculado_em IS NULL
  ) INTO v_ja_vinculado;

  IF v_ja_vinculado THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'JA_VINCULADO');
  END IF;

  INSERT INTO public.seller_fornecedor_vinculos (
    org_id, seller_id, fornecedor_id, criado_por_tipo, criado_por_user_id
  ) VALUES (
    p_org_id, p_seller_id, p_fornecedor_id, p_criado_por_tipo, p_criado_por_user_id
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'vinculo', to_jsonb(v_row));
END;
$$;

COMMENT ON FUNCTION public.fn_seller_fornecedor_cd_vincular IS
  'Vincula seller a fornecedor do CD (multi-fornecedor). Sem trava de 3 meses pra adicionar.';

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_cd_vincular(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_cd_vincular(uuid, uuid, uuid, text, uuid) TO service_role;

-- ===========================================================================================
-- fn_seller_fornecedor_cd_desvincular: trava de 3 meses igual à do avulso
-- (web/lib/sellerFornecedorVinculo.ts), por linha.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_cd_desvincular(
  p_vinculo_id uuid,
  p_org_id uuid,
  p_confirmar_antes_prazo_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.seller_fornecedor_vinculos;
  v_data_minima timestamptz;
  v_pode boolean;
BEGIN
  SELECT * INTO v_row
  FROM public.seller_fornecedor_vinculos
  WHERE id = p_vinculo_id AND org_id = p_org_id AND desvinculado_em IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND');
  END IF;

  v_data_minima := v_row.vinculado_em + interval '3 months';
  v_pode := v_row.desvinculo_liberado OR p_confirmar_antes_prazo_admin OR now() >= v_data_minima;

  IF NOT v_pode THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'COMPROMISSO_FORNECEDOR_ATIVO',
      'pode_trocar_fornecedor_a_partir_de', v_data_minima
    );
  END IF;

  UPDATE public.seller_fornecedor_vinculos
  SET desvinculado_em = now(), atualizado_em = now()
  WHERE id = p_vinculo_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'vinculo', to_jsonb(v_row));
END;
$$;

COMMENT ON FUNCTION public.fn_seller_fornecedor_cd_desvincular IS
  'Desvincula seller de fornecedor do CD, respeitando a trava de 3 meses por linha '
  '(ou liberação antecipada / confirmação admin).';

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_cd_desvincular(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_cd_desvincular(uuid, uuid, boolean) TO service_role;

-- ===========================================================================================
-- fn_seller_fornecedor_cd_vinculos_lista: leitura — alimenta tela do seller e do admin.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_cd_vinculos_lista(
  p_seller_id uuid,
  p_org_id uuid
)
RETURNS TABLE (
  vinculo_id uuid,
  fornecedor_id uuid,
  fornecedor_nome text,
  vinculado_em timestamptz,
  cortesia boolean,
  cortesia_ate date,
  cortesia_vigente boolean,
  pode_desvincular_agora boolean,
  pode_desvincular_a_partir_de timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id AS vinculo_id,
    v.fornecedor_id,
    f.nome AS fornecedor_nome,
    v.vinculado_em,
    v.cortesia,
    v.cortesia_ate,
    (v.cortesia AND (v.cortesia_ate IS NULL OR v.cortesia_ate >= current_date)) AS cortesia_vigente,
    (v.desvinculo_liberado OR now() >= v.vinculado_em + interval '3 months') AS pode_desvincular_agora,
    (v.vinculado_em + interval '3 months') AS pode_desvincular_a_partir_de
  FROM public.seller_fornecedor_vinculos v
  JOIN public.fornecedores f ON f.id = v.fornecedor_id
  WHERE v.seller_id = p_seller_id
    AND v.org_id = p_org_id
    AND v.desvinculado_em IS NULL
  ORDER BY v.vinculado_em ASC;
$$;

COMMENT ON FUNCTION public.fn_seller_fornecedor_cd_vinculos_lista IS
  'Lista vínculos ativos do seller no CD com cortesia vigente e data mínima pra desvincular.';

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_cd_vinculos_lista(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_cd_vinculos_lista(uuid, uuid) TO service_role;
