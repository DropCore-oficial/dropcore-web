-- Dois ajustes pra feature "seller publica anúncio no ML clicando no produto do fornecedor":
--
-- 1) Reusa a guia de medidas (SIZE_GRID_ID) já criada no Mercado Livre pro mesmo grupo+seller,
--    em vez de tentar criar outra igual a cada novo lote de publicação — o ML rejeita criar uma
--    guia duplicada (mesmo domain_id/marca/gênero/medidas), causando "SIZE_GRID_ID is missing"
--    em todo o lote quando a criação falha (achado real 2026-11-16, confirmado pelo Sr Stark:
--    ao duplicar anúncio manualmente no ML, a guia existente é reusada — o ML não deixa criar
--    duas iguais).
--
-- 2) Coluna nova em `skus` pra guardar fotos extras (além da capa) por SKU, usada pela
--    publicação no ML (mínimo 3, máximo 7 fotos por cor — exigido no cadastro do fornecedor).
--
-- Regra 9 do CLAUDE.md: leitura/escrita nova sempre via RPC SECURITY DEFINER, nunca `.from()`
-- direto em código novo — route.ts chama supabaseAdmin.rpc(...).

alter table public.seller_produtos_ml_publicados
  add column if not exists ml_chart_id text,
  add column if not exists ml_chart_row_id text;

-- Assinatura antiga (8 args) sai de cena — route.ts passa a chamar sempre com os 10 args.
drop function if exists public.fn_seller_produto_ml_publicar_registrar(uuid, uuid, uuid, text, text, text, text, numeric);

create or replace function public.fn_seller_produto_ml_publicar_registrar(
  p_org_id uuid,
  p_seller_id uuid,
  p_fornecedor_id uuid,
  p_sku text,
  p_grupo_key text,
  p_ml_item_id text,
  p_ml_permalink text,
  p_preco numeric,
  p_ml_chart_id text default null,
  p_ml_chart_row_id text default null
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.seller_produtos_ml_publicados
    (org_id, seller_id, fornecedor_id, sku, grupo_key, ml_item_id, ml_permalink, preco, ml_chart_id, ml_chart_row_id)
  values
    (p_org_id, p_seller_id, p_fornecedor_id, p_sku, p_grupo_key, p_ml_item_id, p_ml_permalink, p_preco, p_ml_chart_id, p_ml_chart_row_id)
  returning seller_produtos_ml_publicados.id;
end;
$$;

revoke all on function public.fn_seller_produto_ml_publicar_registrar(uuid, uuid, uuid, text, text, text, text, numeric, text, text) from public;
grant execute on function public.fn_seller_produto_ml_publicar_registrar(uuid, uuid, uuid, text, text, text, text, numeric, text, text) to service_role;

-- RPC de leitura nova: chart/row já usados por esse seller+grupo, pra reusar sem recriar.
-- Índice já existe (idx_seller_produtos_ml_publicados_seller_grupo, seller_id+grupo_key),
-- cobre essa consulta.
create or replace function public.fn_seller_produto_ml_guia_medidas_grupo_get(
  p_seller_id uuid,
  p_grupo_key text
)
returns table (sku text, ml_chart_id text, ml_chart_row_id text)
language sql
security definer
set search_path = public
stable
as $$
  select p.sku, p.ml_chart_id, p.ml_chart_row_id
  from public.seller_produtos_ml_publicados p
  where p.seller_id = p_seller_id
    and p.grupo_key = p_grupo_key
    and p.ml_chart_id is not null;
$$;

revoke all on function public.fn_seller_produto_ml_guia_medidas_grupo_get(uuid, text) from public;
grant execute on function public.fn_seller_produto_ml_guia_medidas_grupo_get(uuid, text) to service_role;

-- Fotos extras por SKU (além da capa em skus.imagem_url) — mínimo 3, máximo 7 no total,
-- validado no cadastro do fornecedor (criar-variantes), não aqui no banco.
alter table public.skus
  add column if not exists imagens_extra text[];
