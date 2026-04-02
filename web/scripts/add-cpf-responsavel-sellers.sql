-- Adiciona coluna cpf_responsavel na tabela sellers
-- Execute no SQL Editor do Supabase

ALTER TABLE public.sellers 
ADD COLUMN IF NOT EXISTS cpf_responsavel text;

COMMENT ON COLUMN public.sellers.cpf_responsavel IS 'CPF do responsável pelo seller';
