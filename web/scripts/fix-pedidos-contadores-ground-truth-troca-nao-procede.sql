-- Achado 2026-11-24: fn_fornecedor_pedidos_contadores_ground_truth e
-- fn_seller_pedidos_contadores_ground_truth (robô de checagem de consistência, roda de hora
-- em hora) só consideravam em_devolucao/devolvido/devolucao_sem_fornecedor como "Devolução"
-- — ficaram desatualizadas desde que Troca (financial_troca_pendente, 2026-11-14) passou a
-- somar troca_em_andamento/troca_concluida nessa mesma aba em fn_fornecedor_pedidos_lista e
-- fn_seller_pedidos_lista (já contavam devolucao_nao_procede também, nunca foi atualizado
-- aqui). Resultado: alarme falso pro admin ("contador divergente") toda vez que um pacote
-- só tem pedido nesses 3 status sem nenhum outro no mesmo pacote já cobrindo a contagem —
-- não é pedido sumido, é o próprio verificador desatualizado.

CREATE OR REPLACE FUNCTION public.fn_fornecedor_pedidos_contadores_ground_truth()
RETURNS TABLE(fornecedor_id uuid, devolucao bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with base as (
    select fornecedor_id, coalesce(marketplace_pack_id, id::text) as pack_key, status
    from public.pedidos
    where fornecedor_id is not null
      and e_teste = false
      and status not in ('produto_nao_vinculado', 'anuncio_sem_sku')
  ),
  pacote_status as (
    select fornecedor_id, pack_key,
      bool_or(status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor', 'devolucao_nao_procede', 'troca_em_andamento', 'troca_concluida')) as tem_devolucao
    from base
    group by fornecedor_id, pack_key
  )
  select fornecedor_id, count(*) filter (where tem_devolucao) as devolucao
  from pacote_status
  group by fornecedor_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_seller_pedidos_contadores_ground_truth()
RETURNS TABLE(seller_id uuid, devolucao bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with base as (
    select seller_id, coalesce(marketplace_pack_id, id::text) as pack_key, status
    from public.pedidos
    where seller_id is not null
  ),
  pacote_status as (
    select seller_id, pack_key,
      bool_or(status in ('em_devolucao', 'devolvido', 'devolucao_sem_fornecedor', 'devolucao_nao_procede', 'troca_em_andamento', 'troca_concluida')) as tem_devolucao
    from base
    group by seller_id, pack_key
  )
  select seller_id, count(*) filter (where tem_devolucao) as devolucao
  from pacote_status
  group by seller_id;
$$;
