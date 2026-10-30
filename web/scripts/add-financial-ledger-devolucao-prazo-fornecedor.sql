-- Liberação automática de saldo em devolução (decisão Sr Stark, 2026-10-29): fornecedor
-- ganha ação direta no portal dele pra confirmar ("chegou tudo certo", libera na hora) ou
-- contestar ("defeito/outra coisa", com foto — trava a liberação automática, cai pro admin
-- decidir manual como já é hoje). Se o fornecedor não fizer nada em 48h contadas a partir do
-- momento que o admin registra EM_DEVOLUCAO, o sistema libera o dinheiro pro seller sozinho.
-- Regra 9 do CLAUDE.md: mutação financeira nova sempre por RPC SECURITY DEFINER, nunca
-- .from() direto em código novo.

alter table public.financial_ledger
  add column if not exists em_devolucao_desde timestamptz,
  add column if not exists fornecedor_confirmou_recebimento_em timestamptz,
  add column if not exists fornecedor_contestou_em timestamptz,
  add column if not exists fornecedor_contestacao_texto text,
  add column if not exists fornecedor_contestacao_foto_path text;

create index if not exists idx_financial_ledger_em_devolucao_prazo
  on public.financial_ledger (em_devolucao_desde)
  where status = 'EM_DEVOLUCAO';

-- 1) Fornecedor confirma recebimento "tudo certo" — libera o valor pro seller na hora.
-- Atômica via `for update` (lock de linha dentro da transação da própria função), substitui
-- o padrão insert-depois-rollback em nível de app usado no PATCH do admin.
create or replace function public.fn_devolucao_fornecedor_confirmar(
  p_ledger_id uuid,
  p_fornecedor_id uuid
)
returns table(ok boolean, motivo text, devolucao_ledger_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row record;
  v_dev_id uuid;
begin
  select id, org_id, status, fornecedor_id, seller_id, pedido_id,
         valor_fornecedor, valor_dropcore, valor_total, ciclo_repasse
    into v_row
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.', null::uuid;
    return;
  end if;
  if v_row.fornecedor_id is distinct from p_fornecedor_id then
    return query select false, 'Esse registro não pertence à sua conta.', null::uuid;
    return;
  end if;
  if v_row.status <> 'EM_DEVOLUCAO' then
    return query select false, 'Esse registro não está aguardando confirmação.', null::uuid;
    return;
  end if;

  update public.financial_ledger
     set status = 'DEVOLVIDO', fornecedor_confirmou_recebimento_em = now()
   where id = p_ledger_id;

  insert into public.financial_ledger (
    org_id, seller_id, fornecedor_id, pedido_id, tipo,
    valor_fornecedor, valor_dropcore, valor_total, status, ciclo_repasse, referencia
  ) values (
    v_row.org_id, v_row.seller_id, v_row.fornecedor_id, v_row.pedido_id, 'DEVOLUCAO',
    v_row.valor_fornecedor, v_row.valor_dropcore, v_row.valor_total, 'DEVOLVIDO', v_row.ciclo_repasse,
    'devolucao confirmada pelo fornecedor do ledger ' || p_ledger_id
  )
  returning id into v_dev_id;

  return query select true, null::text, v_dev_id;
end;
$function$;

-- 2) Fornecedor contesta (defeito/produto errado) — trava a liberação automática, não muda
-- status, cai pro admin decidir manual (fluxo já existente em /admin/devolucoes).
create or replace function public.fn_devolucao_fornecedor_contestar(
  p_ledger_id uuid,
  p_fornecedor_id uuid,
  p_texto text,
  p_foto_path text
)
returns table(ok boolean, motivo text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_status text;
  v_fornecedor_id uuid;
begin
  select status, fornecedor_id into v_status, v_fornecedor_id
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.';
    return;
  end if;
  if v_fornecedor_id is distinct from p_fornecedor_id then
    return query select false, 'Esse registro não pertence à sua conta.';
    return;
  end if;
  if v_status <> 'EM_DEVOLUCAO' then
    return query select false, 'Esse registro não está aguardando confirmação.';
    return;
  end if;

  update public.financial_ledger
     set fornecedor_contestou_em = now(),
         fornecedor_contestacao_texto = p_texto,
         fornecedor_contestacao_foto_path = p_foto_path
   where id = p_ledger_id;

  return query select true, null::text;
end;
$function$;

-- 3) Liberação automática (cron) — só chamada pra registros já filtrados pelo cron
-- (status EM_DEVOLUCAO, prazo vencido), mas reconfere tudo de novo aqui dentro (defesa
-- extra): se o fornecedor contestou entre a seleção do cron e a execução desta função
-- (corrida real, o lock de linha serializa certo), não libera.
create or replace function public.fn_devolucao_liberar_automatico(p_ledger_id uuid)
returns table(ok boolean, motivo text, devolucao_ledger_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row record;
  v_dev_id uuid;
begin
  select id, org_id, status, fornecedor_id, seller_id, pedido_id,
         valor_fornecedor, valor_dropcore, valor_total, ciclo_repasse,
         em_devolucao_desde, fornecedor_contestou_em
    into v_row
    from public.financial_ledger
   where id = p_ledger_id
   for update;

  if not found then
    return query select false, 'Registro não encontrado.', null::uuid;
    return;
  end if;
  if v_row.status <> 'EM_DEVOLUCAO' then
    return query select false, 'Registro não está mais em devolução.', null::uuid;
    return;
  end if;
  if v_row.fornecedor_contestou_em is not null then
    return query select false, 'Fornecedor contestou — não libera automático.', null::uuid;
    return;
  end if;
  if v_row.em_devolucao_desde is null or v_row.em_devolucao_desde > now() - interval '48 hours' then
    return query select false, 'Ainda não venceu o prazo de 48h.', null::uuid;
    return;
  end if;

  update public.financial_ledger
     set status = 'DEVOLVIDO'
   where id = p_ledger_id;

  insert into public.financial_ledger (
    org_id, seller_id, fornecedor_id, pedido_id, tipo,
    valor_fornecedor, valor_dropcore, valor_total, status, ciclo_repasse, referencia
  ) values (
    v_row.org_id, v_row.seller_id, v_row.fornecedor_id, v_row.pedido_id, 'DEVOLUCAO',
    v_row.valor_fornecedor, v_row.valor_dropcore, v_row.valor_total, 'DEVOLVIDO', v_row.ciclo_repasse,
    'devolucao liberada automaticamente (48h sem resposta do fornecedor) do ledger ' || p_ledger_id
  )
  returning id into v_dev_id;

  return query select true, null::text, v_dev_id;
end;
$function$;

revoke all on function public.fn_devolucao_fornecedor_confirmar from public;
grant execute on function public.fn_devolucao_fornecedor_confirmar to service_role;

revoke all on function public.fn_devolucao_fornecedor_contestar from public;
grant execute on function public.fn_devolucao_fornecedor_contestar to service_role;

revoke all on function public.fn_devolucao_liberar_automatico from public;
grant execute on function public.fn_devolucao_liberar_automatico to service_role;

-- Lock advisory pro cron de liberação automática — espelha os locks já existentes
-- (913001..913019 já usados) -> 913020.
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

-- Checa devoluções com prazo de 48h vencido a cada hora.
select cron.schedule(
  'dropcore-devolucao-liberacao-automatica',
  '0 * * * *',
  $$select public.dropcore_cron_http_post('/api/cron/devolucao-liberacao-automatica');$$
);
