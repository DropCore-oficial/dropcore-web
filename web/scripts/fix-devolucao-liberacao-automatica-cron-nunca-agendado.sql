-- Achado 2026-11-24: a migração original dessa feature
-- (scripts/add-financial-ledger-devolucao-prazo-fornecedor.sql) só foi APLICADA PARCIALMENTE
-- em produção. A RPC que move o dinheiro (fn_devolucao_liberar_automatico) existia e estava
-- correta, mas as 2 funções de trava e o cron.schedule que deveriam rodar
-- /api/cron/devolucao-liberacao-automatica de hora em hora nunca foram criados no banco.
-- Resultado: a liberação automática de 72h nunca rodou nem uma vez desde que foi "religada"
-- em 2026-11-10 (comentário em web/lib/devolucaoLiberacaoAutomatica.ts) — código morto.
--
-- Impacto real descoberto: 10 devoluções com entrega física já confirmada pelo Mercado
-- Livre há mais de 72h (a mais antiga, 11 dias), sem contestação do fornecedor, travando
-- R$350 (valor_fornecedor) de 2 sellers (Coimbra Company, Vinz Collection) — fornecedor
-- DJULIOS VESTUARIO LTDA nos 10 casos. Liberadas manualmente via fn_devolucao_liberar_automatico
-- (mesma RPC, reconfere tudo antes de mexer) + notificação seller/fornecedor enviada à mão
-- pra essa leva, já que o cron que mandaria isso nunca rodou.
--
-- Este script só fecha o que faltava: trava + agendamento. Não recriar a RPC
-- fn_devolucao_liberar_automatico aqui (já existe e está correta).

create or replace function public.dropcore_try_devolucao_liberacao_automatica_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_try_advisory_lock(913020);
$$;

create or replace function public.dropcore_release_devolucao_liberacao_automatica_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_advisory_unlock(913020);
$$;

revoke all on function public.dropcore_try_devolucao_liberacao_automatica_lock() from public;
revoke all on function public.dropcore_release_devolucao_liberacao_automatica_lock() from public;
grant execute on function public.dropcore_try_devolucao_liberacao_automatica_lock() to postgres;
grant execute on function public.dropcore_release_devolucao_liberacao_automatica_lock() to postgres;

-- Checa devoluções com prazo de 72h vencido a cada hora.
select cron.schedule(
  'dropcore-devolucao-liberacao-automatica',
  '0 * * * *',
  $$select public.dropcore_cron_http_post('/api/cron/devolucao-liberacao-automatica');$$
);
