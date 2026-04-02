-- Adiciona coluna descricao na tabela skus
-- Execute no Supabase SQL Editor.

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS descricao text;

COMMENT ON COLUMN public.skus.descricao IS 'Descrição do produto para anúncios';
