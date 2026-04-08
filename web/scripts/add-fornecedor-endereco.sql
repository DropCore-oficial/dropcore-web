-- Endereço da empresa do fornecedor (autopreenchimento via CNPJ)
-- Execute no SQL Editor do Supabase

ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS endereco_cep text,
ADD COLUMN IF NOT EXISTS endereco_logradouro text,
ADD COLUMN IF NOT EXISTS endereco_numero text,
ADD COLUMN IF NOT EXISTS endereco_complemento text,
ADD COLUMN IF NOT EXISTS endereco_bairro text,
ADD COLUMN IF NOT EXISTS endereco_cidade text,
ADD COLUMN IF NOT EXISTS endereco_uf text;

COMMENT ON COLUMN public.fornecedores.endereco_cep IS 'CEP da empresa (somente dígitos)';
COMMENT ON COLUMN public.fornecedores.endereco_logradouro IS 'Logradouro da empresa';
COMMENT ON COLUMN public.fornecedores.endereco_numero IS 'Número do endereço';
COMMENT ON COLUMN public.fornecedores.endereco_complemento IS 'Complemento do endereço';
COMMENT ON COLUMN public.fornecedores.endereco_bairro IS 'Bairro da empresa';
COMMENT ON COLUMN public.fornecedores.endereco_cidade IS 'Cidade da empresa';
COMMENT ON COLUMN public.fornecedores.endereco_uf IS 'UF da empresa (2 letras)';
