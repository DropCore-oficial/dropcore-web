-- Corrige duas race conditions achadas na auditoria de backend do fornecedor (2026-10-13):
-- 1) SKU duplicado: produtos/route.ts, multivariante/route.ts e grupo-adicionar-variantes/route.ts
--    geram o próximo código de SKU lendo o máximo existente e só depois inserindo, sem lock.
--    Duplo clique (ou duas abas) pode criar dois SKUs com o mesmo código no mesmo org_id.
-- 2) PIX de mensalidade duplicado: cobranca-pix/route.ts só confere status==pendente antes de
--    chamar o Mercado Pago, sem claim atômico. Duplo clique gera duas cobranças PIX reais pra
--    mesma mensalidade.
--
-- Confirmado antes de rodar: skus hoje não tem nenhum (org_id, sku) duplicado (272 linhas, 272
-- distintos) — o índice único entra sem conflito. financial_mensalidades.cobranca_pix_iniciada_em
-- é coluna nova, nullable, sem default — aditiva, não quebra leitura existente (projeto não usa
-- SELECT *).

CREATE UNIQUE INDEX IF NOT EXISTS ux_skus_org_sku ON skus (org_id, sku);

ALTER TABLE financial_mensalidades
  ADD COLUMN IF NOT EXISTS cobranca_pix_iniciada_em timestamptz;
