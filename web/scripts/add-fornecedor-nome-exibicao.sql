-- Nome público para sellers (evita expor razão social completa na lista / select)
-- Execute no SQL Editor do Supabase

ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS nome_exibicao text NULL;

COMMENT ON COLUMN public.fornecedores.nome_exibicao IS 'Nome curto ou fantasia mostrado ao seller na lista de armazéns; se vazio, usa nome (razão social).';
