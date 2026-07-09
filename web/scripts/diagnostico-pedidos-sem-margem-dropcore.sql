-- Diagnóstico (somente leitura) — pedidos gravados sem a margem de 15% do DropCore.
--
-- Bug: a importação Olist/Bling (web/lib/erp/submitSellerErpPedido.ts e
-- web/app/api/erp/pedidos/route.ts) usava a coluna skus.custo_dropcore direto, sem
-- cair no fallback de 15% sobre custo_base quando essa coluna está vazia/zerada
-- (caso comum). Resultado: valor_dropcore = 0 e o pedido foi debitado do seller só
-- pelo custo do fornecedor, sem a margem do DropCore.
--
-- Este script não altera nada — só identifica e quantifica os pedidos afetados
-- (só os que já passaram por block-sale: status indica que o saldo do seller já foi
-- efetivamente debitado). Rode antes de qualquer correção.

-- 1) Resumo geral
SELECT
  count(*)                                        AS pedidos_afetados,
  round(sum(p.valor_fornecedor * 0.15)::numeric, 2) AS delta_total_a_cobrar
FROM public.pedidos p
WHERE p.status IN ('enviado', 'aguardando_repasse', 'entregue', 'devolvido')
  AND p.valor_dropcore = 0
  AND p.valor_fornecedor > 0;

-- 2) Resumo por seller
SELECT
  s.id                                              AS seller_id,
  s.nome                                             AS seller_nome,
  count(*)                                           AS pedidos_afetados,
  round(sum(p.valor_fornecedor)::numeric, 2)         AS valor_fornecedor_total,
  round(sum(p.valor_fornecedor * 0.15)::numeric, 2)  AS delta_a_cobrar
FROM public.pedidos p
JOIN public.sellers s ON s.id = p.seller_id
WHERE p.status IN ('enviado', 'aguardando_repasse', 'entregue', 'devolvido')
  AND p.valor_dropcore = 0
  AND p.valor_fornecedor > 0
GROUP BY s.id, s.nome
ORDER BY delta_a_cobrar DESC;

-- 3) Lista detalhada dos pedidos afetados (pra conferência linha a linha)
SELECT
  p.id                                               AS pedido_id,
  p.seller_id,
  s.nome                                              AS seller_nome,
  p.status,
  p.valor_fornecedor,
  p.valor_dropcore                                    AS valor_dropcore_atual,
  round(p.valor_fornecedor * 0.15, 2)                 AS delta_a_cobrar,
  p.valor_total                                       AS valor_total_atual,
  round(p.valor_total + p.valor_fornecedor * 0.15, 2) AS valor_total_correto,
  p.criado_em
FROM public.pedidos p
JOIN public.sellers s ON s.id = p.seller_id
WHERE p.status IN ('enviado', 'aguardando_repasse', 'entregue', 'devolvido')
  AND p.valor_dropcore = 0
  AND p.valor_fornecedor > 0
ORDER BY p.criado_em DESC;
