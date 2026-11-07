-- Guarda o resultado da última sincronização de estoque (cron ou webhook em tempo real) na
-- própria linha de fornecedor_mercadolivre_integrations, pro fornecedor conseguir ver se
-- deu erro em vez de só confiar que "funcionou" (achado 2026-11-07, pedido do Sr Stark).
-- Mesmo padrão de olist_last_sync_* em seller_olist_integrations, mas via RPC (regra 9 —
-- fornecedor_mercadolivre_integrations é tabela nova, sem .from() direto).

alter table public.fornecedor_mercadolivre_integrations
  add column if not exists ml_last_sync_at timestamptz,
  add column if not exists ml_last_sync_status text,
  add column if not exists ml_last_sync_error text,
  add column if not exists ml_last_sync_summary jsonb;

create function public.fn_fornecedor_mercadolivre_integracao_sync_state_set(
  p_fornecedor_id uuid,
  p_status text,
  p_error text,
  p_summary jsonb
)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.fornecedor_mercadolivre_integrations
  set ml_last_sync_at = now(),
      ml_last_sync_status = p_status,
      ml_last_sync_error = p_error,
      ml_last_sync_summary = p_summary
  where fornecedor_id = p_fornecedor_id;
$function$;

revoke all on function public.fn_fornecedor_mercadolivre_integracao_sync_state_set from public, anon, authenticated;
grant execute on function public.fn_fornecedor_mercadolivre_integracao_sync_state_set to service_role;
