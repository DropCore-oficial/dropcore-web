-- Cadastro da empresa (fornecedor): CNPJ e contatos
-- Execute no SQL Editor do Supabase

ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS cnpj text,
ADD COLUMN IF NOT EXISTS telefone text,
ADD COLUMN IF NOT EXISTS email_comercial text;

COMMENT ON COLUMN public.fornecedores.cnpj IS 'CNPJ (apenas dígitos ou formatado; app normaliza)';
COMMENT ON COLUMN public.fornecedores.telefone IS 'Telefone comercial / WhatsApp';
COMMENT ON COLUMN public.fornecedores.email_comercial IS 'E-mail comercial da empresa';
