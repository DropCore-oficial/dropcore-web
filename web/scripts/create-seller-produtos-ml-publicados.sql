-- Tabela + RPC pra feature "seller publica anúncio no ML clicando no produto do fornecedor".
-- Registra o vínculo produto DropCore <-> anúncio criado no Mercado Livre, pra: (1) evitar
-- publicar o mesmo SKU 2x, (2) mostrar "já publicado, ver anúncio" depois.
-- Regra 9 do CLAUDE.md: tabela/rota nova sempre via RPC SECURITY DEFINER, nunca .from()
-- direto — a leitura/escrita final no banco em app/api/seller/mercadolivre/publicar-anuncio
-- chama supabaseAdmin.rpc(...), a chamada ao Mercado Livre em si (fetch externo) continua
-- em TypeScript.

create table if not exists public.seller_produtos_ml_publicados (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  seller_id uuid not null references public.sellers(id),
  fornecedor_id uuid not null references public.fornecedores(id),
  sku text not null,
  grupo_key text not null,
  ml_item_id text not null,
  ml_permalink text,
  preco numeric(10,2) not null,
  publicado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (seller_id, sku)
);

create index if not exists idx_seller_produtos_ml_publicados_org_id
  on public.seller_produtos_ml_publicados (org_id);
create index if not exists idx_seller_produtos_ml_publicados_fornecedor_id
  on public.seller_produtos_ml_publicados (fornecedor_id);
create index if not exists idx_seller_produtos_ml_publicados_seller_grupo
  on public.seller_produtos_ml_publicados (seller_id, grupo_key);

alter table public.seller_produtos_ml_publicados enable row level security;

create policy seller_produtos_ml_publicados_select on public.seller_produtos_ml_publicados
  for select
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = seller_produtos_ml_publicados.org_id
        and om.user_id = (select auth.uid())
    )
  );

-- RPC de escrita — chamada só depois do POST /items no Mercado Livre já ter tido sucesso.
create or replace function public.fn_seller_produto_ml_publicar_registrar(
  p_org_id uuid,
  p_seller_id uuid,
  p_fornecedor_id uuid,
  p_sku text,
  p_grupo_key text,
  p_ml_item_id text,
  p_ml_permalink text,
  p_preco numeric
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.seller_produtos_ml_publicados
    (org_id, seller_id, fornecedor_id, sku, grupo_key, ml_item_id, ml_permalink, preco)
  values
    (p_org_id, p_seller_id, p_fornecedor_id, p_sku, p_grupo_key, p_ml_item_id, p_ml_permalink, p_preco)
  returning seller_produtos_ml_publicados.id;
end;
$$;

revoke all on function public.fn_seller_produto_ml_publicar_registrar(uuid, uuid, uuid, text, text, text, text, numeric) from public;
grant execute on function public.fn_seller_produto_ml_publicar_registrar(uuid, uuid, uuid, text, text, text, text, numeric) to service_role;

-- RPC de leitura — checa se o seller já publicou esse SKU, antes de tentar de novo.
create or replace function public.fn_seller_produto_ml_publicado_get(
  p_seller_id uuid,
  p_sku text
)
returns table (ml_item_id text, ml_permalink text, publicado_em timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select p.ml_item_id, p.ml_permalink, p.publicado_em
  from public.seller_produtos_ml_publicados p
  where p.seller_id = p_seller_id and p.sku = p_sku
  limit 1;
$$;

revoke all on function public.fn_seller_produto_ml_publicado_get(uuid, text) from public;
grant execute on function public.fn_seller_produto_ml_publicado_get(uuid, text) to service_role;
