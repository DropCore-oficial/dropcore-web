-- =============================================================================
-- DropCore — Apagar UM fornecedor e dados ligados (dentro da org DropCore)
--
-- PERIGO: irreversível. Execute primeiro o SELECT de conferência (seção 0).
--
-- Ajuste: nome do fornecedor (ILIKE) e nome da org se não for DropCore.
-- Se existir mais de um fornecedor a casar com o padrão, o script ABORTA.
--
-- Tabelas opcionais: ignoradas se não existirem (mesmo padrão dos outros scripts).
-- =============================================================================

-- 0) CONFERÊNCIA (rode só isto primeiro; não apaga nada)
/*
SELECT f.id, f.nome, f.org_id, o.nome AS org_nome
FROM public.fornecedores f
JOIN public.orgs o ON o.id = f.org_id
WHERE o.nome ILIKE 'dropcore'
  AND f.nome ILIKE '%djulios%';
*/

BEGIN;

CREATE TEMP TABLE _target_forn (fornecedor_id uuid PRIMARY KEY);
INSERT INTO _target_forn (fornecedor_id)
SELECT f.id
FROM public.fornecedores f
JOIN public.orgs o ON o.id = f.org_id
WHERE o.nome ILIKE 'dropcore'
  AND f.nome ILIKE '%djulios%';

DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*)::int INTO n FROM _target_forn;
  IF n = 0 THEN
    RAISE EXCEPTION 'Nenhum fornecedor encontrado. Ajuste o ILIKE ou o nome da org.';
  END IF;
  IF n > 1 THEN
    RAISE EXCEPTION 'Vários fornecedores casam com o filtro (%). Use conferência e restrinja o nome.', n;
  END IF;
END $$;

-- Pedidos deste fornecedor
DO $p$
BEGIN
  IF to_regclass('public.pedido_eventos') IS NOT NULL THEN
    DELETE FROM public.pedido_eventos
    WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn));
  END IF;
END $p$;

DELETE FROM public.pedido_itens
WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn));

DELETE FROM public.pedidos
WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);

-- Financeiro (débitos antes do ledger se houver FK)
DELETE FROM public.financial_debito_descontar
WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);

DELETE FROM public.financial_ledger
WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);

DELETE FROM public.financial_repasse_fornecedor
WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);

DELETE FROM public.financial_mensalidades
WHERE tipo = 'fornecedor'
  AND entidade_id IN (SELECT fornecedor_id FROM _target_forn);

-- Convites
DELETE FROM public.fornecedor_invites
WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);

-- Catálogo / alterações
DO $c$
BEGIN
  IF to_regclass('public.sku_alteracoes_pendentes') IS NOT NULL THEN
    DELETE FROM public.sku_alteracoes_pendentes
    WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);
  END IF;
END $c$;

DO $m$
BEGIN
  IF to_regclass('public.produto_tabela_medidas') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'fornecedor_id'
    ) THEN
      DELETE FROM public.produto_tabela_medidas
      WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);
    END IF;
  END IF;
END $m$;

DELETE FROM public.skus
WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);

-- Vínculos (FK costuma ser ON DELETE SET NULL, mas garantimos)
UPDATE public.sellers
SET fornecedor_id = NULL
WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);

UPDATE public.org_members
SET fornecedor_id = NULL
WHERE fornecedor_id IN (SELECT fornecedor_id FROM _target_forn);

DELETE FROM public.fornecedores
WHERE id IN (SELECT fornecedor_id FROM _target_forn);

DROP TABLE _target_forn;

COMMIT;
