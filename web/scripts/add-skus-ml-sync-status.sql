-- Indicador por SKU (não só o resumo agregado em fornecedor_mercadolivre_integrations) de
-- quem não tem anúncio/SELLER_SKU correspondente no Mercado Livre do fornecedor — pra
-- aparecer direto na linha do produto em /fornecedor/produtos, não só um contador agregado
-- em Integrações (pedido do Sr Stark 2026-11-07: "isso não seria melhor mostrar em
-- produtos?"). Só 2 estados escritos: 'ok' (achou e sincronizou/confirmou) e
-- 'sem_sku_no_ml' (não achou correspondência nessa rodada) — erro de escrita (raro, falha
-- de infra) continua só no resumo agregado, não teve RPC própria criada pra isso aqui,
-- não vale a complexidade extra pra um caso raro.

alter table public.skus
  add column if not exists ml_sync_status text,
  add column if not exists ml_sync_at timestamptz;

-- Substitui a versão anterior (create-fornecedor-mercadolivre-integrations.sql): mesma
-- escrita de estoque, agora também carimba ml_sync_status/at (limpa um 'sem_sku_no_ml'
-- antigo se o SKU voltou a aparecer no ML).
create or replace function public.fn_fornecedor_sku_estoque_mercadolivre_set(
  p_sku_id uuid,
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_novo_estoque integer
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
      ml_sync_at = now()
  where id = p_sku_id and org_id = p_org_id and fornecedor_id = p_fornecedor_id
  returning * into v_row;
  return v_row;
end;
$function$;

-- Marca "sem correspondência" sem mexer em estoque_atual (não sabemos o saldo real, não
-- zera por engano).
create function public.fn_fornecedor_sku_estoque_mercadolivre_marcar_sem_correspondencia(
  p_sku_id uuid,
  p_org_id uuid,
  p_fornecedor_id uuid
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
  set ml_sync_status = 'sem_sku_no_ml',
      ml_sync_at = now()
  where id = p_sku_id and org_id = p_org_id and fornecedor_id = p_fornecedor_id
  returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.fn_fornecedor_sku_estoque_mercadolivre_marcar_sem_correspondencia from public, anon, authenticated;
grant execute on function public.fn_fornecedor_sku_estoque_mercadolivre_marcar_sem_correspondencia to service_role;
