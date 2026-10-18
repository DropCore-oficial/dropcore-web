-- Loop de aprendizado + métrica de valor do Gestor (hub) — 2026-10-17. Hub já tem
-- seller_ai_acoes (auditoria de ação aplicada), só faltava uma leitura agregada pro chat do
-- Tiago consumir. Mesmo padrão de service_role das outras RPC que essa rota já chama
-- (fn_seller_ai_chat_historico etc, ver app/api/seller/gestores-ia/tiago/chat/route.ts).

create or replace function public.fn_seller_ai_acoes_resumo(
  p_seller_id uuid,
  p_dias int default 30
) returns table (gestor text, qtd_acoes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select gestor, count(*)::bigint as qtd_acoes
  from public.seller_ai_acoes
  where seller_id = p_seller_id
    and criado_em >= now() - (p_dias || ' days')::interval
  group by gestor;
$$;

revoke all on function public.fn_seller_ai_acoes_resumo from public;
revoke all on function public.fn_seller_ai_acoes_resumo from anon;
revoke all on function public.fn_seller_ai_acoes_resumo from authenticated;
grant execute on function public.fn_seller_ai_acoes_resumo to service_role;
