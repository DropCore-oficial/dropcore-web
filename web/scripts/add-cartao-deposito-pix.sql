-- Adiciona suporte a recarga de crédito via cartão (além de PIX) em seller_depositos_pix,
-- e a taxa Mercado Pago repassada ao seller em ambos os métodos.
-- Rode no Supabase SQL Editor (produção).

ALTER TABLE seller_depositos_pix
  ADD COLUMN IF NOT EXISTS metodo text NOT NULL DEFAULT 'pix' CHECK (metodo IN ('pix','cartao')),
  ADD COLUMN IF NOT EXISTS parcelas integer NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS taxa_mp numeric NOT NULL DEFAULT 0 CHECK (taxa_mp >= 0),
  ADD COLUMN IF NOT EXISTS valor_cobrado numeric CHECK (valor_cobrado IS NULL OR valor_cobrado > 0),
  ADD COLUMN IF NOT EXISTS valor_liquido_mp numeric CHECK (valor_liquido_mp IS NULL OR valor_liquido_mp >= 0);

COMMENT ON COLUMN seller_depositos_pix.metodo IS 'Forma de pagamento da recarga: pix ou cartao.';
COMMENT ON COLUMN seller_depositos_pix.parcelas IS 'Número de parcelas (cartão). Sempre 1 para PIX.';
COMMENT ON COLUMN seller_depositos_pix.taxa_mp IS 'Taxa Mercado Pago repassada ao seller (estimada na cobrança), somada ao crédito em valor_cobrado.';
COMMENT ON COLUMN seller_depositos_pix.valor_cobrado IS 'Valor efetivamente cobrado (crédito + taxa) via PIX ou cartão.';
COMMENT ON COLUMN seller_depositos_pix.valor_liquido_mp IS 'Valor líquido real recebido conforme Mercado Pago, apurado após aprovação (auditoria — não altera o crédito do seller).';
