-- Pedido com status = 'pendente_estoque' (SKU com estoque zerado) estava caindo dentro da
-- aba "Pra enviar" do fornecedor, junto com pedido que já tem etiqueta liberada e só
-- precisa ser postado. Isso é errado: não tem nada "pra enviar" ali, o fornecedor primeiro
-- precisa reabastecer o SKU. Corrige criando a aba "Sem estoque" (pra UI) e separando o
-- contador no banco — pendente_estoque sai de pra_enviar_status e ganha contador próprio.
--
-- Não mexe no script já aplicado (fix-fornecedor-pedidos-contadores-pacote-e-aba-vazia.sql)
-- — corretivo novo. CREATE OR REPLACE não permite adicionar coluna no retorno — dropa antes.

drop function if exists public.fn_fornecedor_pedidos_lista(uuid, uuid, text[], int, int, text, timestamptz, timestamptz, text, text);

create or replace function public.fn_fornecedor_pedidos_lista(
  p_org_id uuid,
  p_fornecedor_id uuid,
  p_status text[],
  p_limit int,
  p_offset int,
  p_seller_nome text default null,
  p_desde timestamptz default null,
  p_ate timestamptz default null,
  p_buffer_ml text default null, -- 'somente' | 'excluir' | null (sem filtro)
  p_etiqueta_impressa text default null -- 'somente' | 'excluir' | null (sem filtro) — aba "Para retirar"
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
  total_count_sem_estoque bigint,
  total_count_buffer bigint,
  total_count_retirada bigint,
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
      coalesce(p.marketplace_pack_id, p.id::text) as pack_key,
      (p.status = 'enviado' and p.canal_venda = 'mercado_livre'
        and p.etiqueta_pdf_url is null and p.etiqueta_pdf_base64 is null) as em_buffer,
      -- Impressa de verdade, não só disponível — ver add-fornecedor-pedidos-aba-retirada.sql.
      (p.etiqueta_impressa_em is not null) as etiqueta_ja_impressa
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
  -- 1 linha por pacote (ou por pedido avulso sem pack_id) — representa o card que a tela
  -- renderiza depois do agrupamento por marketplace_pack_id em route.ts. Pega a linha mais
  -- recente do pacote como representante (na prática todo pedido de um mesmo pacote
  -- caminha junto no mesmo status).
  pacotes as (
    select distinct on (pack_key)
      pack_key, status, em_buffer, etiqueta_ja_impressa
    from base
    order by pack_key, criado_em desc
  ),
  -- Agregado sem GROUP BY: sempre devolve exatamente 1 linha, mesmo se `base`/`pacotes`
  -- estiver vazio. É o que garante os contadores nunca sumirem (bug 1 do script anterior).
  contagens as (
    select
      count(*) as geral,
      count(*) filter (where status = 'bloqueado') as pra_enviar_status,
      count(*) filter (where status = 'enviado' and not em_buffer and not etiqueta_ja_impressa) as pra_enviar_enviado,
      count(*) filter (where status = 'pendente_estoque') as sem_estoque,
      count(*) filter (where em_buffer) as buffer,
      count(*) filter (where status = 'enviado' and etiqueta_ja_impressa) as retirada,
      count(*) filter (where status = 'erro_saldo') as erro,
      count(*) filter (where status = 'aguardando_repasse') as enviados,
      count(*) filter (where status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor')) as devolucao,
      count(*) filter (where status = 'entregue') as entregue,
      count(*) filter (where status = 'cancelado') as cancelado
    from pacotes
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
    pg.id, pg.seller_id, pg.fornecedor_id, pg.sku_id, pg.nome_produto,
    pg.preco_venda, pg.valor_fornecedor, pg.status,
    pg.motivo_bloqueio, pg.motivo_bloqueio_responsavel, pg.cancelado_motivo,
    pg.criado_em, pg.etiqueta_pdf_url, pg.etiqueta_pdf_base64,
    pg.etiqueta_impressa_em, pg.etiqueta_liberada_em,
    pg.marketplace_numero, pg.marketplace_pack_id,
    pg.comprador_nome, pg.comprador_cidade, pg.comprador_uf, pg.comprador_fone,
    pg.referencia_externa, pg.metodo_envio, pg.tracking_codigo, pg.canal_venda,
    pg.e_teste, pg.ledger_id,
    ft.total::bigint as total_count,
    c.geral::bigint as total_count_geral,
    (c.pra_enviar_status + c.pra_enviar_enviado)::bigint as total_count_pra_enviar,
    c.sem_estoque::bigint as total_count_sem_estoque,
    c.buffer::bigint as total_count_buffer,
    c.retirada::bigint as total_count_retirada,
    c.erro::bigint as total_count_erro,
    c.enviados::bigint as total_count_enviados,
    c.devolucao::bigint as total_count_devolucao,
    c.entregue::bigint as total_count_entregue,
    c.cancelado::bigint as total_count_cancelado
  -- `contagens`/`filtrado_total` têm sempre 1 linha (agregado sem GROUP BY) → cross join
  -- entre elas nunca perde linha. `paginado` pode ter 0 linhas (aba vazia) → LEFT JOIN, pra
  -- os contadores continuarem voltando mesmo sem nenhum pedido pra listar.
  from contagens c
  cross join filtrado_total ft
  left join paginado pg on true;
$function$;

revoke all on function public.fn_fornecedor_pedidos_lista from public, anon, authenticated;
grant execute on function public.fn_fornecedor_pedidos_lista to service_role;
