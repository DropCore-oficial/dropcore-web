-- Achado 2026-11-24: ml_sync_falhas só virava 'resolvido' quando o robô de retry (dedicado)
-- tentava de novo e dava certo (fn_ml_sync_falha_marcar_resultado). O caminho normal — um
-- SKU sincronizar com sucesso de novo durante o push reativo ou a reconciliação de hora em
-- hora — nunca avisava a tabela de falhas, então o contador que alimenta o banner do seller
-- (fn_ml_sync_falha_resumo_seller) só caía depois de 48h parado no relógio, mesmo com a
-- conexão já corrigida. Esta RPC fecha esse caminho: toda vez que o mesmo seller+tipo+sku
-- sincroniza com sucesso, resolve na hora qualquer falha antiga daquele mesmo item.

CREATE OR REPLACE FUNCTION public.fn_ml_sync_falha_resolver(
  p_seller_id uuid,
  p_tipo text,
  p_sku text,
  p_referencia_externa text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ml_sync_falhas
  SET status = 'resolvido', resolvido_em = now(), atualizado_em = now()
  WHERE seller_id = p_seller_id
    AND tipo = p_tipo
    AND COALESCE(sku, '') = COALESCE(p_sku, '')
    AND COALESCE(referencia_externa, '') = COALESCE(p_referencia_externa, '')
    AND status IN ('pendente', 'esgotado');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ml_sync_falha_resolver(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_falha_resolver(uuid, text, text, text) TO service_role;

-- Índice dedicado — sem ele essa UPDATE faria Seq Scan conforme a tabela cresce (regra do
-- projeto: toda RPC precisa de índice real atrás de WHERE/JOIN, não só supor).
CREATE INDEX IF NOT EXISTS ml_sync_falhas_resolver_idx
  ON public.ml_sync_falhas (seller_id, tipo, COALESCE(sku, ''), COALESCE(referencia_externa, ''))
  WHERE status IN ('pendente', 'esgotado');
