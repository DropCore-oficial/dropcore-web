-- Corrige `fn_seller_pedidos_lista`: a CTE `pacotes` escolhia 1 pedido representante por
-- pacote (`DISTINCT ON (pack_key) ORDER BY criado_em DESC`) e usava o status DESSE pedido
-- pra contar a aba inteira do pacote. Quando um pacote tem vários itens (mesmo
-- marketplace_pack_id) em status diferentes — ex.: 1 item já devolvido, outro item mais
-- recente ainda "entregue" — o item mais recente "roubava" a contagem e a devolução
-- desaparecia da aba "Devolução" (achado real 2026-11-11, seller Vinz Collection: 7 pacotes
-- em devolução, aba mostrando só 5).
--
-- A função irmã do fornecedor (`fn_fornecedor_pedidos_lista`) já resolve isso certo, com
-- `bool_or(status = ...) group by pack_key` — qualquer item do pacote em devolução já conta
-- o pacote inteiro como devolução, não importa qual é mais recente. Esse script só alinha
-- `fn_seller_pedidos_lista` ao mesmo padrão, sem mudar mais nada (listagem paginada, filtros
-- de busca/data/buffer/etiqueta continuam exatamente iguais).
--
-- Não mexe no script já aplicado (fix-seller-pedidos-contadores-pacote-e-aba-vazia.sql) —
-- corretivo novo, igual regra do projeto.

drop function if exists public.fn_seller_pedidos_lista(uuid, uuid, text[], int, int, text, timestamptz, timestamptz, text, text);

create or replace function public.fn_seller_pedidos_lista(
  p_org_id uuid,
  p_seller_id uuid,
  p_status text[],
  p_limit int,
  p_offset int,
  p_produto text default null,
  p_desde timestamptz default null,
  p_ate timestamptz default null,
  p_buffer_ml text default null, -- 'somente' | 'excluir' | null (sem filtro)
  p_etiqueta_impressa text default null -- 'somente' | 'excluir' | null (sem filtro) — aba "Para retirar"
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
  total_count bigint,
  total_count_geral bigint,
  total_count_pendencias bigint,
  total_count_pra_enviar bigint,
  total_count_buffer bigint,
  total_count_retirada bigint,
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
      coalesce(p.marketplace_pack_id, p.id::text) as pack_key,
      (p.status = 'enviado' and p.canal_venda = 'mercado_livre'
        and p.etiqueta_pdf_url is null and p.etiqueta_pdf_base64 is null) as em_buffer,
      (p.etiqueta_impressa_em is not null) as etiqueta_ja_impressa
    from public.pedidos p
    where p.org_id = p_org_id
      and p.seller_id = p_seller_id
      and (p_produto is null or p_produto = '' or p.nome_produto ilike '%' || p_produto || '%')
      and (p_desde is null or p.criado_em >= p_desde)
      and (p_ate is null or p.criado_em <= p_ate)
  ),
  -- 1 linha por pacote, mas agora agregando por `bool_or` (qualquer item do pacote nesse
  -- estado já conta) em vez de pegar o status de 1 item representante — mesmo padrão de
  -- `fn_fornecedor_pedidos_lista`.
  pacote_status as (
    select
      pack_key,
      bool_or(status in ('bloqueado', 'produto_nao_vinculado', 'anuncio_sem_sku', 'pendente_estoque', 'erro_saldo')) as tem_pendencia,
      bool_or(status = 'enviado' and not em_buffer and not etiqueta_ja_impressa) as tem_pra_enviar,
      bool_or(em_buffer) as tem_buffer,
      bool_or(status = 'enviado' and etiqueta_ja_impressa) as tem_retirada,
      bool_or(status = 'aguardando_repasse') as tem_enviados,
      bool_or(status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor')) as tem_devolucao,
      bool_or(status = 'entregue') as tem_entregue,
      bool_or(status = 'cancelado') as tem_cancelado
    from base
    group by pack_key
  ),
  -- Agregado sem GROUP BY: sempre devolve exatamente 1 linha, mesmo se `base`/`pacote_status`
  -- estiver vazio — garante os contadores nunca sumirem.
  contagens as (
    select
      count(*) as geral,
      count(*) filter (where tem_pendencia) as pendencias,
      count(*) filter (where tem_pra_enviar) as pra_enviar,
      count(*) filter (where tem_buffer) as buffer,
      count(*) filter (where tem_retirada) as retirada,
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
  -- Também agregado sem GROUP BY (sempre 1 linha) — paginação continua em linha crua, não
  -- em pacote, porque o LIMIT/OFFSET roda antes do agrupamento (feito depois, no route.ts).
  filtrado_total as (
    select count(*) as total from filtrado
  ),
  paginado as (
    select *
    from filtrado
    order by
      case when status = 'enviado'
        and etiqueta_impressa_em is null
        and (etiqueta_pdf_url is not null or etiqueta_pdf_base64 is not null)
        then etiqueta_liberada_em end desc nulls last,
      criado_em desc
    limit p_limit offset p_offset
  )
  select
    pg.id, pg.nome_produto, pg.valor_total, pg.preco_venda, pg.status,
    pg.motivo_bloqueio, pg.motivo_bloqueio_responsavel, pg.cancelado_motivo,
    pg.criado_em, pg.referencia_externa, pg.tracking_codigo, pg.metodo_envio,
    pg.marketplace_numero, pg.marketplace_pack_id,
    pg.comprador_nome, pg.comprador_cidade, pg.comprador_uf, pg.comprador_fone,
    pg.canal_venda, pg.etiqueta_pdf_url, pg.etiqueta_pdf_base64, pg.etiqueta_tentativas,
    pg.etiqueta_impressa_em, pg.etiqueta_liberada_em,
    ft.total::bigint as total_count,
    c.geral::bigint as total_count_geral,
    c.pendencias::bigint as total_count_pendencias,
    c.pra_enviar::bigint as total_count_pra_enviar,
    c.buffer::bigint as total_count_buffer,
    c.retirada::bigint as total_count_retirada,
    c.enviados::bigint as total_count_enviados,
    c.devolucao::bigint as total_count_devolucao,
    c.entregue::bigint as total_count_entregue,
    c.cancelado::bigint as total_count_cancelado
  -- `contagens`/`filtrado_total` têm sempre 1 linha (agregado sem GROUP BY) → cross join
  -- entre elas nunca perde linha. `paginado` pode ter 0 linhas (aba vazia) → LEFT JOIN.
  from contagens c
  cross join filtrado_total ft
  left join paginado pg on true;
$function$;

revoke all on function public.fn_seller_pedidos_lista from public, anon, authenticated;
grant execute on function public.fn_seller_pedidos_lista to service_role;
