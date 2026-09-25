-- Corrige fn_org_dashboard_pro_30d (gráfico "Volume de pedidos"/receita/top sellers-
-- fornecedores da dashboard admin, últimos 30 dias) pra excluir pedido de teste
-- (pedidos.e_teste) de todos os agregados — sem isso, 361 dos 702 pedidos fake do seller
-- Segatto/fornecedor Djulios (criados em setembro/2026) inflavam o número real do negócio.
-- Não reescreve o script que criou a função original.
CREATE OR REPLACE FUNCTION public.fn_org_dashboard_pro_30d(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_d30 timestamptz := (now() - interval '30 days');
  v_total_pedidos int;
  v_volume_total float8;
  v_volume_dropcore float8;
  v_volume_fornecedor float8;
  v_top_sellers jsonb;
  v_top_forn jsonb;
  v_vendas_dia jsonb;
  v_receita_pago float8;
  v_receita_pendente float8;
  v_ticket float8;
  v_margem float8;
BEGIN
  SELECT
    count(*)::int,
    COALESCE(sum(COALESCE(valor_total, 0)), 0),
    COALESCE(sum(COALESCE(valor_dropcore, 0)), 0),
    COALESCE(sum(COALESCE(valor_fornecedor, 0)), 0)
  INTO v_total_pedidos, v_volume_total, v_volume_dropcore, v_volume_fornecedor
  FROM public.pedidos
  WHERE org_id = p_org_id
    AND criado_em >= v_d30
    AND status NOT IN ('cancelado', 'erro_saldo', 'pendente_estoque', 'bloqueado')
    AND e_teste = false;

  v_ticket := CASE WHEN v_total_pedidos > 0 THEN v_volume_total / v_total_pedidos ELSE 0 END;
  v_margem := CASE WHEN v_volume_total > 0 THEN (v_volume_dropcore / v_volume_total) * 100 ELSE 0 END;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.total DESC), '[]'::jsonb)
  INTO v_top_sellers
  FROM (
    SELECT
      p.seller_id AS id,
      COALESCE(s.nome, '—') AS nome,
      sum(COALESCE(p.valor_total, 0))::float8 AS total,
      count(*)::int AS pedidos
    FROM public.pedidos p
    LEFT JOIN public.sellers s ON s.id = p.seller_id
    WHERE p.org_id = p_org_id
      AND p.criado_em >= v_d30
      AND p.status NOT IN ('cancelado', 'erro_saldo', 'pendente_estoque', 'bloqueado')
      AND p.e_teste = false
    GROUP BY p.seller_id, s.nome
    ORDER BY sum(COALESCE(p.valor_total, 0)) DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.total DESC), '[]'::jsonb)
  INTO v_top_forn
  FROM (
    SELECT
      p.fornecedor_id AS id,
      COALESCE(f.nome, '—') AS nome,
      sum(COALESCE(p.valor_total, 0))::float8 AS total,
      sum(COALESCE(p.valor_dropcore, 0))::float8 AS dropcore,
      count(*)::int AS pedidos
    FROM public.pedidos p
    LEFT JOIN public.fornecedores f ON f.id = p.fornecedor_id
    WHERE p.org_id = p_org_id
      AND p.criado_em >= v_d30
      AND p.status NOT IN ('cancelado', 'erro_saldo', 'pendente_estoque', 'bloqueado')
      AND p.e_teste = false
    GROUP BY p.fornecedor_id, f.nome
    ORDER BY sum(COALESCE(p.valor_total, 0)) DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.dia), '[]'::jsonb)
  INTO v_vendas_dia
  FROM (
    SELECT
      to_char((p.criado_em AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS dia,
      sum(COALESCE(p.valor_total, 0))::float8 AS total,
      sum(COALESCE(p.valor_dropcore, 0))::float8 AS dropcore,
      count(*)::int AS count
    FROM public.pedidos p
    WHERE p.org_id = p_org_id
      AND p.criado_em >= v_d30
      AND p.status NOT IN ('cancelado', 'erro_saldo', 'pendente_estoque', 'bloqueado')
      AND p.e_teste = false
    GROUP BY (p.criado_em AT TIME ZONE 'UTC')::date
    ORDER BY (p.criado_em AT TIME ZONE 'UTC')::date
  ) t;

  SELECT
    COALESCE(sum(CASE WHEN status = 'PAGO' THEN COALESCE(valor_dropcore, 0) ELSE 0 END), 0),
    COALESCE(
      sum(
        CASE
          WHEN status NOT IN ('PAGO', 'CANCELADO', 'DEVOLVIDO') THEN COALESCE(valor_dropcore, 0)
          ELSE 0
        END
      ),
      0
    )
  INTO v_receita_pago, v_receita_pendente
  FROM public.financial_ledger fl
  WHERE fl.org_id = p_org_id
    AND fl.tipo IN ('BLOQUEIO', 'VENDA')
    AND fl.data_evento >= v_d30
    AND NOT EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = fl.pedido_id AND p.e_teste = true
    );

  RETURN jsonb_build_object(
    'periodo', '30d',
    'total_pedidos', v_total_pedidos,
    'volume_total', v_volume_total,
    'volume_fornecedor', v_volume_fornecedor,
    'volume_dropcore', v_volume_dropcore,
    'ticket_medio', round(v_ticket::numeric, 2),
    'margem_media_pct', round(v_margem::numeric, 2),
    'receita_pago', v_receita_pago,
    'receita_pendente', v_receita_pendente,
    'top_sellers', v_top_sellers,
    'top_fornecedores', v_top_forn,
    'vendas_por_dia', v_vendas_dia
  );
END;
$function$;
