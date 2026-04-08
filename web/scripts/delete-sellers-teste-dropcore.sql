-- =============================================================================
-- DropCore — Apagar seller(s) de TESTE na org DropCore + dados ligados
--
-- PERIGO: irreversível. Rode primeiro o SELECT de conferência.
--
-- Edite o filtro em ILIKE abaixo (INSERT ... WHERE). Ex.: '%teste%', '%galileus%'.
-- Pode haver VÁRIOS sellers a casar — todos serão apagados na mesma transação.
-- =============================================================================

-- 0) CONFERÊNCIA (rode só isto primeiro)
/*
SELECT s.id, s.nome, s.status, s.org_id, o.nome AS org_nome
FROM public.sellers s
JOIN public.orgs o ON o.id = s.org_id
WHERE o.nome ILIKE 'dropcore'
  AND (
    s.nome ILIKE '%teste%'
    OR s.nome ILIKE '%galileus%'
    -- OR s.nome ILIKE '%outro%'
  );
*/

BEGIN;

CREATE TEMP TABLE _target_seller (seller_id uuid PRIMARY KEY);
INSERT INTO _target_seller (seller_id)
SELECT s.id
FROM public.sellers s
JOIN public.orgs o ON o.id = s.org_id
WHERE o.nome ILIKE 'dropcore'
  AND (
    s.nome ILIKE '%teste%'
    OR s.nome ILIKE '%galileus%'
  );

DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*)::int INTO n FROM _target_seller;
  IF n = 0 THEN
    RAISE EXCEPTION 'Nenhum seller encontrado. Ajuste os ILIKE no INSERT.';
  END IF;
END $$;

DO $p$
BEGIN
  IF to_regclass('public.pedido_eventos') IS NOT NULL THEN
    DELETE FROM public.pedido_eventos
    WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE seller_id IN (SELECT seller_id FROM _target_seller));
  END IF;
END $p$;

-- financial_debito_descontar não tem seller_id: liga a pedido e/ou ledger
DELETE FROM public.financial_debito_descontar d
USING public.pedidos p
WHERE p.id = d.pedido_id
  AND p.seller_id IN (SELECT seller_id FROM _target_seller);

DELETE FROM public.pedido_itens
WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE seller_id IN (SELECT seller_id FROM _target_seller));

DELETE FROM public.pedidos
WHERE seller_id IN (SELECT seller_id FROM _target_seller);

DO $e$
BEGIN
  IF to_regclass('public.erp_event_logs') IS NOT NULL THEN
    DELETE FROM public.erp_event_logs
    WHERE seller_id IN (SELECT seller_id FROM _target_seller);
  END IF;
  IF to_regclass('public.bling_webhook_logs') IS NOT NULL THEN
    DELETE FROM public.bling_webhook_logs
    WHERE seller_id IN (SELECT seller_id FROM _target_seller);
  END IF;
  IF to_regclass('public.seller_bling_integrations') IS NOT NULL THEN
    DELETE FROM public.seller_bling_integrations
    WHERE seller_id IN (SELECT seller_id FROM _target_seller);
  END IF;
END $e$;

DELETE FROM public.financial_debito_descontar
WHERE ledger_id IN (
  SELECT id FROM public.financial_ledger
  WHERE seller_id IN (SELECT seller_id FROM _target_seller)
);

DELETE FROM public.financial_ledger
WHERE seller_id IN (SELECT seller_id FROM _target_seller);

DELETE FROM public.financial_mensalidades
WHERE tipo = 'seller'
  AND entidade_id IN (SELECT seller_id FROM _target_seller);

DELETE FROM public.seller_depositos_pix
WHERE seller_id IN (SELECT seller_id FROM _target_seller);

DELETE FROM public.seller_movimentacoes
WHERE seller_id IN (SELECT seller_id FROM _target_seller);

DELETE FROM public.seller_invites
WHERE seller_id IN (SELECT seller_id FROM _target_seller);

UPDATE public.org_members
SET seller_id = NULL
WHERE seller_id IN (SELECT seller_id FROM _target_seller);

DELETE FROM public.sellers
WHERE id IN (SELECT seller_id FROM _target_seller);

DROP TABLE _target_seller;

COMMIT;
