-- Devolução: contestação do fornecedor aceita várias evidências (foto + vídeo), não só 1 foto.
-- Coluna antiga `fornecedor_contestacao_foto_path` não tinha nenhum registro usando ainda
-- (conferido antes de rodar) — troca direta por array, sem backfill necessário.

alter table public.financial_ledger
  add column if not exists fornecedor_contestacao_evidencias_paths text[];

alter table public.financial_ledger
  drop column if exists fornecedor_contestacao_foto_path;

drop function if exists public.fn_devolucao_fornecedor_contestar(uuid, uuid, text, text);

create function public.fn_devolucao_fornecedor_contestar(
  p_ledger_id uuid,
  p_fornecedor_id uuid,
  p_texto text,
  p_evidencias_paths text[]
)
returns table(ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'public'
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
  if v_fornecedor_id is distinct from p_fornecedor_id
     and not exists (
       select 1 from public.seller_ml_devolucoes_detectadas d
       where d.ledger_id = p_ledger_id and d.fornecedor_id = p_fornecedor_id
     )
  then
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
         fornecedor_contestacao_evidencias_paths = p_evidencias_paths
   where id = p_ledger_id;

  return query select true, null::text;
end;
$function$;

revoke all on function public.fn_devolucao_fornecedor_contestar from public;
grant execute on function public.fn_devolucao_fornecedor_contestar to service_role;
