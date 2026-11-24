-- Resumo de falha ativa de sync com o ML, escopado a UM seller (não a org inteira) — pra
-- ele mesmo ver no próprio painel que a conexão dele quebrou. Mesma janela de 48h e mesmos
-- status (pendente/esgotado) do fn_ml_sync_falhas_resumo_admin, só que sem agrupar por
-- fornecedor (o seller só precisa saber "minha conexão com o ML está com problema").
CREATE OR REPLACE FUNCTION public.fn_ml_sync_falha_resumo_seller(
  p_seller_id uuid
)
RETURNS TABLE (
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
    count(*) FILTER (WHERE f.status = 'pendente') AS qtd_pendente,
    count(*) FILTER (WHERE f.status = 'esgotado') AS qtd_esgotado,
    (array_agg(f.erro ORDER BY f.atualizado_em DESC))[1] AS ultimo_erro,
    max(f.atualizado_em) AS ultima_tentativa
  FROM public.ml_sync_falhas f
  WHERE f.seller_id = p_seller_id
    AND f.status IN ('pendente', 'esgotado')
    AND f.atualizado_em > now() - interval '48 hours';
$$;

REVOKE ALL ON FUNCTION public.fn_ml_sync_falha_resumo_seller(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_falha_resumo_seller(uuid) TO service_role;
