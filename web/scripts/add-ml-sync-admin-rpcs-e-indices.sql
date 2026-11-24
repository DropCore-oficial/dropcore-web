-- Incidente 2026-11-24: não existia NENHUMA tela de admin pra sync com o ML (só a do
-- fornecedor, que não serve — quem corrige é o admin). RPCs novas pra alimentar tanto a
-- tela ao vivo (/admin/ml-sync) quanto o alerta recorrente pro admin.

-- Índices certos antes das RPCs (regra do projeto: toda RPC precisa de índice de verdade,
-- não só supor).
CREATE INDEX IF NOT EXISTS ml_sync_log_org_criado_idx ON public.ml_sync_log (org_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ml_sync_falhas_org_status_seller_idx
  ON public.ml_sync_falhas (org_id, status, seller_id, fornecedor_id)
  WHERE status IN ('pendente', 'esgotado');

-- Histórico recente de sync com o ML, org inteira (não um fornecedor só) — pra tela ao vivo.
CREATE OR REPLACE FUNCTION public.fn_ml_sync_log_listar_admin(
  p_org_id uuid,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  seller_id uuid,
  seller_nome text,
  fornecedor_id uuid,
  fornecedor_nome text,
  sku text,
  ml_item_id text,
  estoque_enviado int,
  estoque_confirmado int,
  sucesso boolean,
  erro text,
  criado_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.seller_id, s.nome, l.fornecedor_id, forn.nome, l.sku, l.ml_item_id,
         l.estoque_enviado, l.estoque_confirmado, l.sucesso, l.erro, l.criado_em
  FROM public.ml_sync_log l
  JOIN public.sellers s ON s.id = l.seller_id
  LEFT JOIN public.fornecedores forn ON forn.id = l.fornecedor_id
  WHERE l.org_id = p_org_id
  ORDER BY l.criado_em DESC
  LIMIT p_limit;
$$;

-- Resumo de falha ativa (pendente = ainda tentando, esgotado = desistiu, os dois precisam
-- de atenção humana) agrupado por seller/fornecedor — pra tela ao vivo e pro cron de alerta
-- decidir quem já passou do limite pra notificar o admin.
CREATE OR REPLACE FUNCTION public.fn_ml_sync_falhas_resumo_admin(
  p_org_id uuid
)
RETURNS TABLE (
  seller_id uuid,
  seller_nome text,
  fornecedor_id uuid,
  fornecedor_nome text,
  qtd_pendente bigint,
  qtd_esgotado bigint,
  ultimo_erro text,
  ultima_tentativa timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.seller_id,
    s.nome,
    f.fornecedor_id,
    forn.nome,
    count(*) FILTER (WHERE f.status = 'pendente') AS qtd_pendente,
    count(*) FILTER (WHERE f.status = 'esgotado') AS qtd_esgotado,
    (array_agg(f.erro ORDER BY f.atualizado_em DESC))[1] AS ultimo_erro,
    max(f.atualizado_em) AS ultima_tentativa
  FROM public.ml_sync_falhas f
  JOIN public.sellers s ON s.id = f.seller_id
  LEFT JOIN public.fornecedores forn ON forn.id = f.fornecedor_id
  WHERE f.org_id = p_org_id AND f.status IN ('pendente', 'esgotado')
  GROUP BY f.seller_id, s.nome, f.fornecedor_id, forn.nome
  ORDER BY (count(*) FILTER (WHERE f.status = 'pendente') + count(*) FILTER (WHERE f.status = 'esgotado')) DESC;
$$;

REVOKE ALL ON FUNCTION public.fn_ml_sync_log_listar_admin(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ml_sync_falhas_resumo_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_log_listar_admin(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_falhas_resumo_admin(uuid) TO service_role;
