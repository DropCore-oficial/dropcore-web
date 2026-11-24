-- Achado 2026-11-24: fn_seller_produto_ml_publicar_registrar (que grava ml_chart_id/
-- ml_chart_row_id) só é chamada DEPOIS de um item publicar com sucesso — se a guia de
-- medidas é criada com sucesso no ML mas TODAS as variantes falham depois por outro motivo
-- (ex: bug de family_name/title achado agora, ou qualquer erro futuro não relacionado), a
-- guia já criada no ML nunca é salva em seller_produtos_ml_publicados (que exige
-- ml_item_id NOT NULL — não dá pra guardar só a guia ali). Próxima tentativa não encontra
-- a guia já existente, tenta criar outra com o MESMO nome determinístico, e o ML recusa
-- ("is already in use in another chart") — reproduzido ao vivo com a Ravelle, mesmo depois
-- do nome já incluir o seller_id (fix anterior).
--
-- Corrige com uma tabela de cache dedicada, gravada IMEDIATAMENTE após mlCriarGuiaMedidas
-- suceder, independente do resto da publicação dar certo depois.

create table if not exists public.seller_produto_ml_guia_medidas_cache (
  seller_id uuid not null references public.sellers(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  grupo_key text not null,
  ml_chart_id text not null,
  rows_por_tamanho jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (seller_id, grupo_key)
);

alter table public.seller_produto_ml_guia_medidas_cache enable row level security;

create policy "seller_produto_ml_guia_medidas_cache_select"
  on public.seller_produto_ml_guia_medidas_cache
  for select
  using (public.fn_user_can_access_seller(org_id, seller_id));

create or replace function public.fn_seller_produto_ml_guia_medidas_cache_upsert(
  p_seller_id uuid,
  p_org_id uuid,
  p_grupo_key text,
  p_ml_chart_id text,
  p_rows_por_tamanho jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.seller_produto_ml_guia_medidas_cache
    (seller_id, org_id, grupo_key, ml_chart_id, rows_por_tamanho, atualizado_em)
  values
    (p_seller_id, p_org_id, p_grupo_key, p_ml_chart_id, p_rows_por_tamanho, now())
  on conflict (seller_id, grupo_key) do update set
    ml_chart_id = excluded.ml_chart_id,
    rows_por_tamanho = excluded.rows_por_tamanho,
    atualizado_em = now();
$$;

create or replace function public.fn_seller_produto_ml_guia_medidas_cache_get(
  p_seller_id uuid,
  p_grupo_key text
)
returns table(ml_chart_id text, rows_por_tamanho jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select c.ml_chart_id, c.rows_por_tamanho
  from public.seller_produto_ml_guia_medidas_cache c
  where c.seller_id = p_seller_id
    and c.grupo_key = p_grupo_key;
$$;

revoke all on function public.fn_seller_produto_ml_guia_medidas_cache_upsert from public;
revoke all on function public.fn_seller_produto_ml_guia_medidas_cache_get from public;
grant execute on function public.fn_seller_produto_ml_guia_medidas_cache_upsert to service_role;
grant execute on function public.fn_seller_produto_ml_guia_medidas_cache_get to service_role;
-- Sem índice extra: a PK (seller_id, grupo_key) já cobre a única busca que
-- fn_seller_produto_ml_guia_medidas_cache_get faz (Index Scan, não Seq Scan).
