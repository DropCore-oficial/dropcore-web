-- Consolida a tela de Pedidos do fornecedor em abas (Todos/Pra enviar/Enviados/Devolução/
-- Concluídos/Cancelados) numa página só — sem precisar de /fornecedor/devolucoes separada.
-- `p_status` passa a aceitar vários status de uma vez (array) em vez de 1 só, e a RPC devolve
-- a contagem de cada grupo de uma vez (1 RPC por tela, regra 4 do CLAUDE.md), além de
-- `ledger_id` (pra casar o pedido com a devolução pendente de confirmação do fornecedor).
-- CREATE OR REPLACE não permite mudar parâmetro nem colunas de RETURNS TABLE — dropa antes.

drop function if exists public.fn_fornecedor_pedidos_lista(uuid, uuid, text, int, int);

create or replace function public.fn_fornecedor_pedidos_lista(
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_status text[],
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
  ledger_id uuid,
  total_count bigint,
  total_count_geral bigint,
  total_count_pra_enviar bigint,
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
      count(*) over() as total_count_geral,
      count(*) filter (where p.status in ('pendente_estoque', 'bloqueado', 'enviado', 'erro_saldo')) over() as total_count_pra_enviar,
      count(*) filter (where p.status = 'aguardando_repasse') over() as total_count_enviados,
      count(*) filter (where p.status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor')) over() as total_count_devolucao,
      count(*) filter (where p.status = 'entregue') over() as total_count_entregue,
      count(*) filter (where p.status = 'cancelado') over() as total_count_cancelado
    from public.pedidos p
    where p.org_id = p_org_id
      and p.fornecedor_id = p_fornecedor_id
      and p.e_teste = false
      and p.status not in ('produto_nao_vinculado', 'anuncio_sem_sku')
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
    b.total_count_geral, b.total_count_pra_enviar, b.total_count_enviados,
    b.total_count_devolucao, b.total_count_entregue, b.total_count_cancelado
  from base b
  where (p_status is null or b.status = any(p_status))
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
