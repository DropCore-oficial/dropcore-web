-- Centro de Distribuição (CD) DropCore: fn_fornecedor_pedidos_lista hoje filtra e devolve
-- valor_fornecedor pelo nível de `pedidos` (coluna representativa do 1º item) — com pedido
-- misturando itens de fornecedores diferentes do CD, isso faria o fornecedor "não
-- representativo" nem aparecer na lista, e o representativo veria o valor_fornecedor do
-- pedido inteiro (de todos), não só o seu. Corrige pra granularidade de pedido_itens, com
-- fallback pro valor de pedidos quando não há pedido_itens (legado/sem split, comportamento
-- idêntico ao de hoje). Execute no SQL Editor do Supabase (ou via MCP).

CREATE OR REPLACE FUNCTION public.fn_fornecedor_pedidos_lista(
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_status text[],
  p_limit integer,
  p_offset integer,
  p_seller_nome text DEFAULT NULL::text,
  p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_ate timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_buffer_ml text DEFAULT NULL::text,
  p_etiqueta_impressa text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, seller_id uuid, fornecedor_id uuid, sku_id uuid, nome_produto text, preco_venda numeric, valor_fornecedor numeric, status text, motivo_bloqueio text, motivo_bloqueio_responsavel text, cancelado_motivo text, criado_em timestamp with time zone, etiqueta_pdf_url text, etiqueta_pdf_base64 text, etiqueta_impressa_em timestamp with time zone, etiqueta_liberada_em timestamp with time zone, marketplace_numero text, marketplace_pack_id text, comprador_nome text, comprador_cidade text, comprador_uf text, comprador_fone text, referencia_externa text, metodo_envio text, tracking_codigo text, canal_venda text, e_teste boolean, ledger_id uuid, pedido_origem_troca_id uuid, pedido_reposicao_id uuid, total_count bigint, total_count_geral bigint, total_count_pra_enviar bigint, total_count_sem_estoque bigint, total_count_buffer bigint, total_count_retirada bigint, total_count_erro bigint, total_count_enviados bigint, total_count_devolucao bigint, total_count_entregue bigint, total_count_cancelado bigint, total_count_bloqueado bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with base as (
    select p.*,
      coalesce(p.marketplace_pack_id, p.id::text) as pack_key,
      (p.status = 'enviado' and p.canal_venda = 'mercado_livre'
        and p.etiqueta_pdf_url is null and p.etiqueta_pdf_base64 is null) as em_buffer,
      (p.etiqueta_impressa_em is not null) as etiqueta_ja_impressa,
      -- Granularidade de item: soma só os itens deste fornecedor nesse pedido. Sem
      -- pedido_itens pro pedido (legado), cai no valor de pedidos — idêntico ao de hoje.
      coalesce(pi_sum.valor_fornecedor_item, p.valor_fornecedor) as valor_fornecedor_item
    from public.pedidos p
    join public.sellers s on s.id = p.seller_id
    left join lateral (
      select sum(pit.valor_fornecedor) as valor_fornecedor_item
      from public.pedido_itens pit
      where pit.pedido_id = p.id and pit.fornecedor_id = p_fornecedor_id
    ) pi_sum on true
    where p.org_id = p_org_id
      and (
        p.fornecedor_id = p_fornecedor_id
        or exists (
          select 1 from public.pedido_itens pit2
          where pit2.pedido_id = p.id and pit2.fornecedor_id = p_fornecedor_id
        )
      )
      and p.e_teste = false
      and p.status not in ('produto_nao_vinculado', 'anuncio_sem_sku')
      and (p_seller_nome is null or p_seller_nome = '' or s.nome ilike '%' || p_seller_nome || '%')
      and (p_desde is null or p.criado_em >= p_desde)
      and (p_ate is null or p.criado_em <= p_ate)
  ),
  pacote_status as (
    select
      pack_key,
      bool_or(status = 'bloqueado') as tem_bloqueado,
      bool_or(status = 'enviado' and not em_buffer and not etiqueta_ja_impressa) as tem_enviado_pendente,
      bool_or(status = 'pendente_estoque') as tem_sem_estoque,
      bool_or(em_buffer) as tem_buffer,
      bool_or(status = 'enviado' and etiqueta_ja_impressa) as tem_retirada,
      bool_or(status = 'erro_saldo') as tem_erro,
      bool_or(status = 'aguardando_repasse') as tem_enviados,
      bool_or(status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor', 'devolucao_nao_procede', 'troca_em_andamento', 'troca_concluida')) as tem_devolucao,
      bool_or(status = 'entregue') as tem_entregue,
      bool_or(status = 'cancelado') as tem_cancelado
    from base
    group by pack_key
  ),
  contagens as (
    select
      count(*) as geral,
      count(*) filter (where tem_bloqueado) as bloqueado,
      count(*) filter (where tem_enviado_pendente) as pra_enviar_enviado,
      count(*) filter (where tem_sem_estoque) as sem_estoque,
      count(*) filter (where tem_buffer) as buffer,
      count(*) filter (where tem_retirada) as retirada,
      count(*) filter (where tem_erro) as erro,
      count(*) filter (where tem_enviados) as enviados,
      count(*) filter (where tem_devolucao) as devolucao,
      count(*) filter (where tem_entregue) as entregue,
      count(*) filter (where tem_cancelado) as cancelado
    from pacote_status
  ),
  filtrado as (
    select b.*
    from base b
    where (p_status is null or b.status = any(p_status))
      and (
        p_buffer_ml is null
        or (p_buffer_ml = 'somente' and b.em_buffer)
        or (p_buffer_ml = 'excluir' and not b.em_buffer)
      )
      and (
        p_etiqueta_impressa is null
        or (p_etiqueta_impressa = 'somente' and b.etiqueta_ja_impressa)
        or (p_etiqueta_impressa = 'excluir' and not b.etiqueta_ja_impressa)
      )
  ),
  filtrado_total as (
    select count(*) as total from filtrado
  ),
  paginado as (
    select *
    from filtrado
    order by criado_em desc
    limit p_limit offset p_offset
  )
  select
    pg.id, pg.seller_id, p_fornecedor_id as fornecedor_id, pg.sku_id, pg.nome_produto,
    pg.preco_venda, pg.valor_fornecedor_item as valor_fornecedor, pg.status,
    pg.motivo_bloqueio, pg.motivo_bloqueio_responsavel, pg.cancelado_motivo,
    pg.criado_em, pg.etiqueta_pdf_url, pg.etiqueta_pdf_base64,
    pg.etiqueta_impressa_em, pg.etiqueta_liberada_em,
    pg.marketplace_numero, pg.marketplace_pack_id,
    pg.comprador_nome, pg.comprador_cidade, pg.comprador_uf, pg.comprador_fone,
    pg.referencia_externa, pg.metodo_envio, pg.tracking_codigo, pg.canal_venda,
    pg.e_teste, pg.ledger_id, pg.pedido_origem_troca_id, pg.pedido_reposicao_id,
    ft.total::bigint as total_count,
    c.geral::bigint as total_count_geral,
    c.pra_enviar_enviado::bigint as total_count_pra_enviar,
    c.sem_estoque::bigint as total_count_sem_estoque,
    c.buffer::bigint as total_count_buffer,
    c.retirada::bigint as total_count_retirada,
    c.erro::bigint as total_count_erro,
    c.enviados::bigint as total_count_enviados,
    c.devolucao::bigint as total_count_devolucao,
    c.entregue::bigint as total_count_entregue,
    c.cancelado::bigint as total_count_cancelado,
    c.bloqueado::bigint as total_count_bloqueado
  from contagens c
  cross join filtrado_total ft
  left join paginado pg on true;
$function$;

REVOKE ALL ON FUNCTION public.fn_fornecedor_pedidos_lista(uuid, uuid, text[], integer, integer, text, timestamptz, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_pedidos_lista(uuid, uuid, text[], integer, integer, text, timestamptz, timestamptz, text, text) TO service_role;

-- Índice pro novo caminho de busca (pedido_itens por fornecedor_id, usado tanto no EXISTS
-- quanto na soma lateral) — já criado em add-pedido-itens-fornecedor-financeiro.sql
-- (idx_pedido_itens_fornecedor_id), só reforçando que essa RPC depende dele.
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido_fornecedor ON public.pedido_itens (pedido_id, fornecedor_id);
