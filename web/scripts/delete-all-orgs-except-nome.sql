-- =============================================================================
-- DropCore — Apagar TODAS as orgs exceto UMA (identificada pelo nome na UI)
--
-- Você só ajusta o nome a MANTER na linha INSERT abaixo (ex.: DropCore).
-- Todas as *outras* linhas em public.orgs são removidas com dados ligados.
--
-- Segurança: o script ABORTA se:
--   - não existir nenhuma org com esse nome, ou
--   - existir mais de uma org com o mesmo nome (ambiguidade).
--
-- Não apaga usuários em auth.users — só vínculos e dados das orgs removidas.
--
-- Alternativa (lista manual de UUIDs): delete-orgs-completely.sql
-- Para zerar dados *dentro* da org mantida: wipe-org-sellers-fornecedores.sql
--
-- Deletes em tabelas “extras” (Bling, ERP, etc.) só rodam se a tabela existir.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _keep_nome (nome text);
-- ↓ ÚNICO lugar a editar: nome exibido na UI (comparação sem diferenciar maiúsc/minúsc.)
INSERT INTO _keep_nome (nome) VALUES ('DropCore');

CREATE TEMP TABLE _keep_orgs AS
SELECT o.id AS org_id
FROM public.orgs o
CROSS JOIN _keep_nome k
WHERE lower(trim(o.nome)) = lower(trim(k.nome));

DO $$
DECLARE
  n int;
  keep_label text;
BEGIN
  SELECT COUNT(*)::int INTO n FROM _keep_orgs;
  SELECT k.nome INTO keep_label FROM _keep_nome k LIMIT 1;
  IF n = 0 THEN
    RAISE EXCEPTION 'Nenhuma org com nome "%". Rode: SELECT id, nome FROM public.orgs;', keep_label;
  END IF;
  IF n > 1 THEN
    RAISE EXCEPTION 'Mais de uma org com nome "%". Renomeie duplicatas no Table Editor ou use delete-orgs-completely.sql.', keep_label;
  END IF;
END $$;

CREATE TEMP TABLE _doomed_orgs AS
SELECT o.id AS org_id
FROM public.orgs o
WHERE o.id NOT IN (SELECT org_id FROM _keep_orgs);

-- Tabelas opcionais (migração pode não ter sido aplicada)
DO $opt$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE user_id IN (
      SELECT om.user_id
      FROM public.org_members om
      WHERE om.org_id IN (SELECT org_id FROM _doomed_orgs)
        AND om.user_id IS NOT NULL
    );
  END IF;
  IF to_regclass('public.pedido_eventos') IS NOT NULL THEN
    DELETE FROM public.pedido_eventos
    WHERE org_id IN (SELECT org_id FROM _doomed_orgs);
  END IF;
  IF to_regclass('public.erp_event_logs') IS NOT NULL THEN
    DELETE FROM public.erp_event_logs
    WHERE org_id IN (SELECT org_id FROM _doomed_orgs);
  END IF;
  IF to_regclass('public.bling_webhook_logs') IS NOT NULL THEN
    DELETE FROM public.bling_webhook_logs
    WHERE org_id IN (SELECT org_id FROM _doomed_orgs)
       OR seller_id IN (SELECT id FROM public.sellers WHERE org_id IN (SELECT org_id FROM _doomed_orgs));
  END IF;
  IF to_regclass('public.seller_bling_integrations') IS NOT NULL THEN
    DELETE FROM public.seller_bling_integrations
    WHERE org_id IN (SELECT org_id FROM _doomed_orgs)
       OR seller_id IN (SELECT id FROM public.sellers WHERE org_id IN (SELECT org_id FROM _doomed_orgs));
  END IF;
  IF to_regclass('public.financial_debito_descontar') IS NOT NULL THEN
    DELETE FROM public.financial_debito_descontar
    WHERE org_id IN (SELECT org_id FROM _doomed_orgs);
  END IF;
END
$opt$;

DELETE FROM public.pedido_itens
WHERE pedido_id IN (
  SELECT id FROM public.pedidos WHERE org_id IN (SELECT org_id FROM _doomed_orgs)
);

DELETE FROM public.pedidos
WHERE org_id IN (SELECT org_id FROM _doomed_orgs);

DELETE FROM public.financial_ledger
WHERE org_id IN (SELECT org_id FROM _doomed_orgs);

DELETE FROM public.financial_mensalidades
WHERE org_id IN (SELECT org_id FROM _doomed_orgs);

DELETE FROM public.financial_repasse_fornecedor
WHERE org_id IN (SELECT org_id FROM _doomed_orgs);

DELETE FROM public.financial_ciclos_repasse
WHERE org_id IN (SELECT org_id FROM _doomed_orgs);

DELETE FROM public.seller_depositos_pix
WHERE org_id IN (SELECT org_id FROM _doomed_orgs)
   OR seller_id IN (SELECT id FROM public.sellers WHERE org_id IN (SELECT org_id FROM _doomed_orgs));

DELETE FROM public.seller_movimentacoes
WHERE seller_id IN (SELECT id FROM public.sellers WHERE org_id IN (SELECT org_id FROM _doomed_orgs));

DELETE FROM public.seller_invites
WHERE org_id IN (SELECT org_id FROM _doomed_orgs)
   OR seller_id IN (SELECT id FROM public.sellers WHERE org_id IN (SELECT org_id FROM _doomed_orgs));

DO $opt2$
BEGIN
  IF to_regclass('public.sku_alteracoes_pendentes') IS NOT NULL THEN
    DELETE FROM public.sku_alteracoes_pendentes
    WHERE org_id IN (SELECT org_id FROM _doomed_orgs);
  END IF;
  IF to_regclass('public.produto_tabela_medidas') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'org_id'
    ) THEN
      DELETE FROM public.produto_tabela_medidas
      WHERE org_id IN (SELECT org_id FROM _doomed_orgs);
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'fornecedor_id'
    ) THEN
      DELETE FROM public.produto_tabela_medidas
      WHERE fornecedor_id IN (
        SELECT id FROM public.fornecedores WHERE org_id IN (SELECT org_id FROM _doomed_orgs)
      );
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'grupo_sku'
    ) THEN
      DELETE FROM public.produto_tabela_medidas ptm
      WHERE EXISTS (
        SELECT 1 FROM public.skus s
        WHERE s.org_id IN (SELECT org_id FROM _doomed_orgs)
          AND trim(COALESCE(s.sku, '')) ~ '^[A-Za-z]+[0-9]{6}([^0-9].*)?$'
          AND upper(regexp_replace(trim(s.sku), '^([A-Za-z]+[0-9]{3})[0-9]{3}([^0-9].*)?$', '\1') || '000')
             = upper(trim(ptm.grupo_sku))
      );
    END IF;
  END IF;
END
$opt2$;

-- SKUs podem referenciar a org do fornecedor em fornecedor_org_id (catálogo cruzado)
DO $sku$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'fornecedor_org_id'
  ) THEN
    DELETE FROM public.skus
    WHERE org_id IN (SELECT org_id FROM _doomed_orgs)
       OR fornecedor_org_id IN (SELECT org_id FROM _doomed_orgs);
  ELSE
    DELETE FROM public.skus
    WHERE org_id IN (SELECT org_id FROM _doomed_orgs);
  END IF;
END
$sku$;

DELETE FROM public.fornecedor_invites
WHERE org_id IN (SELECT org_id FROM _doomed_orgs)
   OR fornecedor_id IN (
     SELECT id FROM public.fornecedores WHERE org_id IN (SELECT org_id FROM _doomed_orgs)
   );

DELETE FROM public.org_members
WHERE org_id IN (SELECT org_id FROM _doomed_orgs);

DELETE FROM public.sellers
WHERE org_id IN (SELECT org_id FROM _doomed_orgs);

DELETE FROM public.fornecedores
WHERE org_id IN (SELECT org_id FROM _doomed_orgs);

DELETE FROM public.orgs
WHERE id IN (SELECT org_id FROM _doomed_orgs);

DROP TABLE _doomed_orgs;
DROP TABLE _keep_orgs;
DROP TABLE _keep_nome;

COMMIT;
