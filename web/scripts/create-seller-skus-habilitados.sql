-- SKUs que o seller Starter escolheu para poder vender (anti-fraude na API ERP e pedidos manuais).
-- Seller Pro: a tabela pode existir mas a app não exige linhas para vender.

create table if not exists public.seller_skus_habilitados (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete cascade,
  sku_id uuid not null references public.skus (id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (seller_id, sku_id)
);

create index if not exists idx_seller_skus_habilitados_seller_id
  on public.seller_skus_habilitados (seller_id);

create index if not exists idx_seller_skus_habilitados_sku_id
  on public.seller_skus_habilitados (sku_id);
