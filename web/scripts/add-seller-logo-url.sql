-- Logo pública do seller (mesmo bucket que fornecedor: produto-imagens, caminho {seller_id}/brand/).
-- Execute no SQL Editor do Supabase se a coluna ainda não existir.

ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.sellers.logo_url IS 'URL pública da logo/marca — bucket produto-imagens, pasta {seller_id}/brand/';
