-- Centro de Distribuição (CD) DropCore: RPCs de estoque (remessa, conferência, baixa
-- manual, leituras). SECURITY DEFINER, chamadas só via supabaseAdmin.rpc(...). Nunca GRANT
-- para authenticated/anon. Execute no SQL Editor do Supabase (ou via MCP).

-- ===========================================================================================
-- fn_cd_remessa_declarar: fornecedor declara que está enviando N unidades de um SKU pro CD.
-- Não altera estoque_atual ainda (só a conferência física confirma).
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_cd_remessa_declarar(
  p_fornecedor_id uuid,
  p_sku_id uuid,
  p_quantidade numeric,
  p_org_id uuid,
  p_criado_por_user_id uuid,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    p_org_id, p_fornecedor_id, p_sku_id, 'remessa_declarada', p_quantidade, p_observacao, p_criado_por_user_id, 'fornecedor'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'movimento', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cd_remessa_declarar(uuid, uuid, numeric, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cd_remessa_declarar(uuid, uuid, numeric, uuid, uuid, text) TO service_role;

-- ===========================================================================================
-- fn_cd_conferencia_confirmar: operador DropCore confere a entrada física. A quantidade
-- conferida (pode diferir da declarada) é a que soma em skus.estoque_atual.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_cd_conferencia_confirmar(
  p_remessa_ref_id uuid,
  p_quantidade_conferida numeric,
  p_org_id uuid,
  p_criado_por_user_id uuid,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN jsonb_build_object('ok', true, 'movimento', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cd_conferencia_confirmar(uuid, numeric, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cd_conferencia_confirmar(uuid, numeric, uuid, uuid, text) TO service_role;

-- ===========================================================================================
-- fn_cd_baixa_manual: único mecanismo pra desligamento do CD e avaria/perda. Motivo escolhe
-- o responsável pelo custo (derivado, não confiar em input solto do cliente).
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_cd_baixa_manual(
  p_fornecedor_id uuid,
  p_sku_id uuid,
  p_quantidade numeric,
  p_motivo text,
  p_org_id uuid,
  p_criado_por_user_id uuid,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sku_fornecedor_id uuid;
  v_responsavel_custo text;
  v_row public.cd_movimentos_estoque;
BEGIN
  IF p_quantidade <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'QUANTIDADE_INVALIDA');
  END IF;

  IF p_motivo NOT IN ('saida_cd_fornecedor_desligado', 'avaria_perda_dropcore', 'defeito_fabrica_fornecedor') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'MOTIVO_INVALIDO');
  END IF;

  SELECT fornecedor_id INTO v_sku_fornecedor_id FROM public.skus WHERE id = p_sku_id AND org_id = p_org_id;
  IF v_sku_fornecedor_id IS NULL OR v_sku_fornecedor_id <> p_fornecedor_id THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'SKU_NAO_PERTENCE_AO_FORNECEDOR');
  END IF;

  v_responsavel_custo := CASE p_motivo
    WHEN 'saida_cd_fornecedor_desligado' THEN 'nenhum'
    WHEN 'avaria_perda_dropcore' THEN 'dropcore'
    WHEN 'defeito_fabrica_fornecedor' THEN 'fornecedor'
  END;

  INSERT INTO public.cd_movimentos_estoque (
    org_id, fornecedor_id, sku_id, tipo, quantidade, motivo, responsavel_custo, observacao, criado_por_user_id, criado_por_tipo
  ) VALUES (
    p_org_id, p_fornecedor_id, p_sku_id, 'baixa_manual', p_quantidade, p_motivo, v_responsavel_custo, p_observacao, p_criado_por_user_id, 'admin'
  )
  RETURNING * INTO v_row;

  UPDATE public.skus SET estoque_atual = GREATEST(0, estoque_atual - p_quantidade) WHERE id = p_sku_id;

  RETURN jsonb_build_object('ok', true, 'movimento', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cd_baixa_manual(uuid, uuid, numeric, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cd_baixa_manual(uuid, uuid, numeric, text, uuid, uuid, text) TO service_role;

-- ===========================================================================================
-- fn_cd_estoque_conferido_por_sku: conferido (soma histórico) vs estoque_atual (o que o
-- resto do sistema já lê) lado a lado — serve de checagem de integridade.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_cd_estoque_conferido_por_sku(
  p_sku_id uuid,
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'sku_id', s.id,
    'estoque_atual', s.estoque_atual,
    'conferido', coalesce((
      SELECT sum(CASE WHEN tipo = 'conferencia_entrada' THEN quantidade WHEN tipo = 'baixa_manual' THEN -quantidade ELSE 0 END)
      FROM public.cd_movimentos_estoque
      WHERE sku_id = s.id AND org_id = p_org_id
    ), 0)
  )
  FROM public.skus s
  WHERE s.id = p_sku_id AND s.org_id = p_org_id;
$$;

REVOKE ALL ON FUNCTION public.fn_cd_estoque_conferido_por_sku(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cd_estoque_conferido_por_sku(uuid, uuid) TO service_role;

-- ===========================================================================================
-- fn_cd_estoque_conferido_lista: igual acima, paginado por fornecedor — alimenta o painel
-- do operador.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_cd_estoque_conferido_lista(
  p_org_id uuid,
  p_fornecedor_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  sku_id uuid,
  sku text,
  nome_produto text,
  cor text,
  tamanho text,
  fornecedor_id uuid,
  estoque_atual numeric,
  conferido numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS sku_id,
    s.sku,
    s.nome_produto,
    s.cor,
    s.tamanho,
    s.fornecedor_id,
    s.estoque_atual,
    coalesce((
      SELECT sum(CASE WHEN m.tipo = 'conferencia_entrada' THEN m.quantidade WHEN m.tipo = 'baixa_manual' THEN -m.quantidade ELSE 0 END)
      FROM public.cd_movimentos_estoque m
      WHERE m.sku_id = s.id AND m.org_id = p_org_id
    ), 0) AS conferido
  FROM public.skus s
  JOIN public.fornecedores f ON f.id = s.fornecedor_id AND f.opera_no_cd = true
  WHERE s.org_id = p_org_id
    AND (p_fornecedor_id IS NULL OR s.fornecedor_id = p_fornecedor_id)
  ORDER BY s.sku
  LIMIT p_limit OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION public.fn_cd_estoque_conferido_lista(uuid, uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cd_estoque_conferido_lista(uuid, uuid, int, int) TO service_role;

-- ===========================================================================================
-- fn_cd_remessas_pendentes_lista: remessas declaradas sem conferência correspondente —
-- fila do operador.
-- ===========================================================================================
CREATE OR REPLACE FUNCTION public.fn_cd_remessas_pendentes_lista(
  p_org_id uuid,
  p_fornecedor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  remessa_id uuid,
  fornecedor_id uuid,
  fornecedor_nome text,
  sku_id uuid,
  sku text,
  nome_produto text,
  cor text,
  tamanho text,
  quantidade numeric,
  observacao text,
  criado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id AS remessa_id,
    m.fornecedor_id,
    f.nome AS fornecedor_nome,
    m.sku_id,
    s.sku,
    s.nome_produto,
    s.cor,
    s.tamanho,
    m.quantidade,
    m.observacao,
    m.criado_em
  FROM public.cd_movimentos_estoque m
  JOIN public.fornecedores f ON f.id = m.fornecedor_id
  JOIN public.skus s ON s.id = m.sku_id
  WHERE m.org_id = p_org_id
    AND m.tipo = 'remessa_declarada'
    AND (p_fornecedor_id IS NULL OR m.fornecedor_id = p_fornecedor_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.cd_movimentos_estoque c
      WHERE c.remessa_ref_id = m.id AND c.tipo = 'conferencia_entrada'
    )
  ORDER BY m.criado_em ASC;
$$;

REVOKE ALL ON FUNCTION public.fn_cd_remessas_pendentes_lista(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cd_remessas_pendentes_lista(uuid, uuid) TO service_role;
