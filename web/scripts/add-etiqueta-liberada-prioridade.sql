-- Prioriza, na lista de pedidos do fornecedor e do seller, quem tem etiqueta recém-liberada
-- e ainda não impressa — hoje a lista só ordena por criado_em, então um pedido que ficou
-- dias em buffer (ML) e acabou de liberar fica perdido no meio da lista, ninguém percebe que
-- já pode ser despachado (2026-10-15, pedido real do fornecedor Vinz Collection).
--
-- Regra 9 do CLAUDE.md: a ordenação por CASE WHEN não dá pra fazer só com `.order()` do
-- PostgREST (não aceita expressão computada) — por isso virou RPC em vez de só adicionar
-- `.eq()`/`.order()` na rota existente.

alter table public.pedidos
  add column if not exists etiqueta_liberada_em timestamptz;

create index if not exists idx_pedidos_etiqueta_liberada_em
  on public.pedidos (etiqueta_liberada_em)
  where etiqueta_liberada_em is not null;

-- Lista de pedidos do fornecedor, mesmos filtros de sempre (org/fornecedor/sem teste/sem
-- produto não vinculado), só a ordenação muda: quem tem etiqueta pronta e ainda não impressa
-- sobe pro topo (mais recém-liberada primeiro); o resto continua por criado_em desc.
create or replace function public.fn_fornecedor_pedidos_lista(
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_status text,
  p_limit int,
  p_offset int
)
returns table (
  id uuid,
  seller_id uuid,
  fornecedor_id uuid,
  sku_id uuid,
  nome_produto text,
  preco_venda numeric,
  valor_fornecedor numeric,
  status text,
  motivo_bloqueio text,
  motivo_bloqueio_responsavel text,
  cancelado_motivo text,
  criado_em timestamptz,
  etiqueta_pdf_url text,
  etiqueta_pdf_base64 text,
  etiqueta_impressa_em timestamptz,
  etiqueta_liberada_em timestamptz,
  marketplace_numero text,
  marketplace_pack_id text,
  comprador_nome text,
  comprador_cidade text,
  comprador_uf text,
  comprador_fone text,
  referencia_externa text,
  metodo_envio text,
  tracking_codigo text,
  canal_venda text,
  e_teste boolean,
  total_count bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    p.id, p.seller_id, p.fornecedor_id, p.sku_id, p.nome_produto,
    p.preco_venda, p.valor_fornecedor, p.status,
    p.motivo_bloqueio, p.motivo_bloqueio_responsavel, p.cancelado_motivo,
    p.criado_em, p.etiqueta_pdf_url, p.etiqueta_pdf_base64,
    p.etiqueta_impressa_em, p.etiqueta_liberada_em,
    p.marketplace_numero, p.marketplace_pack_id,
    p.comprador_nome, p.comprador_cidade, p.comprador_uf, p.comprador_fone,
    p.referencia_externa, p.metodo_envio, p.tracking_codigo, p.canal_venda,
    p.e_teste,
    count(*) over()::bigint as total_count
  from public.pedidos p
  where p.org_id = p_org_id
    and p.fornecedor_id = p_fornecedor_id
    and p.e_teste = false
    and p.status not in ('produto_nao_vinculado', 'anuncio_sem_sku')
    and (p_status is null or p.status = p_status)
  order by
    case when p.status = 'enviado'
      and p.etiqueta_impressa_em is null
      and (p.etiqueta_pdf_url is not null or p.etiqueta_pdf_base64 is not null)
      then p.etiqueta_liberada_em end desc nulls last,
    p.criado_em desc
  limit p_limit offset p_offset;
$function$;

-- Lista de pedidos do seller — mesmos filtros/status de sempre, incluindo o filtro
-- sintético "etiqueta_buffer_ml" (status enviado + canal ML + sem etiqueta ainda), e a mesma
-- regra de prioridade acima.
create or replace function public.fn_seller_pedidos_lista(
  p_org_id uuid,
  p_seller_id uuid,
  p_status text,
  p_limit int,
  p_offset int
)
returns table (
  id uuid,
  nome_produto text,
  valor_total numeric,
  preco_venda numeric,
  status text,
  motivo_bloqueio text,
  motivo_bloqueio_responsavel text,
  cancelado_motivo text,
  criado_em timestamptz,
  referencia_externa text,
  tracking_codigo text,
  metodo_envio text,
  marketplace_numero text,
  marketplace_pack_id text,
  comprador_nome text,
  comprador_cidade text,
  comprador_uf text,
  comprador_fone text,
  canal_venda text,
  etiqueta_pdf_url text,
  etiqueta_pdf_base64 text,
  etiqueta_tentativas int,
  etiqueta_impressa_em timestamptz,
  etiqueta_liberada_em timestamptz,
  total_count bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    p.id, p.nome_produto, p.valor_total, p.preco_venda, p.status,
    p.motivo_bloqueio, p.motivo_bloqueio_responsavel, p.cancelado_motivo,
    p.criado_em, p.referencia_externa, p.tracking_codigo, p.metodo_envio,
    p.marketplace_numero, p.marketplace_pack_id,
    p.comprador_nome, p.comprador_cidade, p.comprador_uf, p.comprador_fone,
    p.canal_venda, p.etiqueta_pdf_url, p.etiqueta_pdf_base64, p.etiqueta_tentativas,
    p.etiqueta_impressa_em, p.etiqueta_liberada_em,
    count(*) over()::bigint as total_count
  from public.pedidos p
  where p.org_id = p_org_id
    and p.seller_id = p_seller_id
    and (
      case
        when p_status = 'etiqueta_buffer_ml' then
          p.status = 'enviado' and p.canal_venda = 'mercado_livre'
          and p.etiqueta_pdf_url is null and p.etiqueta_pdf_base64 is null
        when p_status is not null then p.status = p_status
        else true
      end
    )
  order by
    case when p.status = 'enviado'
      and p.etiqueta_impressa_em is null
      and (p.etiqueta_pdf_url is not null or p.etiqueta_pdf_base64 is not null)
      then p.etiqueta_liberada_em end desc nulls last,
    p.criado_em desc
  limit p_limit offset p_offset;
$function$;

revoke all on function public.fn_fornecedor_pedidos_lista from public;
grant execute on function public.fn_fornecedor_pedidos_lista to service_role;

revoke all on function public.fn_seller_pedidos_lista from public;
grant execute on function public.fn_seller_pedidos_lista to service_role;
