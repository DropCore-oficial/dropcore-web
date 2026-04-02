-- Dados bancários do fornecedor (para receber repasses)
-- Execute no SQL Editor do Supabase

ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS chave_pix text,
ADD COLUMN IF NOT EXISTS nome_banco text,
ADD COLUMN IF NOT EXISTS nome_no_banco text,
ADD COLUMN IF NOT EXISTS agencia text,
ADD COLUMN IF NOT EXISTS conta text,
ADD COLUMN IF NOT EXISTS tipo_conta text;

COMMENT ON COLUMN public.fornecedores.chave_pix IS 'Chave PIX para receber repasses';
COMMENT ON COLUMN public.fornecedores.nome_banco IS 'Nome do banco';
COMMENT ON COLUMN public.fornecedores.nome_no_banco IS 'Nome ou razão social no banco';
COMMENT ON COLUMN public.fornecedores.agencia IS 'Agência bancária';
COMMENT ON COLUMN public.fornecedores.conta IS 'Número da conta';
COMMENT ON COLUMN public.fornecedores.tipo_conta IS 'Corrente ou Poupança';
