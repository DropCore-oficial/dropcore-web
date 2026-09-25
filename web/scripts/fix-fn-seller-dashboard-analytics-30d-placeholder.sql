-- fn_seller_dashboard_analytics_30d contava produto_nao_vinculado/anuncio_sem_sku como
-- "pedido" nos KPIs (pedidos_30d, pedidos_mes, volume_mes, top_produto, vendas_por_dia,
-- por_canal) — são placeholders de venda que nunca completou (valor_total = 0, sem saldo/
-- estoque envolvido), não pedido real. Mesma lógica já aplicada pro e_teste: excluir dos
-- agregados de negócio.

CREATE OR REPLACE FUNCTION public.fn_seller_dashboard_analytics_30d(p_seller_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_d30 timestamptz := (now() - interval '30 days');
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
    AND status NOT IN ('cancelado', 'erro_saldo', 'produto_nao_vinculado', 'anuncio_sem_sku');

  SELECT count(*)::int, COALESCE(sum(preco_venda), 0)::float8, COALESCE(sum(preco_venda - valor_total), 0)::float8
  INTO v_pedidos_com_venda, v_receita_30d, v_lucro_30d
  FROM public.pedidos
  WHERE seller_id = p_seller_id AND org_id = p_org_id
    AND criado_em >= v_d30
    AND status NOT IN ('cancelado', 'erro_saldo', 'produto_nao_vinculado', 'anuncio_sem_sku')
    AND preco_venda IS NOT NULL AND preco_venda > 0;

  SELECT count(*)::int, COALESCE(sum(valor_total), 0)::float8
  INTO v_pedidos_mes, v_volume_mes
  FROM public.pedidos
  WHERE seller_id = p_seller_id AND org_id = p_org_id
    AND criado_em >= v_inicio_mes
    AND status NOT IN ('cancelado', 'erro_saldo', 'produto_nao_vinculado', 'anuncio_sem_sku');

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_top_produto
  FROM (
    SELECT nome_produto AS nome, count(*)::int AS vendas
    FROM public.pedidos
    WHERE seller_id = p_seller_id AND org_id = p_org_id
      AND criado_em >= v_d30
      AND status NOT IN ('cancelado', 'erro_saldo', 'produto_nao_vinculado', 'anuncio_sem_sku')
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
      AND status NOT IN ('cancelado', 'erro_saldo', 'produto_nao_vinculado', 'anuncio_sem_sku')
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
      AND status NOT IN ('cancelado', 'erro_saldo', 'produto_nao_vinculado', 'anuncio_sem_sku')
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
$function$
;
