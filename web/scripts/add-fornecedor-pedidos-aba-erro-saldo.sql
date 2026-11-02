-- "Pra enviar" ainda misturava erro_saldo (seller sem saldo — nem chega a ter etiqueta,
-- problema diferente de buffer do ML) com pedido realmente pronto pra despachar. Separa
-- numa aba própria "Erro". CREATE OR REPLACE não permite mudar colunas de RETURNS TABLE —
-- dropa antes.

drop function if exists public.fn_fornecedor_pedidos_lista(uuid, uuid, text[], int, int, text, timestamptz, timestamptz, text);

create or replace function public.fn_fornecedor_pedidos_lista(
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_status text[],
  p_limit int,
  p_offset int,
  p_seller_nome text default null,
  p_desde timestamptz default null,
  p_ate timestamptz default null,
  p_buffer_ml text default null -- 'somente' | 'excluir' | null (sem filtro)
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
  ledger_id uuid,
  total_count bigint,
  total_count_geral bigint,
  total_count_pra_enviar bigint,
  total_count_buffer bigint,
  total_count_erro bigint,
  total_count_enviados bigint,
  total_count_devolucao bigint,
  total_count_entregue bigint,
  total_count_cancelado bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  with base as (
    select p.*,
      (p.status = 'enviado' and p.canal_venda = 'mercado_livre'
        and p.etiqueta_pdf_url is null and p.etiqueta_pdf_base64 is null) as em_buffer,
      count(*) over() as total_count_geral,
      count(*) filter (where p.status in ('pendente_estoque', 'bloqueado')) over() as total_count_pra_enviar,
      count(*) filter (where p.status = 'erro_saldo') over() as total_count_erro,
      count(*) filter (where p.status = 'aguardando_repasse') over() as total_count_enviados,
      count(*) filter (where p.status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor')) over() as total_count_devolucao,
      count(*) filter (where p.status = 'entregue') over() as total_count_entregue,
      count(*) filter (where p.status = 'cancelado') over() as total_count_cancelado
    from public.pedidos p
    join public.sellers s on s.id = p.seller_id
    where p.org_id = p_org_id
      and p.fornecedor_id = p_fornecedor_id
      and p.e_teste = false
      and p.status not in ('produto_nao_vinculado', 'anuncio_sem_sku')
      and (p_seller_nome is null or p_seller_nome = '' or s.nome ilike '%' || p_seller_nome || '%')
      and (p_desde is null or p.criado_em >= p_desde)
      and (p_ate is null or p.criado_em <= p_ate)
  ),
  contagens as (
    select
      count(*) filter (where status = 'enviado' and not em_buffer) as pra_enviar,
      count(*) filter (where em_buffer) as buffer
    from base
  )
  select
    b.id, b.seller_id, b.fornecedor_id, b.sku_id, b.nome_produto,
    b.preco_venda, b.valor_fornecedor, b.status,
    b.motivo_bloqueio, b.motivo_bloqueio_responsavel, b.cancelado_motivo,
    b.criado_em, b.etiqueta_pdf_url, b.etiqueta_pdf_base64,
    b.etiqueta_impressa_em, b.etiqueta_liberada_em,
    b.marketplace_numero, b.marketplace_pack_id,
    b.comprador_nome, b.comprador_cidade, b.comprador_uf, b.comprador_fone,
    b.referencia_externa, b.metodo_envio, b.tracking_codigo, b.canal_venda,
    b.e_teste, b.ledger_id,
    count(*) over()::bigint as total_count,
    b.total_count_geral,
    (b.total_count_pra_enviar + c.pra_enviar)::bigint as total_count_pra_enviar,
    c.buffer::bigint as total_count_buffer,
    b.total_count_erro,
    b.total_count_enviados, b.total_count_devolucao, b.total_count_entregue, b.total_count_cancelado
  from base b
  cross join contagens c
  where (p_status is null or b.status = any(p_status))
    and (
      p_buffer_ml is null
      or (p_buffer_ml = 'somente' and b.em_buffer)
      or (p_buffer_ml = 'excluir' and not b.em_buffer)
    )
  order by
    case when b.status = 'enviado'
      and b.etiqueta_impressa_em is null
      and (b.etiqueta_pdf_url is not null or b.etiqueta_pdf_base64 is not null)
      then b.etiqueta_liberada_em end desc nulls last,
    b.criado_em desc
  limit p_limit offset p_offset;
$function$;

revoke all on function public.fn_fornecedor_pedidos_lista from public, anon, authenticated;
grant execute on function public.fn_fornecedor_pedidos_lista to service_role;
