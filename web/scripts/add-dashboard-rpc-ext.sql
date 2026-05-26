-- Extensão dos RPCs de dashboard (rode no Supabase SQL Editor após add-dashboard-rpc.sql).

-- + receita_dropcore_total no agregado principal
CREATE OR REPLACE FUNCTION public.fn_org_dashboard_stats_agg(
  p_org_id uuid,
  p_primeiro_dia_mes timestamptz,
  p_ultimo_dia_mes timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'saldo_sellers_total',
      COALESCE((SELECT sum(saldo_atual)::float8 FROM public.sellers WHERE org_id = p_org_id), 0),
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
$$;

-- Preview repasses futuros (substitui scan de até 2000 linhas no Node)
CREATE OR REPLACE FUNCTION public.fn_org_repasse_futuros_preview(p_org_id uuid, p_hoje date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH by_cycle AS (
    SELECT
      ciclo_repasse,
      sum(COALESCE(valor_fornecedor, 0))::float8 AS valor,
      count(*)::int AS pedidos
    FROM public.financial_ledger
    WHERE org_id = p_org_id
      AND tipo IN ('BLOQUEIO', 'VENDA')
      AND status IN ('ENTREGUE', 'AGUARDANDO_REPASSE')
      AND ciclo_repasse IS NOT NULL
      AND ciclo_repasse >= p_hoje
    GROUP BY ciclo_repasse
    HAVING sum(COALESCE(valor_fornecedor, 0)) > 0
  ),
  top8 AS (
    SELECT ciclo_repasse, valor, pedidos
    FROM by_cycle
    ORDER BY ciclo_repasse
    LIMIT 8
  ),
  totals AS (
    SELECT
      COALESCE(sum(valor), 0)::float8 AS total_valor,
      COALESCE(sum(pedidos), 0)::int AS total_pedidos,
      count(*)::int AS ciclos_qtd
    FROM top8
  ),
  first_row AS (
    SELECT ciclo_repasse, valor, pedidos
    FROM top8
    ORDER BY ciclo_repasse
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'repasse_futuros_previstos_total_valor', (SELECT total_valor FROM totals),
    'repasse_futuros_previstos_total_pedidos', (SELECT total_pedidos FROM totals),
    'repasse_futuros_previstos_ciclos_qtd', (SELECT ciclos_qtd FROM totals),
    'repasse_futuros_proximo_ciclo', (SELECT ciclo_repasse FROM first_row),
    'repasse_futuros_proximo_pedidos', COALESCE((SELECT pedidos FROM first_row), 0),
    'repasse_futuros_proximo_valor', COALESCE((SELECT valor FROM first_row), 0)
  );
$$;

-- Totais calculadora (widget da dash sem varrer todos os valores no Node)
CREATE OR REPLACE FUNCTION public.fn_calculadora_recebimentos_totais()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'quantidade_total', (SELECT count(*)::int FROM public.calculadora_recebimentos),
    'soma_total_geral', COALESCE((SELECT sum(valor)::float8 FROM public.calculadora_recebimentos), 0)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_org_repasse_futuros_preview(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_calculadora_recebimentos_totais() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_org_repasse_futuros_preview(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_calculadora_recebimentos_totais() TO service_role;
