-- RPC nova: lookup de fornecedor_id/org_id por ml_user_id, pro webhook em tempo real de
-- venda (web/app/api/webhooks/mercadolivre-fornecedor/route.ts) resolver quem é o dono da
-- notificação sem usar .from() direto (regra inegociável 9 do CLAUDE.md — rota nova).
-- Mesmo padrão das outras RPCs de fornecedor_mercadolivre_integrations, ver
-- web/scripts/create-fornecedor-mercadolivre-integrations.sql.

create function public.fn_fornecedor_mercadolivre_integracao_por_ml_user_id(p_ml_user_id text)
returns table (fornecedor_id uuid, org_id uuid)
language sql
security definer
set search_path to 'public'
as $function$
  select fornecedor_id, org_id
  from public.fornecedor_mercadolivre_integrations
  where ml_user_id = p_ml_user_id
  limit 1;
$function$;

revoke all on function public.fn_fornecedor_mercadolivre_integracao_por_ml_user_id from public, anon, authenticated;
grant execute on function public.fn_fornecedor_mercadolivre_integracao_por_ml_user_id to service_role;
