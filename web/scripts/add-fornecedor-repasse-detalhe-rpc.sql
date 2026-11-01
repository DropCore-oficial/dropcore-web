-- Extrato por ciclo pro fornecedor: quais pedidos compuseram o valor pago + quais débitos de
-- devolução foram descontados naquele ciclo, cada um amarrado ao pedido original. Resolve o
-- "por que recebi menos essa semana" sem o fornecedor precisar perguntar pro suporte.
-- Regra 9 do CLAUDE.md: leitura nova sempre por RPC SECURITY DEFINER.

create or replace function public.fn_fornecedor_repasse_detalhe(
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_ciclo_repasse date
)
returns table(
  tipo text,
  pedido_id uuid,
  marketplace_numero text,
  valor_fornecedor numeric,
  data_evento timestamptz,
  motivo text
)
language sql
security definer
set search_path to 'public'
as $function$
  select 'venda'::text as tipo, l.pedido_id, p.marketplace_numero, l.valor_fornecedor, l.data_evento,
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

  select 'devolucao'::text as tipo, d.pedido_id, p2.marketplace_numero, -d.valor_fornecedor, d.descontado_em,
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

revoke all on function public.fn_fornecedor_repasse_detalhe from public, anon, authenticated;
grant execute on function public.fn_fornecedor_repasse_detalhe to service_role;
