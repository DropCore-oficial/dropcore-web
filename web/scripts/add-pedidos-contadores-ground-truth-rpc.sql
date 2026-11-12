-- Ground truth independente das contagens de pedido por aba — usado só pela checagem de
-- consistência periódica (ver pedidosContadoresConsistencia.ts), nunca pelas telas de
-- verdade (essas continuam em fn_seller_pedidos_lista/fn_fornecedor_pedidos_lista).
--
-- Escrito separado de propósito (não reaproveita CTE nenhuma das funções de produção): o
-- objetivo é detectar se aquelas funções divergem da realidade no futuro (ex.: alguém
-- reintroduz um `DISTINCT ON` por engano, ou esquece de incluir uma categoria nova numa das
-- duas). Se esse código reaproveitasse a mesma lógica das funções de produção, um bug nelas
-- apareceria igual aqui e a checagem nunca acusaria nada — tem que ser uma conta
-- independente pra servir de rede de segurança de verdade. Hoje só cobre a categoria
-- "devolução" (achado real 2026-11-11), a mais crítica financeiramente — pode virar mais
-- categorias depois se fizer sentido.

create or replace function public.fn_seller_pedidos_contadores_ground_truth()
returns table (
  seller_id uuid,
  devolucao bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  with base as (
    select seller_id, coalesce(marketplace_pack_id, id::text) as pack_key, status
    from public.pedidos
    where seller_id is not null
  ),
  pacote_status as (
    select seller_id, pack_key,
      bool_or(status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor')) as tem_devolucao
    from base
    group by seller_id, pack_key
  )
  select seller_id, count(*) filter (where tem_devolucao) as devolucao
  from pacote_status
  group by seller_id;
$function$;

revoke all on function public.fn_seller_pedidos_contadores_ground_truth from public, anon, authenticated;
grant execute on function public.fn_seller_pedidos_contadores_ground_truth to service_role;

create or replace function public.fn_fornecedor_pedidos_contadores_ground_truth()
returns table (
  fornecedor_id uuid,
  devolucao bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  with base as (
    select fornecedor_id, coalesce(marketplace_pack_id, id::text) as pack_key, status
    from public.pedidos
    where fornecedor_id is not null
      and e_teste = false
      and status not in ('produto_nao_vinculado', 'anuncio_sem_sku')
  ),
  pacote_status as (
    select fornecedor_id, pack_key,
      bool_or(status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor')) as tem_devolucao
    from base
    group by fornecedor_id, pack_key
  )
  select fornecedor_id, count(*) filter (where tem_devolucao) as devolucao
  from pacote_status
  group by fornecedor_id;
$function$;

revoke all on function public.fn_fornecedor_pedidos_contadores_ground_truth from public, anon, authenticated;
grant execute on function public.fn_fornecedor_pedidos_contadores_ground_truth to service_role;
