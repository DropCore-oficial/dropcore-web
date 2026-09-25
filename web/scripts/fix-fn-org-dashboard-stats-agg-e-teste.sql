-- Corrige fn_org_dashboard_stats_agg pra excluir seller com saldo fictício
-- (sellers.e_teste) da soma "Saldo em conta" da dashboard admin — hoje só o Segatto, cujo
-- saldo_atual não é dinheiro real (ver add-e-teste-to-sellers.sql). Não reescreve o script
-- que criou a função original.
CREATE OR REPLACE FUNCTION public.fn_org_dashboard_stats_agg(p_org_id uuid, p_primeiro_dia_mes timestamp with time zone, p_ultimo_dia_mes timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'saldo_sellers_total',
      COALESCE((SELECT sum(saldo_atual)::float8 FROM public.sellers WHERE org_id = p_org_id AND e_teste = false), 0),
    'estoque_baixo',
      (
        SELECT count(*)::int
        FROM public.skus s
        WHERE s.org_id = p_org_id
          AND s.sku NOT ILIKE 'DJU999%'
          AND s.estoque_minimo IS NOT NULL
          AND s.estoque_atual IS NOT NULL
          AND s.estoque_atual < s.estoque_minimo
      ),
    'entrada_mes',
      COALESCE(
        (
          SELECT sum(valor)::float8
          FROM public.seller_depositos_pix
          WHERE org_id = p_org_id
            AND status = 'aprovado'
            AND aprovado_em IS NOT NULL
            AND aprovado_em >= p_primeiro_dia_mes
            AND aprovado_em <= p_ultimo_dia_mes
        ),
        0
      ),
    'mensalidades_sellers_pendente',
      COALESCE(
        (
          SELECT sum(valor)::float8
          FROM public.financial_mensalidades
          WHERE org_id = p_org_id AND tipo = 'seller' AND status = 'pendente'
        ),
        0
      ),
    'mensalidades_fornecedores_pendente',
      COALESCE(
        (
          SELECT sum(valor)::float8
          FROM public.financial_mensalidades
          WHERE org_id = p_org_id AND tipo = 'fornecedor' AND status = 'pendente'
        ),
        0
      ),
    'produto_cor_count',
      (
        SELECT count(*)::int
        FROM (
          SELECT DISTINCT
            trim(COALESCE(nome_produto, '')) || '::' || trim(COALESCE(cor, '')) AS chave
          FROM public.skus
          WHERE org_id = p_org_id
            AND status ILIKE 'ativo'
            AND sku NOT ILIKE 'DJU999%'
        ) AS distintos
      ),
    'min_vencimento_pendente',
      (
        SELECT min(vencimento_em)
        FROM public.financial_mensalidades
        WHERE org_id = p_org_id
          AND status = 'pendente'
          AND vencimento_em IS NOT NULL
      ),
    'receita_dropcore_total',
      COALESCE(
        (
          SELECT sum(total_dropcore)::float8
          FROM public.financial_ciclos_repasse
          WHERE org_id = p_org_id AND status = 'fechado'
        ),
        0
      )
  );
$function$;
