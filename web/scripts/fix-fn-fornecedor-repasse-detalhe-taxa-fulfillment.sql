-- Centro de Distribuição (CD) DropCore: extrato do fornecedor passa a mostrar separado o
-- valor bruto do produto, a taxa de fulfillment CD (0 = isento, nunca escondida) e o
-- líquido — nunca mistura com comissão DropCore (valor_dropcore nunca aparece aqui, já era
-- assim). Execute no SQL Editor do Supabase (ou via MCP).

-- Muda o shape de colunas da função (não é só CREATE OR REPLACE) — precisa DROP antes.
DROP FUNCTION IF EXISTS public.fn_fornecedor_repasse_detalhe(uuid, uuid, date);

CREATE FUNCTION public.fn_fornecedor_repasse_detalhe(
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_ciclo_repasse date
)
RETURNS TABLE(
  tipo text,
  pedido_id uuid,
  marketplace_numero text,
  valor_fornecedor numeric,
  valor_fulfillment_dropcore numeric,
  valor_liquido numeric,
  data_evento timestamp with time zone,
  motivo text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    'venda'::text as tipo, l.pedido_id, p.marketplace_numero,
    l.valor_fornecedor,
    l.valor_fulfillment_dropcore,
    l.valor_fornecedor - l.valor_fulfillment_dropcore as valor_liquido,
    l.data_evento,
    'Venda'::text as motivo
  from public.financial_ledger l
  left join public.pedidos p on p.id = l.pedido_id
  where l.org_id = p_org_id
    and l.fornecedor_id = p_fornecedor_id
    and l.ciclo_repasse = p_ciclo_repasse
    and l.status = 'PAGO'
    and l.tipo in ('BLOQUEIO', 'VENDA')
    and coalesce(p.e_teste, false) = false

  union all

  select
    'devolucao'::text as tipo, d.pedido_id, p2.marketplace_numero,
    -d.valor_fornecedor,
    0::numeric as valor_fulfillment_dropcore,
    -d.valor_fornecedor as valor_liquido,
    d.descontado_em,
    'Devolução confirmada'::text as motivo
  from public.financial_debito_descontar d
  left join public.pedidos p2 on p2.id = d.pedido_id
  where d.org_id = p_org_id
    and d.fornecedor_id = p_fornecedor_id
    and d.ciclo_a_descontar = p_ciclo_repasse
    and d.descontado = true
    and coalesce(p2.e_teste, false) = false

  order by data_evento;
$function$;

REVOKE ALL ON FUNCTION public.fn_fornecedor_repasse_detalhe(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_repasse_detalhe(uuid, uuid, date) TO service_role;
