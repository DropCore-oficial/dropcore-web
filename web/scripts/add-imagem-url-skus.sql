-- Adiciona coluna imagem_url na tabela skus (uma foto por variação, estilo UpSeller)
-- Execute no Supabase SQL Editor.

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS imagem_url text;

COMMENT ON COLUMN public.skus.imagem_url IS 'URL da foto principal da variação (Supabase Storage ou link externo)';
