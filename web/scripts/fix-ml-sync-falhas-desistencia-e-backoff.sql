-- Incidente 2026-11-24: ml_sync_falhas tinha 2 bugs reais que juntos causavam sobrecarga:
--
-- 1) fn_ml_sync_falha_registrar (chamada toda vez que QUALQUER tentativa de sync falha —
--    não só o robô de retry, também o push reativo e a reconciliação de hora em hora)
--    incrementava `tentativas` sem nunca checar o limite nem virar 'esgotado' — só
--    fn_ml_sync_falha_marcar_resultado (chamada só pelo retry) tinha essa checagem. Linha
--    atacada por 3-4 robôs diferentes passava de 100 tentativas rápido, ficava invisível
--    pro retry (que só pega tentativas < max_tentativas) mas nunca virava 'esgotado' —
--    zumbi preso pra sempre, nunca resolve, nunca desiste.
--
-- 2) fn_ml_sync_falha_listar_pendentes não espaçava tentativa nenhuma — rodando a cada
--    1 minuto, batia no MESMO item quebrado toda vez, gerando volume real de chamada à
--    API do Mercado Livre em cima de algo que, estrutural, não ia resolver sozinho
--    (ex: token revogado, anúncio fechado) — contribuiu pro próprio ML começar a
--    bloquear por excesso ("too_many_requests").

-- Corrige (1): mesma checagem de limite que já existia só no retry.
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
    atualizado_em = now(),
    status = CASE
      WHEN public.ml_sync_falhas.tentativas + 1 >= public.ml_sync_falhas.max_tentativas THEN 'esgotado'
      ELSE public.ml_sync_falhas.status
    END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Corrige (2): espaça a tentativa por quanto já tentou (1min -> 5min -> 15min -> 1h -> 4h),
-- em vez de bater toda rodada (1 em 1 minuto) no mesmo item sem parar.
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
  WHERE status = 'pendente'
    AND tentativas < max_tentativas
    AND atualizado_em <= now() - (
      CASE
        WHEN tentativas <= 3 THEN interval '1 minute'
        WHEN tentativas <= 6 THEN interval '5 minutes'
        WHEN tentativas <= 10 THEN interval '15 minutes'
        WHEN tentativas <= 20 THEN interval '1 hour'
        ELSE interval '4 hours'
      END
    )
  ORDER BY criado_em ASC
  LIMIT p_limit;
$$;

-- Limpeza única dos zumbis que o bug (1) já criou — tentativas >= max_tentativas mas nunca
-- viraram 'esgotado'. Não mexe em nenhuma linha genuinamente ainda tentando.
UPDATE public.ml_sync_falhas
SET status = 'esgotado', atualizado_em = now()
WHERE status = 'pendente' AND tentativas >= max_tentativas;
