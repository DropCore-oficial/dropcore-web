-- Visibilidade pro admin de débito de fornecedor ainda não descontado (criado em 2026-10-11
-- junto com o fix do "débito perdoado silenciosamente" no fechamento semanal) — mostra
-- fornecedor, valor e o seller de origem da devolução que gerou o débito. Já aplicado em
-- produção via MCP do Supabase; este arquivo é o registro, pra fonte única de schema.
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
  pedido_id uuid
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
    d.pedido_id
  from public.financial_debito_descontar d
  left join public.fornecedores f on f.id = d.fornecedor_id
  left join public.financial_ledger led on led.id = d.ledger_id
  left join public.sellers s on s.id = led.seller_id
  where d.org_id = p_org_id
    and d.descontado = false
  order by d.criado_em asc;
$function$;

revoke all on function public.fn_org_debitos_fornecedor_pendentes_list from public;
grant execute on function public.fn_org_debitos_fornecedor_pendentes_list to service_role;
