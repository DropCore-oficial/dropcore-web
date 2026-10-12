-- Achado real 2026-10-12: "Marcar como pago" em /admin/a-pagar-fornecedores disparava sem
-- confirmação e não existia NENHUMA forma de reverter se o admin clicasse na linha errada.
-- RPC de desfazer: só sai de 'pago' pra 'pendente', nunca mexe em status diferente disso.
-- Já aplicado em produção via MCP do Supabase; este arquivo é o registro.
create function public.fn_org_repasse_fornecedor_desfazer_pago(p_org_id uuid, p_repasse_id uuid)
returns financial_repasse_fornecedor
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.financial_repasse_fornecedor;
begin
  update public.financial_repasse_fornecedor
  set status = 'pendente', pago_em = null, atualizado_em = now()
  where id = p_repasse_id
    and org_id = p_org_id
    and status = 'pago'
  returning * into v_row;

  return v_row;
end;
$function$;

revoke all on function public.fn_org_repasse_fornecedor_desfazer_pago from public;
grant execute on function public.fn_org_repasse_fornecedor_desfazer_pago to service_role;
