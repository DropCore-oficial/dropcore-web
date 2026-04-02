-- Campos fiscais para NF-e (Info. de impostos)
-- Execute no Supabase SQL Editor.

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS ncm text,
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS cest text,
  ADD COLUMN IF NOT EXISTS cfop text,
  ADD COLUMN IF NOT EXISTS peso_liquido_kg numeric,
  ADD COLUMN IF NOT EXISTS peso_bruto_kg numeric;

COMMENT ON COLUMN public.skus.ncm IS 'Nomenclatura Comum do Mercosul';
COMMENT ON COLUMN public.skus.origem IS 'Origem da mercadoria (0=nacional, 1=estrangeira importação direta, etc.)';
COMMENT ON COLUMN public.skus.cest IS 'Código Específico da Substituição Tributária';
COMMENT ON COLUMN public.skus.cfop IS 'Código Fiscal de Operações e Prestações';
COMMENT ON COLUMN public.skus.peso_liquido_kg IS 'Peso líquido em kg para NF-e';
COMMENT ON COLUMN public.skus.peso_bruto_kg IS 'Peso bruto em kg para NF-e';
