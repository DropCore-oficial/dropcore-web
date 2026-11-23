-- fn_cd_movimentos_historico_lista: histórico completo do CD (remessa declarada,
-- conferência — pareada com o declarado via remessa_ref_id — e baixa manual, com motivo).
-- Usada tanto pelo fornecedor (vendo só o próprio histórico) quanto pelo admin (podendo
-- filtrar por fornecedor). SECURITY DEFINER chamada só via supabaseAdmin.rpc(...) a partir
-- de rota que já validou o dono (fornecedor por bearer, admin por requireOrgStaffForOrgId) —
-- não confere auth.uid() por dentro, por isso grant só pra service_role, nunca authenticated.
--
-- Índice: idx_cd_mov_fornecedor (fornecedor_id, criado_em DESC) e idx_cd_mov_org (org_id)
-- já cobrem os dois padrões de filtro usados aqui (confirmado em
-- scripts/create-cd-movimentos-estoque.sql, sem necessidade de índice novo).

CREATE OR REPLACE FUNCTION public.fn_cd_movimentos_historico_lista(
  p_org_id uuid,
  p_fornecedor_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  tipo text,
  fornecedor_id uuid,
  fornecedor_nome text,
  sku_id uuid,
  sku text,
  nome_produto text,
  cor text,
  tamanho text,
  quantidade numeric,
  declarado numeric,
  motivo text,
  observacao text,
  criado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    m.id,
    m.tipo,
    m.fornecedor_id,
    f.nome AS fornecedor_nome,
    m.sku_id,
    s.sku,
    s.nome_produto,
    s.cor,
    s.tamanho,
    m.quantidade,
    r.quantidade AS declarado,
    m.motivo,
    m.observacao,
    m.criado_em
  FROM public.cd_movimentos_estoque m
  JOIN public.fornecedores f ON f.id = m.fornecedor_id
  JOIN public.skus s ON s.id = m.sku_id
  LEFT JOIN public.cd_movimentos_estoque r
    ON r.id = m.remessa_ref_id AND m.tipo = 'conferencia_entrada'
  WHERE m.org_id = p_org_id
    AND (p_fornecedor_id IS NULL OR m.fornecedor_id = p_fornecedor_id)
  ORDER BY m.criado_em DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

REVOKE ALL ON FUNCTION public.fn_cd_movimentos_historico_lista(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cd_movimentos_historico_lista(uuid, uuid, integer, integer) TO service_role;
