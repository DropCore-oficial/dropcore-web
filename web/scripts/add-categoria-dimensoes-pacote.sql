-- Adiciona categoria do produto e dimensões do pacote de envio (fornecedor)
-- Execute no SQL Editor do Supabase se as colunas ainda não existirem.

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS dimensoes_pacote text;

COMMENT ON COLUMN public.skus.categoria IS 'Categoria do produto (ex: Camiseta, Calça)';
COMMENT ON COLUMN public.skus.dimensoes_pacote IS 'Dimensões do pacote de envio (ex: 15x20x5 cm 250g)';
