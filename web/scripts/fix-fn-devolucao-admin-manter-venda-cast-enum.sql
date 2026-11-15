-- Corrige fn_devolucao_admin_manter_venda: erro real em produção 2026-11-14 ao clicar
-- "Manter venda" (devolução não procede) pela primeira vez — "column "status" is of type
-- financial_ledger_status but expression is of type text". `em_devolucao_status_anterior`
-- é `text`, `financial_ledger.status` é enum `financial_ledger_status`; o Postgres não
-- converte `text` de uma expressão (coalesce) automaticamente pro enum, só literal direto.
-- Fix: cast explícito ::financial_ledger_status no valor final do coalesce.

CREATE OR REPLACE FUNCTION public.fn_devolucao_admin_manter_venda(p_ledger_id uuid)
 RETURNS TABLE(ok boolean, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
begin
  select status, em_devolucao_status_anterior, pedido_id
    into v_row
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.';
    return;
  end if;
  if v_row.status <> 'EM_DEVOLUCAO' then
    return query select false, 'Registro não está em devolução.';
    return;
  end if;

  update public.financial_ledger
     set status = coalesce(v_row.em_devolucao_status_anterior, 'ENTREGUE')::financial_ledger_status,
         em_devolucao_desde = null,
         em_devolucao_status_anterior = null
   where id = p_ledger_id;

  if v_row.pedido_id is not null then
    update public.pedidos set status = 'entregue' where id = v_row.pedido_id and status = 'em_devolucao';
  end if;

  return query select true, null::text;
end;
$function$;
