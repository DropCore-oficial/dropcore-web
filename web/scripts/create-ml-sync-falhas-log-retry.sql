-- Log persistente + retry pra sync com o Mercado Livre (estoque e ingestão de pedido).
-- Até aqui, falha de PUT de estoque pro ML ou de ingestão de pedido do ML só virava
-- console.error (perdido em produção) — achado real 2026-10-24: venda real no anúncio do
-- seller Vinz Collection (SKU DJU005003, item MLB5022127077) nunca gerou pedido no
-- DropCore, e isso só foi descoberto comparando manualmente o estoque real do ML com o
-- ledger do DropCore. Esta tabela + funções fecham esse ponto cego.

CREATE TABLE IF NOT EXISTS public.ml_sync_falhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id),
  fornecedor_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('estoque_push', 'pedido_ingest')),
  sku text,
  ml_item_id text,
  referencia_externa text,
  erro text,
  tentativas int NOT NULL DEFAULT 1,
  max_tentativas int NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'resolvido', 'esgotado')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz
);

-- Upsert por "mesma falha ainda pendente" — evita duplicar linha a cada venda que reincide
-- no mesmo SKU/pedido antes do retry rodar.
CREATE UNIQUE INDEX IF NOT EXISTS ml_sync_falhas_pendente_uniq
  ON public.ml_sync_falhas (seller_id, tipo, COALESCE(sku, ''), COALESCE(referencia_externa, ''))
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS ml_sync_falhas_status_idx ON public.ml_sync_falhas (status) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS ml_sync_falhas_org_idx ON public.ml_sync_falhas (org_id);

ALTER TABLE public.ml_sync_falhas ENABLE ROW LEVEL SECURITY;

-- Mesma trava de leitura usada em erp_event_logs — só quem já tem acesso ao seller/org
-- enxerga a linha. Escrita é só via RPC SECURITY DEFINER abaixo (service_role).
CREATE POLICY rls_ml_sync_falhas_select ON public.ml_sync_falhas
  FOR SELECT
  USING (public.fn_user_can_access_seller(org_id, seller_id));

REVOKE ALL ON public.ml_sync_falhas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ml_sync_falhas TO authenticated;
GRANT ALL ON public.ml_sync_falhas TO service_role;

-- Registra (ou reincide numa já pendente) uma falha de sync com o ML. Chamada só pelo
-- backend (supabaseAdmin), nunca pelo front — por isso não confere auth.uid() por dentro.
CREATE OR REPLACE FUNCTION public.fn_ml_sync_falha_registrar(
  p_org_id uuid,
  p_seller_id uuid,
  p_fornecedor_id uuid,
  p_tipo text,
  p_sku text,
  p_ml_item_id text,
  p_referencia_externa text,
  p_erro text,
  p_max_tentativas int DEFAULT 100
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.ml_sync_falhas (
    org_id, seller_id, fornecedor_id, tipo, sku, ml_item_id, referencia_externa, erro, max_tentativas
  )
  VALUES (
    p_org_id, p_seller_id, p_fornecedor_id, p_tipo, p_sku, p_ml_item_id, p_referencia_externa, p_erro, p_max_tentativas
  )
  ON CONFLICT (seller_id, tipo, COALESCE(sku, ''), COALESCE(referencia_externa, '')) WHERE status = 'pendente'
  DO UPDATE SET
    tentativas = public.ml_sync_falhas.tentativas + 1,
    erro = EXCLUDED.erro,
    ml_item_id = COALESCE(EXCLUDED.ml_item_id, public.ml_sync_falhas.ml_item_id),
    atualizado_em = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Lista falhas pendentes pro cron de retry processar, mais antigas primeiro.
CREATE OR REPLACE FUNCTION public.fn_ml_sync_falha_listar_pendentes(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  seller_id uuid,
  fornecedor_id uuid,
  tipo text,
  sku text,
  ml_item_id text,
  referencia_externa text,
  tentativas int,
  max_tentativas int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, org_id, seller_id, fornecedor_id, tipo, sku, ml_item_id, referencia_externa, tentativas, max_tentativas
  FROM public.ml_sync_falhas
  WHERE status = 'pendente' AND tentativas < max_tentativas
  ORDER BY criado_em ASC
  LIMIT p_limit;
$$;

-- Marca o resultado de uma tentativa de retry: sucesso resolve, falha soma tentativa (e
-- esgota se baterem no teto).
CREATE OR REPLACE FUNCTION public.fn_ml_sync_falha_marcar_resultado(
  p_id uuid,
  p_sucesso boolean,
  p_erro text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_sucesso THEN
    UPDATE public.ml_sync_falhas
    SET status = 'resolvido', resolvido_em = now(), atualizado_em = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.ml_sync_falhas
    SET
      tentativas = tentativas + 1,
      erro = COALESCE(p_erro, erro),
      atualizado_em = now(),
      status = CASE WHEN tentativas + 1 >= max_tentativas THEN 'esgotado' ELSE status END
    WHERE id = p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ml_sync_falha_registrar(uuid, uuid, uuid, text, text, text, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ml_sync_falha_listar_pendentes(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ml_sync_falha_marcar_resultado(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_falha_registrar(uuid, uuid, uuid, text, text, text, text, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_falha_listar_pendentes(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_falha_marcar_resultado(uuid, boolean, text) TO service_role;

-- Lock advisory pro cron de retry (913001 Olist, 913002 fornecedor-olist, 913010 Bling,
-- 913011 bloqueados, 913012 etiqueta-olist/erro-saldo, 913014 postado-auto, 913015
-- ml-pedidos-reconciliacao, 913016 etiqueta-ml, 913017 sla-despacho, 913018
-- anuncio-sem-sku — próximo livre: 913019).
CREATE OR REPLACE FUNCTION public.dropcore_try_ml_sync_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913019);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_ml_sync_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913019);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_ml_sync_retry_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_ml_sync_retry_lock() TO postgres;

-- A cada 15 min — reprocessa push de estoque e ingestão de pedido do ML que falharam antes.
SELECT cron.schedule(
  'dropcore-ml-sync-retry',
  '*/15 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/ml-sync-retry');$$
);
