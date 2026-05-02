-- Logo da empresa no painel do fornecedor (URL pública no Storage)
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.fornecedores.logo_url IS 'URL pública da logo (miniatura) — bucket produto-imagens, pasta {fornecedor_id}/brand/';
