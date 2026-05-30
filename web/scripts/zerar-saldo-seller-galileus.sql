-- =============================================================================
-- DropCore — Zerar saldo financeiro de UM seller de teste (ex.: Galileus)
--
-- NÃO mexe em outros sellers da mesma org.
-- NÃO apaga o cadastro do seller — só limpa crédito / ledger / depósitos PIX.
--
-- ORDEM:
--   1) Rode só o bloco "0) CONFERÊNCIA"
--   2) Confirme que é só o seller de teste (nome, saldo, e-mail)
--   3) Rode o bloco "1) ZERAR SALDO"
--   4) Rode o bloco "2) CONFERIR DEPOIS"
-- =============================================================================

-- 0) CONFERÊNCIA — ajuste o filtro se o nome for diferente
SELECT
  s.id,
  s.nome,
  s.email,
  s.status,
  s.saldo_atual,
  s.saldo_bloqueado,
  o.nome AS org_nome,
  (SELECT COALESCE(SUM(valor_total), 0)
   FROM public.financial_ledger fl
   WHERE fl.seller_id = s.id AND fl.tipo = 'CREDITO') AS total_credito_ledger,
  (SELECT COUNT(*) FROM public.seller_depositos_pix d WHERE d.seller_id = s.id) AS depositos_pix_qtd
FROM public.sellers s
JOIN public.orgs o ON o.id = s.org_id
WHERE s.nome ILIKE '%galileus%'
   OR s.email ILIKE '%galileus%';


-- 1) ZERAR SALDO — só depois de conferir o SELECT acima
/*
BEGIN;

CREATE TEMP TABLE _zerar_seller (seller_id uuid PRIMARY KEY);
INSERT INTO _zerar_seller (seller_id)
SELECT s.id
FROM public.sellers s
WHERE s.nome ILIKE '%galileus%'
   OR s.email ILIKE '%galileus%';

DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*)::int INTO n FROM _zerar_seller;
  IF n = 0 THEN
    RAISE EXCEPTION 'Nenhum seller Galileus encontrado. Ajuste o ILIKE.';
  END IF;
  IF n > 1 THEN
    RAISE EXCEPTION 'Mais de um seller casou (%). Refine o filtro antes de zerar.', n;
  END IF;
END $$;

-- Pedidos / bloqueios ativos impedem saldo “limpo” no extrato — aviso se houver
DO $$
DECLARE n_ped int;
BEGIN
  SELECT COUNT(*)::int INTO n_ped
  FROM public.pedidos p
  WHERE p.seller_id IN (SELECT seller_id FROM _zerar_seller)
    AND p.status NOT IN ('cancelado', 'erro_saldo');
  IF n_ped > 0 THEN
    RAISE NOTICE 'ATENÇÃO: % pedido(s) ainda ativos neste seller. Só zera crédito/ledger; pedidos permanecem.', n_ped;
  END IF;
END $$;

DELETE FROM public.financial_debito_descontar d
WHERE d.ledger_id IN (
  SELECT fl.id FROM public.financial_ledger fl
  WHERE fl.seller_id IN (SELECT seller_id FROM _zerar_seller)
);

DELETE FROM public.financial_ledger
WHERE seller_id IN (SELECT seller_id FROM _zerar_seller);

DELETE FROM public.seller_depositos_pix
WHERE seller_id IN (SELECT seller_id FROM _zerar_seller);

DELETE FROM public.seller_movimentacoes
WHERE seller_id IN (SELECT seller_id FROM _zerar_seller);

DO $lots$
BEGIN
  IF to_regclass('public.seller_credit_lots') IS NOT NULL THEN
    DELETE FROM public.seller_credit_lots
    WHERE seller_id IN (SELECT seller_id FROM _zerar_seller);
  END IF;
END $lots$;

UPDATE public.sellers
SET saldo_atual = 0, saldo_bloqueado = 0, atualizado_em = now()
WHERE id IN (SELECT seller_id FROM _zerar_seller);

DROP TABLE _zerar_seller;

COMMIT;
*/


-- 2) CONFERIR DEPOIS
/*
SELECT id, nome, saldo_atual, saldo_bloqueado
FROM public.sellers
WHERE nome ILIKE '%galileus%' OR email ILIKE '%galileus%';
*/
