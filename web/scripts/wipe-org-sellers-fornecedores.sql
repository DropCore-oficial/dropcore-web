-- =============================================================================
-- DropCore — ZERAR sellers, fornecedores e dados ligados (UMA org)
--
-- PERIGO: irreversível. Use só se for lixo de teste / reset controlado.
-- Antes: exporte backup ou duplique o projeto no Supabase se tiver dúvida.
--
-- O que MANTÉM:
--   - Linha em public.orgs (sua empresa)
--   - UMA linha em public.org_members (seu user_id como owner)
--
-- O que APAGA (escopo org_id):
--   - Pedidos + itens, ledger, ciclos/repasse fornecedor, débitos, mensalidades,
--     depósitos PIX, movimentações, convites seller/fornecedor, SKUs, tabela
--     medidas, alterações SKU (se existir), Bling/ERP logs ligados aos sellers,
--     notifications dos usuários que saem da org, sellers, fornecedores,
--     demais org_members (exceto você).
--   - calculadora_invites + calculadora_assinantes (tudo; recria convites pelo admin).
--
-- CONFIGURAÇÃO (obrigatório):
--   1) org_id: Table Editor → orgs → id da sua empresa
--   2) user_id do OWNER que fica: org_members → sua linha → user_id
--
-- ANTES DE RODAR: Buscar e substituir em TODO o arquivo (Ctrl/Cmd+H no editor):
--   11111111-1111-4111-8111-111111111111  →  SEU org_id
--   22222222-2222-4222-8222-222222222222  →  SEU user_id (owner)
--
-- Rode no Supabase SQL Editor de uma vez. Tabelas opcionais (Bling, ERP, etc.)
-- são ignoradas se não existirem.
-- =============================================================================

BEGIN;

DO $opt$
DECLARE
  v_org uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  v_owner uuid := '22222222-2222-4222-8222-222222222222'::uuid;
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE user_id IN (
      SELECT om.user_id
      FROM public.org_members om
      WHERE om.org_id = v_org
        AND om.user_id IS DISTINCT FROM v_owner
    );
  END IF;
  IF to_regclass('public.erp_event_logs') IS NOT NULL THEN
    DELETE FROM public.erp_event_logs WHERE org_id = v_org;
  END IF;
  IF to_regclass('public.bling_webhook_logs') IS NOT NULL THEN
    DELETE FROM public.bling_webhook_logs
    WHERE seller_id IN (SELECT id FROM public.sellers WHERE org_id = v_org);
  END IF;
  IF to_regclass('public.seller_bling_integrations') IS NOT NULL THEN
    DELETE FROM public.seller_bling_integrations
    WHERE seller_id IN (SELECT id FROM public.sellers WHERE org_id = v_org);
  END IF;
  IF to_regclass('public.financial_debito_descontar') IS NOT NULL THEN
    DELETE FROM public.financial_debito_descontar WHERE org_id = v_org;
  END IF;
END
$opt$;

-- Pedidos
DELETE FROM public.pedido_itens
WHERE pedido_id IN (SELECT id FROM public.pedidos WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid);

DELETE FROM public.pedidos
WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid;

-- Financeiro (ordem: ledger → resto; débitos já acima se existir)

DELETE FROM public.financial_ledger
WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid;

DELETE FROM public.financial_mensalidades
WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid;

DELETE FROM public.financial_repasse_fornecedor
WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid;

DELETE FROM public.financial_ciclos_repasse
WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid;

-- Seller: depósitos, movimentações, convites
DELETE FROM public.seller_depositos_pix
WHERE seller_id IN (SELECT id FROM public.sellers WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid);

DELETE FROM public.seller_movimentacoes
WHERE seller_id IN (SELECT id FROM public.sellers WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid);

DELETE FROM public.seller_invites
WHERE seller_id IN (SELECT id FROM public.sellers WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid);

-- Catálogo / fornecedor (tabelas opcionais)
DO $opt2$
DECLARE v_org uuid := '11111111-1111-4111-8111-111111111111'::uuid;
BEGIN
  IF to_regclass('public.sku_alteracoes_pendentes') IS NOT NULL THEN
    DELETE FROM public.sku_alteracoes_pendentes
    WHERE fornecedor_id IN (SELECT id FROM public.fornecedores WHERE org_id = v_org);
  END IF;
  IF to_regclass('public.produto_tabela_medidas') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'org_id'
    ) THEN
      DELETE FROM public.produto_tabela_medidas WHERE org_id = v_org;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'fornecedor_id'
    ) THEN
      DELETE FROM public.produto_tabela_medidas
      WHERE fornecedor_id IN (SELECT id FROM public.fornecedores WHERE org_id = v_org);
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'grupo_sku'
    ) THEN
      DELETE FROM public.produto_tabela_medidas ptm
      WHERE EXISTS (
        SELECT 1 FROM public.skus s
        WHERE s.org_id = v_org
          AND trim(COALESCE(s.sku, '')) ~ '^[A-Za-z]+[0-9]{6}([^0-9].*)?$'
          AND upper(regexp_replace(trim(s.sku), '^([A-Za-z]+[0-9]{3})[0-9]{3}([^0-9].*)?$', '\1') || '000')
             = upper(trim(ptm.grupo_sku))
      );
    END IF;
  END IF;
END
$opt2$;

DO $sku$
DECLARE v_org uuid := '11111111-1111-4111-8111-111111111111'::uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'skus' AND column_name = 'fornecedor_org_id'
  ) THEN
    DELETE FROM public.skus
    WHERE org_id = v_org OR fornecedor_org_id = v_org;
  ELSE
    DELETE FROM public.skus WHERE org_id = v_org;
  END IF;
END
$sku$;

DELETE FROM public.fornecedor_invites
WHERE fornecedor_id IN (SELECT id FROM public.fornecedores WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid);

-- Rate limit (opcional; tabela pode não existir — comente se der erro)
-- DELETE FROM public.api_rate_limits WHERE route LIKE '%';

-- Membros: só você
DELETE FROM public.org_members
WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid
  AND user_id IS DISTINCT FROM '22222222-2222-4222-8222-222222222222'::uuid;

UPDATE public.org_members
SET seller_id = NULL, fornecedor_id = NULL
WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid
  AND user_id = '22222222-2222-4222-8222-222222222222'::uuid;

-- Entidades principais
DELETE FROM public.sellers
WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid;

DELETE FROM public.fornecedores
WHERE org_id = '11111111-1111-4111-8111-111111111111'::uuid;

-- DropCore Calculadora (testes — convites e assinaturas do zero)
DELETE FROM public.calculadora_invites;
DELETE FROM public.calculadora_assinantes;

COMMIT;
