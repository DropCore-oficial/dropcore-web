-- Vínculo SKU (DropCore) <-> anúncio do Mercado Livre do FORNECEDOR. Até aqui, o pull
-- (fornecedorMercadoLivreSyncEstoque.ts) lia item_id + SELLER_SKU de cada anúncio só pra
-- calcular o saldo e descartava o item_id no final — não tinha como empurrar baixa
-- pontual pro ML do fornecedor quando o seller vende (sem isso, overselling real: fornecedor
-- que também vende o mesmo SKU direto no próprio anúncio ML não via a baixa até o próximo
-- pull de até 5min). Esta tabela guarda esse vínculo pra permitir o push.
--
-- Mesma forma de seller_mercadolivre_sku_map (ver fix-seller-mercadolivre-sku-map-permite-sku-repetido.sql):
-- cada ANÚNCIO (item_id + variação) só tem 1 sku, mas o mesmo sku pode aparecer em vários
-- anúncios (produto republicado) — por isso unique é (fornecedor_id, ml_item_id,
-- ml_variation_id), não (fornecedor_id, sku).
--
-- Populada por replace completo a cada rodada do pull (todo anúncio é re-escaneado de
-- qualquer forma pra calcular o saldo) — não por upsert incremental, pra não acumular
-- item_id de anúncio que o fornecedor despublicou.

create table public.fornecedor_mercadolivre_sku_map (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  sku text not null,
  ml_item_id text not null,
  ml_variation_id bigint not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (fornecedor_id, ml_item_id, ml_variation_id)
);

create index idx_fornecedor_ml_sku_map_fornecedor_sku
  on public.fornecedor_mercadolivre_sku_map (fornecedor_id, sku);

alter table public.fornecedor_mercadolivre_sku_map enable row level security;
-- Deny-all: só supabaseAdmin escreve (pull) e lê (push) — nenhuma tela expõe isso direto.
revoke all on public.fornecedor_mercadolivre_sku_map from public, anon, authenticated;

-- Substitui todo o mapa de um fornecedor numa rodada só (chamada pelo pull, que já
-- re-escaneia 100% dos anúncios ativos/pausados a cada ciclo).
create function public.fn_fornecedor_mercadolivre_sku_map_replace_all(
  p_fornecedor_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.fornecedor_mercadolivre_sku_map where fornecedor_id = p_fornecedor_id;

  insert into public.fornecedor_mercadolivre_sku_map (fornecedor_id, sku, ml_item_id, ml_variation_id, atualizado_em)
  select p_fornecedor_id, r.sku, r.ml_item_id, coalesce(r.ml_variation_id, 0), now()
  from jsonb_to_recordset(p_rows) as r(sku text, ml_item_id text, ml_variation_id bigint);
end;
$function$;

-- Leitura pro push: todos os anúncios que representam os SKUs informados.
create function public.fn_fornecedor_mercadolivre_sku_map_get(
  p_fornecedor_id uuid,
  p_skus text[]
)
returns setof public.fornecedor_mercadolivre_sku_map
language sql
security definer
set search_path to 'public'
as $function$
  select * from public.fornecedor_mercadolivre_sku_map
  where fornecedor_id = p_fornecedor_id and sku = any(p_skus);
$function$;

revoke all on function public.fn_fornecedor_mercadolivre_sku_map_replace_all from public, anon, authenticated;
revoke all on function public.fn_fornecedor_mercadolivre_sku_map_get from public, anon, authenticated;

grant execute on function public.fn_fornecedor_mercadolivre_sku_map_replace_all to service_role;
grant execute on function public.fn_fornecedor_mercadolivre_sku_map_get to service_role;
