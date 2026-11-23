-- Unifica avulso (sellers.fornecedor_id) e CD (seller_fornecedor_vinculos) num vínculo só.
-- seller_fornecedor_vinculos passa a ser a ÚNICA fonte pra ESCREVER (vincular/desvincular);
-- sellers.fornecedor_id/fornecedor_vinculado_em/fornecedor_desvinculo_liberado continuam
-- existindo como CACHE derivado (só preenchido quando o seller tem exatamente 1 vínculo
-- ativo e esse fornecedor é fora do CD) — os arquivos que só LEEM essas colunas não
-- precisam mudar. Não apaga as RPCs antigas `fn_seller_fornecedor_cd_*`
-- (scripts/create-rpc-seller-fornecedor-cd-vinculo.sql) neste script — isso fica pro script
-- corretivo `remover-rpc-seller-fornecedor-cd-antigas.sql`, rodado só depois que o código
-- (Fase 2) parar de chamá-las de vez (confirmado por grep antes de rodar).
-- Execute no SQL Editor do Supabase (ou via MCP).

-- ===========================================================================================
-- fn_seller_fornecedor_sync_cache: mantém sellers.fornecedor_id/fornecedor_vinculado_em/
-- fornecedor_desvinculo_liberado em sincronia com seller_fornecedor_vinculos — chamada
-- internamente pelas funções de vincular/desvincular abaixo, nunca direto pelo app.
-- ===========================================================================================
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
          atualizado_em = now()
      WHERE id = p_seller_id;
      RETURN;
    END IF;
  END IF;

  -- 0 vínculos, 2+ vínculos, ou o único vínculo é de fornecedor do CD: cache fica vazio.
  UPDATE public.sellers
  SET fornecedor_id = NULL,
      fornecedor_vinculado_em = NULL,
      fornecedor_desvinculo_liberado = false,
      atualizado_em = now()
  WHERE id = p_seller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_sync_cache(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_sync_cache(uuid) TO service_role;

-- ===========================================================================================
-- fn_seller_fornecedor_vincular: substitui fn_seller_fornecedor_cd_vincular + o UPDATE direto
-- do avulso. Regra única: sem vínculo nenhum aceita qualquer fornecedor; com vínculo fora do
-- CD bloqueia qualquer vínculo novo; com vínculo do CD só aceita outro fornecedor do CD.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_vincular(
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
  v_ja_vinculado boolean;
  v_tem_vinculo_fora_cd boolean;
  v_tem_vinculo_algum boolean;
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

  SELECT EXISTS(
    SELECT 1 FROM public.seller_fornecedor_vinculos
    WHERE seller_id = p_seller_id AND fornecedor_id = p_fornecedor_id AND desvinculado_em IS NULL
  ) INTO v_ja_vinculado;
  IF v_ja_vinculado THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'JA_VINCULADO');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.seller_fornecedor_vinculos v
    JOIN public.fornecedores f ON f.id = v.fornecedor_id
    WHERE v.seller_id = p_seller_id AND v.desvinculado_em IS NULL AND f.opera_no_cd = false
  ) INTO v_tem_vinculo_fora_cd;
  IF v_tem_vinculo_fora_cd THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'JA_TEM_FORNECEDOR_VINCULADO');
  END IF;

  IF NOT v_fornecedor_opera_no_cd THEN
    SELECT EXISTS(
      SELECT 1 FROM public.seller_fornecedor_vinculos
      WHERE seller_id = p_seller_id AND desvinculado_em IS NULL
    ) INTO v_tem_vinculo_algum;
    IF v_tem_vinculo_algum THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'FORNECEDOR_NAO_OPERA_NO_CD');
    END IF;
  END IF;

  INSERT INTO public.seller_fornecedor_vinculos (
    org_id, seller_id, fornecedor_id, criado_por_tipo, criado_por_user_id
  ) VALUES (
    p_org_id, p_seller_id, p_fornecedor_id, p_criado_por_tipo, p_criado_por_user_id
  )
  RETURNING * INTO v_row;

  PERFORM public.fn_seller_fornecedor_sync_cache(p_seller_id);

  RETURN jsonb_build_object('ok', true, 'vinculo', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_vincular(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_vincular(uuid, uuid, uuid, text, uuid) TO service_role;

-- ===========================================================================================
-- fn_seller_fornecedor_desvincular: substitui fn_seller_fornecedor_cd_desvincular + o UPDATE
-- direto do avulso. Mesma trava de 3 meses por linha.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_desvincular(
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

  PERFORM public.fn_seller_fornecedor_sync_cache(v_row.seller_id);

  RETURN jsonb_build_object('ok', true, 'vinculo', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_desvincular(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_desvincular(uuid, uuid, boolean) TO service_role;

-- ===========================================================================================
-- fn_seller_fornecedor_vinculos_lista: substitui fn_seller_fornecedor_cd_vinculos_lista —
-- lista QUALQUER vínculo ativo (CD ou fora do CD), não só CD.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_seller_fornecedor_vinculos_lista(
  p_seller_id uuid,
  p_org_id uuid
)
RETURNS TABLE (
  vinculo_id uuid,
  fornecedor_id uuid,
  fornecedor_nome text,
  fornecedor_opera_no_cd boolean,
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
    f.opera_no_cd AS fornecedor_opera_no_cd,
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

REVOKE ALL ON FUNCTION public.fn_seller_fornecedor_vinculos_lista(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seller_fornecedor_vinculos_lista(uuid, uuid) TO service_role;

-- ===========================================================================================
-- Migração de dados: 1 linha em seller_fornecedor_vinculos pra cada seller que já tem
-- fornecedor_id (avulso) preenchido hoje — preserva vinculado_em/desvinculo_liberado
-- (ninguém ganha nem perde prazo de trava por causa da migração). Idempotente (NOT EXISTS).
-- Não altera `sellers` — o cache já está certo porque é exatamente a origem do dado migrado.
-- ===========================================================================================
INSERT INTO public.seller_fornecedor_vinculos (
  org_id, seller_id, fornecedor_id, vinculado_em, desvinculo_liberado, criado_por_tipo
)
SELECT
  s.org_id,
  s.id,
  s.fornecedor_id,
  COALESCE(s.fornecedor_vinculado_em, s.criado_em, now()),
  COALESCE(s.fornecedor_desvinculo_liberado, false),
  'seller'
FROM public.sellers s
WHERE s.fornecedor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.seller_fornecedor_vinculos v
    WHERE v.seller_id = s.id AND v.fornecedor_id = s.fornecedor_id AND v.desvinculado_em IS NULL
  );
