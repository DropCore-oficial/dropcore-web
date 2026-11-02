-- Admin não tinha como saber QUAL pedido gerou cada débito pendente — só o pedido_id
-- interno, nunca o número do pedido (achado 2026-11-02, mesma lacuna já fechada pro
-- fornecedor em fn_fornecedor_repasse_detalhe). Adiciona marketplace_numero no retorno.
-- CREATE OR REPLACE não permite mudar colunas de RETURNS TABLE — dropa antes.

drop function if exists public.fn_org_debitos_fornecedor_pendentes_list(uuid);

create function public.fn_org_debitos_fornecedor_pendentes_list(p_org_id uuid)
returns table (
  id uuid,
  fornecedor_id uuid,
  fornecedor_nome text,
  valor_fornecedor numeric,
  ciclo_a_descontar date,
  criado_em timestamptz,
  seller_id uuid,
  seller_nome text,
  pedido_id uuid,
  marketplace_numero text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    d.id,
    d.fornecedor_id,
    f.nome as fornecedor_nome,
    d.valor_fornecedor,
    d.ciclo_a_descontar,
    d.criado_em,
    led.seller_id,
    s.nome as seller_nome,
    d.pedido_id,
    p.marketplace_numero
  from public.financial_debito_descontar d
  left join public.fornecedores f on f.id = d.fornecedor_id
  left join public.financial_ledger led on led.id = d.ledger_id
  left join public.sellers s on s.id = led.seller_id
  left join public.pedidos p on p.id = d.pedido_id
  where d.org_id = p_org_id
    and d.descontado = false
  order by d.criado_em asc;
$function$;

revoke all on function public.fn_org_debitos_fornecedor_pendentes_list from public, anon, authenticated;
grant execute on function public.fn_org_debitos_fornecedor_pendentes_list to service_role;
