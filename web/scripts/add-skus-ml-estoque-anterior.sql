-- Guarda o valor anterior do estoque só enquanto a mudança for "recente" (limpa sozinho no
-- ciclo seguinte se o estoque ficar estável de novo) — pro hover em /fornecedor/produtos
-- mostrar "Atualizado de 11 para 10" em vez de só a data, sem ficar mostrando uma transição
-- velha pra sempre (pedido do Sr Stark 2026-11-07).

alter table public.skus
  add column if not exists ml_estoque_anterior integer;

drop function if exists public.fn_fornecedor_sku_estoque_mercadolivre_set(uuid, uuid, uuid, integer);

create function public.fn_fornecedor_sku_estoque_mercadolivre_set(
  p_sku_id uuid,
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_novo_estoque integer,
  p_estoque_anterior integer default null
)
returns public.skus
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.skus;
begin
  update public.skus
  set estoque_atual = p_novo_estoque,
      ml_sync_status = 'ok',
      ml_sync_at = now(),
      ml_estoque_anterior = p_estoque_anterior
  where id = p_sku_id and org_id = p_org_id and fornecedor_id = p_fornecedor_id
  returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.fn_fornecedor_sku_estoque_mercadolivre_set(uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_fornecedor_sku_estoque_mercadolivre_set(uuid, uuid, uuid, integer, integer) to service_role;
