-- Generaliza a RPC de cancelamento+estorno (criada em 2026-10-11 só pro ML) pra qualquer
-- canal — achado real 2026-10-12: Olist e Bling têm o mesmo buraco que o ML tinha
-- (cancelamento que não propaga pro pedido/saldo), e a RPC antiga só agia quando
-- canal_venda='mercado_livre'. Em vez de 3 RPCs quase-idênticas, generaliza uma só: age em
-- qualquer canal, só checando status='enviado' (onde o saldo fica preso de verdade).
-- `cancelado_motivo` vira parâmetro em vez de fixo 'ml_sem_sync'. Já aplicado em produção
-- via MCP do Supabase; este arquivo é o registro.
drop function if exists public.fn_pedido_cancelar_estorno_ml(uuid, uuid);

create function public.fn_pedido_cancelar_estorno(p_pedido_id uuid, p_org_id uuid, p_motivo text)
returns table(ok boolean, already_cancelled boolean, seller_id uuid, fornecedor_id uuid, valor_estornado numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido record;
  v_valor numeric;
begin
  select p.id, p.seller_id, p.fornecedor_id, p.status
  into v_pedido
  from public.pedidos p
  where p.id = p_pedido_id and p.org_id = p_org_id
  for update;

  if v_pedido.id is null then
    return query select false, false, null::uuid, null::uuid, 0::numeric;
    return;
  end if;

  if v_pedido.status <> 'enviado' then
    return query select true, true, v_pedido.seller_id, v_pedido.fornecedor_id, 0::numeric;
    return;
  end if;

  update public.pedidos
  set status = 'cancelado', cancelado_motivo = p_motivo, atualizado_em = now()
  where id = p_pedido_id;

  with atualizados as (
    update public.financial_ledger
    set status = 'CANCELADO'
    where pedido_id = p_pedido_id
      and org_id = p_org_id
      and tipo in ('BLOQUEIO', 'VENDA')
      and status = 'BLOQUEADO'
    returning valor_total
  )
  select coalesce(sum(valor_total), 0) into v_valor from atualizados;

  return query select true, false, v_pedido.seller_id, v_pedido.fornecedor_id, v_valor;
end;
$function$;

revoke all on function public.fn_pedido_cancelar_estorno(uuid, uuid, text) from public;
grant execute on function public.fn_pedido_cancelar_estorno(uuid, uuid, text) to service_role;
