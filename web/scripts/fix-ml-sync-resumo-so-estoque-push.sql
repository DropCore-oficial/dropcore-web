-- Achado 2026-11-24: fn_ml_sync_falha_resumo_seller e fn_ml_sync_falhas_resumo_admin
-- contavam/misturavam os dois tipos de ml_sync_falhas (estoque_push E pedido_ingest) na
-- mesma soma/"ultimo_erro" — mas o banner do seller e a notificação de admin falam
-- especificamente de ESTOQUE não sincronizar ("o estoque dos seus anúncios pode não estar
-- sendo atualizado"). Resultado real: banner da Coimbra Company preso mostrando um erro de
-- pedido_ingest de dias atrás (bug antigo, coluna que nem existe mais) só porque ele
-- coincidiu no desempate de `ORDER BY atualizado_em DESC`, mesmo com o estoque dela 100%
-- sincronizando havia horas. pedido_ingest é um tipo de falha diferente (ingestão de pedido,
-- não push de estoque) e não deve contar pra esse alerta específico.

CREATE OR REPLACE FUNCTION public.fn_ml_sync_falha_resumo_seller(p_seller_id uuid)
RETURNS TABLE(qtd_pendente bigint, qtd_esgotado bigint, ultimo_erro text, ultima_tentativa timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    count(*) FILTER (WHERE f.status = 'pendente') AS qtd_pendente,
    count(*) FILTER (WHERE f.status = 'esgotado') AS qtd_esgotado,
    (array_agg(f.erro ORDER BY f.atualizado_em DESC))[1] AS ultimo_erro,
    max(f.atualizado_em) AS ultima_tentativa
  FROM public.ml_sync_falhas f
  WHERE f.seller_id = p_seller_id
    AND f.tipo = 'estoque_push'
    AND f.status IN ('pendente', 'esgotado')
    AND f.atualizado_em > now() - interval '48 hours';
$$;

CREATE OR REPLACE FUNCTION public.fn_ml_sync_falhas_resumo_admin(p_org_id uuid)
RETURNS TABLE(
  seller_id uuid, seller_nome text, fornecedor_id uuid, fornecedor_nome text,
  qtd_pendente bigint, qtd_esgotado bigint, ultimo_erro text, ultima_tentativa timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Só falha "ativa agora" (achado: esgotado de incidente já resolvido há dias ficava
  -- aparecendo pra sempre até a limpeza de 14 dias rodar, confundindo com problema real).
  SELECT
    f.seller_id,
    s.nome,
    f.fornecedor_id,
    forn.nome,
    count(*) FILTER (WHERE f.status = 'pendente') AS qtd_pendente,
    count(*) FILTER (WHERE f.status = 'esgotado') AS qtd_esgotado,
    (array_agg(f.erro ORDER BY f.atualizado_em DESC))[1] AS ultimo_erro,
    max(f.atualizado_em) AS ultima_tentativa
  FROM public.ml_sync_falhas f
  JOIN public.sellers s ON s.id = f.seller_id
  LEFT JOIN public.fornecedores forn ON forn.id = f.fornecedor_id
  WHERE f.org_id = p_org_id
    AND f.tipo = 'estoque_push'
    AND f.status IN ('pendente', 'esgotado')
    AND f.atualizado_em > now() - interval '48 hours'
  GROUP BY f.seller_id, s.nome, f.fornecedor_id, forn.nome
  ORDER BY (count(*) FILTER (WHERE f.status = 'pendente') + count(*) FILTER (WHERE f.status = 'esgotado')) DESC;
$$;

-- Catch-up pontual: Coimbra Company confirmada 100% saudável agora (12 syncs de sucesso
-- seguidos) — as 13 linhas estoque_push dela (12 zumbi reclassificado hoje + 1 órfã de
-- anúncio que o sku-mapper já removeu do mapeamento, nunca mais será retentada por nada)
-- não refletem o estado real. Resolve na mão em vez de esperar as 48h do relógio.
UPDATE public.ml_sync_falhas
SET status = 'resolvido', resolvido_em = now(), atualizado_em = now()
WHERE seller_id = 'd874e40d-c05b-42d7-8836-f40f531f6de2'
  AND tipo = 'estoque_push'
  AND status IN ('pendente', 'esgotado');
