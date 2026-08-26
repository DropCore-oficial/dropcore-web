-- Vínculo automático SKU (DropCore) <-> anúncio do Mercado Livre. Populado por um job de
-- sync (lê o atributo "SELLER_SKU" de cada anúncio ativo do seller via API do ML, casa com
-- skus.sku), não por ação do seller. Cobertura real testada: 92 de 100 anúncios amostrados
-- já tinham SELLER_SKU preenchido — não precisou de tela de vínculo manual como caminho
-- principal. Guarda ml_variation_id mesmo sem uso ainda, pra não reescanear se um dia
-- precisarmos agir por variação específica, não só por anúncio inteiro.
-- Ver docs/SCHEMA.md e memória de projeto "Briefing Gestores de IA".

create table public.seller_mercadolivre_sku_map (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  sku text not null,
  ml_item_id text not null,
  ml_variation_id bigint,
  atualizado_em timestamptz not null default now(),
  unique (seller_id, sku)
);

create index idx_seller_ml_sku_map_seller
  on public.seller_mercadolivre_sku_map (seller_id);

alter table public.seller_mercadolivre_sku_map enable row level security;
-- Deny-all: só supabaseAdmin escreve (job de sync) e lê (gestores) — nenhuma tela do
-- seller expõe isso diretamente ainda, não precisa de RPC de leitura por enquanto.
revoke all on public.seller_mercadolivre_sku_map from public, anon, authenticated;
