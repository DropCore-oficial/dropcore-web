-- Adiciona coluna para link das fotos do produto na tabela skus
-- Execute no Supabase SQL Editor.

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS link_fotos text;

COMMENT ON COLUMN public.skus.link_fotos IS 'URL ou URLs separadas por vírgula/newline com fotos do produto (ex: link do Google Drive, Dropbox, etc.)';
