-- Corrige fn_org_repasse_futuros_preview (card "Repasses futuros" da dashboard admin) pra
-- excluir pedido de teste (pedidos.e_teste) do preview — mesmo motivo do fix em
-- repasse-semanal/route.ts e fornecedorRepasseList.ts: dinheiro fictício não pode aparecer
-- como repasse real previsto. Não reescreve o script que criou a função original.
CREATE OR REPLACE FUNCTION public.fn_org_repasse_futuros_preview(p_org_id uuid, p_hoje date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH by_cycle AS (
    SELECT
      fl.ciclo_repasse,
      sum(COALESCE(fl.valor_fornecedor, 0))::float8 AS valor,
      count(*)::int AS pedidos
    FROM public.financial_ledger fl
    WHERE fl.org_id = p_org_id
      AND fl.tipo IN ('BLOQUEIO', 'VENDA')
      AND fl.status IN ('ENTREGUE', 'AGUARDANDO_REPASSE')
      AND fl.ciclo_repasse IS NOT NULL
      AND fl.ciclo_repasse >= p_hoje
      AND NOT EXISTS (
        SELECT 1 FROM public.pedidos p
        WHERE p.id = fl.pedido_id AND p.e_teste = true
      )
    GROUP BY fl.ciclo_repasse
    HAVING sum(COALESCE(fl.valor_fornecedor, 0)) > 0
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
$function$;
