-- RPCs para dashboards admin (agregações no Postgres). Execute após add-performance-indexes-dashboard.sql.

-- Agregados pesados do GET /api/org/dashboard-stats
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
      )
  );
$$;

COMMENT ON FUNCTION public.fn_org_dashboard_stats_agg IS
  'Totais agregados para dashboard-stats (saldo, estoque baixo, mensalidades, produto+cor).';

-- Analytics Pro: últimos 30 dias (substitui full scan em Node)
CREATE OR REPLACE FUNCTION public.fn_org_dashboard_pro_30d(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND status NOT IN ('cancelado', 'erro_saldo');

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
      AND p.status NOT IN ('cancelado', 'erro_saldo')
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
      AND p.status NOT IN ('cancelado', 'erro_saldo')
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
      AND p.status NOT IN ('cancelado', 'erro_saldo')
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
  FROM public.financial_ledger
  WHERE org_id = p_org_id
    AND tipo IN ('BLOQUEIO', 'VENDA')
    AND data_evento >= v_d30;

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
$$;

COMMENT ON FUNCTION public.fn_org_dashboard_pro_30d IS
  'Analytics Pro 30d: totais, tops e vendas por dia sem carregar todos os pedidos no app.';

REVOKE ALL ON FUNCTION public.fn_org_dashboard_stats_agg(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_org_dashboard_pro_30d(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_org_dashboard_stats_agg(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_org_dashboard_pro_30d(uuid) TO service_role;
