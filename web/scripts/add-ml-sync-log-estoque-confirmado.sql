-- Incidente 2026-11-24: até aqui o ml_sync_log só registrava o HTTP 200 do PUT pro ML como
-- "sucesso" — nunca confirmava que o valor realmente gravado lá bate com o que mandamos. O
-- PUT /items/{id} do Mercado Livre já ecoa o item inteiro atualizado na resposta (mesmo
-- shape do GET) — dá pra usar isso como confirmação de leitura sem precisar de uma chamada
-- extra. Sr Stark pediu essa confirmação "por dentro" depois do oversell real do Felipão.

ALTER TABLE public.ml_sync_log ADD COLUMN IF NOT EXISTS estoque_confirmado int;

-- Assinatura antiga (8 args) vira overload morto se só usar CREATE OR REPLACE com o 9º
-- parâmetro novo — remove explicitamente antes de recriar.
DROP FUNCTION IF EXISTS public.fn_ml_sync_log_registrar(uuid, uuid, uuid, text, text, int, boolean, text);

CREATE OR REPLACE FUNCTION public.fn_ml_sync_log_registrar(
  p_org_id uuid,
  p_seller_id uuid,
  p_fornecedor_id uuid,
  p_sku text,
  p_ml_item_id text,
  p_estoque_enviado int,
  p_sucesso boolean,
  p_erro text DEFAULT NULL,
  p_estoque_confirmado int DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ml_sync_log (
    org_id, seller_id, fornecedor_id, sku, ml_item_id, estoque_enviado, sucesso, erro, estoque_confirmado
  )
  VALUES (
    p_org_id, p_seller_id, p_fornecedor_id, p_sku, p_ml_item_id, p_estoque_enviado, p_sucesso, p_erro, p_estoque_confirmado
  )
  RETURNING id;
$$;

-- Postgres não deixa CREATE OR REPLACE mudar o shape de RETURNS TABLE — dropa primeiro.
DROP FUNCTION IF EXISTS public.fn_ml_sync_log_listar_por_fornecedor(uuid, text, int);

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
  estoque_confirmado int,
  sucesso boolean,
  erro text,
  criado_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.seller_id, s.nome, l.sku, l.ml_item_id, l.estoque_enviado, l.estoque_confirmado, l.sucesso, l.erro, l.criado_em
  FROM public.ml_sync_log l
  JOIN public.sellers s ON s.id = l.seller_id
  WHERE l.fornecedor_id = p_fornecedor_id
    AND (p_sku IS NULL OR l.sku = p_sku)
  ORDER BY l.criado_em DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.fn_ml_sync_log_registrar(uuid, uuid, uuid, text, text, int, boolean, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ml_sync_log_listar_por_fornecedor(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_log_registrar(uuid, uuid, uuid, text, text, int, boolean, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ml_sync_log_listar_por_fornecedor(uuid, text, int) TO service_role;
