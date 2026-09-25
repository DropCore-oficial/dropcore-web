-- Corrige fn_fornecedor_dashboard_stats pra excluir pedido de teste (pedidos.e_teste) das
-- contagens/somas mostradas ao fornecedor — hoje 361 dos 702 pedidos fake do fornecedor
-- Djulios caem no mês corrente e inflavam pedidos_mes_count/pedidos_mes_valor/
-- pedidos_aguardando_postagem. Não reescreve o script antigo que criou a função (regra do
-- projeto) — script corretivo novo.
CREATE OR REPLACE FUNCTION public.fn_fornecedor_dashboard_stats(p_org_id uuid, p_fornecedor_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'pedidos_aguardando_postagem',
      (
        SELECT count(*)::int
        FROM public.pedidos
        WHERE org_id = p_org_id
          AND fornecedor_id = p_fornecedor_id
          AND status = 'enviado'
          AND e_teste = false
      ),
    'pedidos_mes_count',
      (
        SELECT count(*)::int
        FROM public.pedidos
        WHERE org_id = p_org_id
          AND fornecedor_id = p_fornecedor_id
          AND status IN ('enviado', 'aguardando_repasse', 'entregue')
          AND criado_em >= p_start
          AND criado_em <= p_end
          AND e_teste = false
      ),
    'pedidos_mes_valor',
      COALESCE(
        (
          SELECT sum(valor_fornecedor)::float8
          FROM public.pedidos
          WHERE org_id = p_org_id
            AND fornecedor_id = p_fornecedor_id
            AND status IN ('enviado', 'aguardando_repasse', 'entregue')
            AND criado_em >= p_start
            AND criado_em <= p_end
            AND e_teste = false
        ),
        0
      ),
    'produtos_ativos',
      (
        SELECT count(*)::int
        FROM public.skus
        WHERE fornecedor_id = p_fornecedor_id
          AND status = 'ativo'
      ),
    'estoque_baixo',
      (
        SELECT count(*)::int
        FROM public.skus
        WHERE fornecedor_id = p_fornecedor_id
          AND sku NOT ILIKE 'DJU999%'
          AND estoque_minimo IS NOT NULL
          AND estoque_atual IS NOT NULL
          AND estoque_atual < estoque_minimo
      ),
    'total_a_receber',
      COALESCE(
        (
          SELECT sum(valor_total)::float8
          FROM public.financial_repasse_fornecedor
          WHERE org_id = p_org_id
            AND fornecedor_id = p_fornecedor_id
            AND status IN ('pendente', 'liberado')
        ),
        0
      )
  );
$function$;
