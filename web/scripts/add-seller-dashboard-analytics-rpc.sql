-- RPC de analytics do dashboard do seller — agregação no Postgres, sem depender do
-- extrato (financial_ledger) capado em 200 linhas em /api/seller/me. Achado ao vivo
-- 2026-09-22: seller com mais de 200 lançamentos no período (ex. import em lote) tinha
-- "Lucro"/"Receita"/"Pedidos (mês)" silenciosamente subcontados, porque a conta era feita
-- em JS reduzindo só as 200 linhas mais recentes do extrato, não o total real.
-- Mesmo padrão de fn_org_dashboard_pro_30d (scripts/add-dashboard-rpc.sql), mas por seller
-- e direto na tabela pedidos (não precisa do join com financial_ledger).

CREATE OR REPLACE FUNCTION public.fn_seller_dashboard_analytics_30d(p_seller_id uuid, p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d30 timestamptz := (now() - interval '30 days');
  -- 90 dias cobre os 5 períodos numéricos do seletor "Volume de pedidos" (7/14/30/60/90d) —
  -- esse gráfico também vivia do extrato capado em 200 linhas pros períodos != 14d, mesmo
  -- bug do Lucro/Receita (achado ao vivo 2026-09-22, mesma sessão).
  v_d90 timestamptz := (now() - interval '90 days');
  v_inicio_mes timestamptz := date_trunc('month', now());
  v_pedidos_30d int;
  v_custo_30d float8;
  v_pedidos_com_venda int;
  v_receita_30d float8;
  v_lucro_30d float8;
  v_top_produto jsonb;
  v_vendas_dia jsonb;
  v_por_canal jsonb;
  v_pedidos_mes int;
  v_volume_mes float8;
BEGIN
  SELECT count(*)::int, COALESCE(sum(valor_total), 0)::float8
  INTO v_pedidos_30d, v_custo_30d
  FROM public.pedidos
  WHERE seller_id = p_seller_id AND org_id = p_org_id
    AND criado_em >= v_d30
    AND status NOT IN ('cancelado', 'erro_saldo');

  -- Receita/lucro/ticket só contam pedido com preco_venda informado (mesma regra do
  -- cálculo antigo em JS — nem todo canal/origem preenche preço de venda ao cliente).
  SELECT count(*)::int, COALESCE(sum(preco_venda), 0)::float8, COALESCE(sum(preco_venda - valor_total), 0)::float8
  INTO v_pedidos_com_venda, v_receita_30d, v_lucro_30d
  FROM public.pedidos
  WHERE seller_id = p_seller_id AND org_id = p_org_id
    AND criado_em >= v_d30
    AND status NOT IN ('cancelado', 'erro_saldo')
    AND preco_venda IS NOT NULL AND preco_venda > 0;

  SELECT count(*)::int, COALESCE(sum(valor_total), 0)::float8
  INTO v_pedidos_mes, v_volume_mes
  FROM public.pedidos
  WHERE seller_id = p_seller_id AND org_id = p_org_id
    AND criado_em >= v_inicio_mes
    AND status NOT IN ('cancelado', 'erro_saldo');

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_top_produto
  FROM (
    SELECT nome_produto AS nome, count(*)::int AS vendas
    FROM public.pedidos
    WHERE seller_id = p_seller_id AND org_id = p_org_id
      AND criado_em >= v_d30
      AND status NOT IN ('cancelado', 'erro_saldo')
      AND nome_produto IS NOT NULL
    GROUP BY nome_produto
    ORDER BY count(*) DESC
    LIMIT 1
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.dia), '[]'::jsonb) INTO v_vendas_dia
  FROM (
    SELECT
      to_char((criado_em AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS dia,
      COALESCE(sum(preco_venda), 0)::float8 AS receita,
      COALESCE(sum(valor_total), 0)::float8 AS custo,
      count(*)::int AS count
    FROM public.pedidos
    WHERE seller_id = p_seller_id AND org_id = p_org_id
      AND criado_em >= v_d90
      AND status NOT IN ('cancelado', 'erro_saldo')
    GROUP BY (criado_em AT TIME ZONE 'UTC')::date
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.receita DESC), '[]'::jsonb) INTO v_por_canal
  FROM (
    SELECT
      COALESCE(canal_venda, 'outro') AS canal,
      COALESCE(sum(preco_venda), 0)::float8 AS receita,
      COALESCE(sum(preco_venda - valor_total), 0)::float8 AS lucro
    FROM public.pedidos
    WHERE seller_id = p_seller_id AND org_id = p_org_id
      AND criado_em >= v_d30
      AND status NOT IN ('cancelado', 'erro_saldo')
      AND preco_venda IS NOT NULL AND preco_venda > 0
    GROUP BY canal_venda
  ) t;

  RETURN jsonb_build_object(
    'pedidos_30d', v_pedidos_30d,
    'custo_30d', v_custo_30d,
    'receita_30d', v_receita_30d,
    'lucro_30d', v_lucro_30d,
    'margem_30d_pct', CASE WHEN v_receita_30d > 0 THEN round((v_lucro_30d / v_receita_30d * 100)::numeric, 2) ELSE null END,
    'ticket_medio_30d', CASE WHEN v_pedidos_com_venda > 0 THEN round((v_receita_30d / v_pedidos_com_venda)::numeric, 2) ELSE null END,
    'tem_dados_venda', v_pedidos_com_venda > 0,
    'top_produto', v_top_produto,
    'vendas_por_dia', v_vendas_dia,
    'por_canal', v_por_canal,
    'pedidos_mes', v_pedidos_mes,
    'volume_mes', v_volume_mes
  );
END;
$$;

COMMENT ON FUNCTION public.fn_seller_dashboard_analytics_30d IS
  'Analytics do dashboard do seller (30 dias corridos + mes calendario) direto de pedidos, sem depender do extrato capado em 200 linhas.';

REVOKE ALL ON FUNCTION public.fn_seller_dashboard_analytics_30d(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_seller_dashboard_analytics_30d(uuid, uuid) TO service_role;
