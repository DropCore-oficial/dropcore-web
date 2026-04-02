-- Adiciona colunas marca e data_lancamento na tabela skus (para Criar variantes estilo UpSeller)
ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS data_lancamento date;

COMMENT ON COLUMN public.skus.marca IS 'Marca do produto';
COMMENT ON COLUMN public.skus.data_lancamento IS 'Data de lançamento do produto/variante';
