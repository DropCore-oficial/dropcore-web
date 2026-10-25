-- Log de todo envio (sucesso ou falha) de estoque fornecedor->Mercado Livre do seller.
-- Até aqui `ml_sync_falhas` só registrava problema (fila de retry) — não dava pra confirmar
-- que um ajuste de estoque chegou no anúncio sem logar na conta do seller. Achado real
-- 2026-10-25: Djulios ajustou DJU005013 e não havia como o admin confirmar a propagação sem
-- acesso à conta Mercado Livre da Vinz Collection.

CREATE TABLE IF NOT EXISTS public.ml_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id),
  fornecedor_id uuid,
  sku text NOT NULL,
  ml_item_id text,
  estoque_enviado int,
  sucesso boolean NOT NULL,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ml_sync_log_fornecedor_sku_idx ON public.ml_sync_log (fornecedor_id, sku, criado_em DESC);
CREATE INDEX IF NOT EXISTS ml_sync_log_seller_idx ON public.ml_sync_log (seller_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ml_sync_log_org_idx ON public.ml_sync_log (org_id);

ALTER TABLE public.ml_sync_log ENABLE ROW LEVEL SECURITY;

-- Uma só policy FOR ALL cobrindo os dois vínculos reais (seller dono do anúncio, fornecedor
-- dono do SKU) — escrita de verdade é só via RPC SECURITY DEFINER abaixo (service_role).
CREATE POLICY rls_ml_sync_log_all ON public.ml_sync_log
  FOR ALL
  USING (
    public.fn_user_can_access_seller(org_id, seller_id)
    OR public.fn_user_can_access_fornecedor(org_id, fornecedor_id)
  );

REVOKE ALL ON public.ml_sync_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ml_sync_log TO authenticated;
GRANT ALL ON public.ml_sync_log TO service_role;

-- Registra uma tentativa de push de estoque pro ML (sucesso ou falha). Chamada só pelo
-- backend (supabaseAdmin), nunca pelo front.
CREATE OR REPLACE FUNCTION public.fn_ml_sync_log_registrar(
  p_org_id uuid,
  p_seller_id uuid,
  p_fornecedor_id uuid,
  p_sku text,
  p_ml_item_id text,
  p_estoque_enviado int,
  p_sucesso boolean,
  p_erro text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ml_sync_log (
    org_id, seller_id, fornecedor_id, sku, ml_item_id, estoque_enviado, sucesso, erro
  )
  VALUES (
    p_org_id, p_seller_id, p_fornecedor_id, p_sku, p_ml_item_id, p_estoque_enviado, p_sucesso, p_erro
  )
  RETURNING id;
$$;

-- Lista o histórico de sync mais recente de um fornecedor (opcionalmente filtrado por SKU),
-- pra exibir em /fornecedor/integracoes-erp sem precisar acesso à conta ML do seller.
CREATE OR REPLACE FUNCTION public.fn_ml_sync_log_listar_por_fornecedor(
  p_fornecedor_id uuid,
  p_sku text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  seller_id uuid,
  seller_nome text,
  sku text,
  ml_item_id text,
  estoque_enviado int,
  sucesso boolean,
  erro text,
  criado_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.seller_id, s.nome, l.sku, l.ml_item_id, l.estoque_enviado, l.sucesso, l.erro, l.criado_em
  FROM public.ml_sync_log l
  JOIN public.sellers s ON s.id = l.seller_id
  WHERE l.fornecedor_id = p_fornecedor_id
    AND (p_sku IS NULL OR l.sku = p_sku)
  ORDER BY l.criado_em DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.fn_ml_sync_log_registrar(uuid, uuid, uuid, text, text, int, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ml_sync_log_listar_por_fornecedor(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_log_registrar(uuid, uuid, uuid, text, text, int, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_log_listar_por_fornecedor(uuid, text, int) TO service_role;
