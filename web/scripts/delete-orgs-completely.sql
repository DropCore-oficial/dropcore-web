-- =============================================================================
-- DropCore — APAGAR org(s) inteira(s): dados + org_members + linha em orgs
--
-- Use para remover orgs de teste (ex.: DJULIOS, Galileus). NÃO coloque aqui
-- o id da org que você quer manter (ex.: DropCore).
--
-- O script NÃO apaga usuários em auth.users — só vínculos e dados da org.
--
-- Antes de rodar:
--   SELECT id, nome FROM public.orgs ORDER BY nome;
-- Copie os UUIDs das orgs a remover e preencha INSERT abaixo (uma linha por org).
--
-- Para manter só uma org pelo nome (ex.: DropCore) e apagar todas as outras:
--   delete-all-orgs-except-nome.sql
--
-- Depois (opcional): para zerar dados de teste DENTRO da DropCore mantendo a org,
-- use wipe-org-sellers-fornecedores.sql com org_id DropCore + seu user_id owner.
--
-- Deletes opcionais (Bling, ERP, etc.) só rodam se a tabela existir.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _doomed_orgs (org_id uuid PRIMARY KEY);
-- ↓ Substitua pelos UUIDs reais (ex.: DJULIOS, Galileus). NUNCA inclua DropCore aqui.
INSERT INTO _doomed_orgs (org_id) VALUES
  ('11111111-1111-4111-8111-111111111111'::uuid),
  ('22222222-2222-4222-8222-222222222222'::uuid);

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

COMMIT;
