-- Adiciona todas as colunas extras na tabela sellers
-- Execute no SQL Editor do Supabase

-- Colunas de contato e endereço
ALTER TABLE public.sellers 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS telefone text,
ADD COLUMN IF NOT EXISTS cep text,
ADD COLUMN IF NOT EXISTS endereco text,
ADD COLUMN IF NOT EXISTS nome_responsavel text,
ADD COLUMN IF NOT EXISTS cpf_responsavel text,
ADD COLUMN IF NOT EXISTS data_nascimento date;

-- Colunas bancárias
ALTER TABLE public.sellers 
ADD COLUMN IF NOT EXISTS nome_banco text,
ADD COLUMN IF NOT EXISTS nome_no_banco text,
ADD COLUMN IF NOT EXISTS agencia text,
ADD COLUMN IF NOT EXISTS conta text,
ADD COLUMN IF NOT EXISTS tipo_conta text;

-- Comentários para documentação
COMMENT ON COLUMN public.sellers.email IS 'E-mail de contato do seller';
COMMENT ON COLUMN public.sellers.telefone IS 'Telefone celular do seller';
COMMENT ON COLUMN public.sellers.cep IS 'CEP do endereço da loja';
COMMENT ON COLUMN public.sellers.endereco IS 'Endereço completo da loja (preenchido automaticamente pelo CEP)';
COMMENT ON COLUMN public.sellers.nome_responsavel IS 'Nome do responsável pelo seller';
COMMENT ON COLUMN public.sellers.cpf_responsavel IS 'CPF do responsável pelo seller';
COMMENT ON COLUMN public.sellers.data_nascimento IS 'Data de nascimento do responsável';
COMMENT ON COLUMN public.sellers.nome_banco IS 'Nome do banco para repasse';
COMMENT ON COLUMN public.sellers.nome_no_banco IS 'Nome registrado no banco';
COMMENT ON COLUMN public.sellers.agencia IS 'Agência bancária';
COMMENT ON COLUMN public.sellers.conta IS 'Número da conta bancária';
COMMENT ON COLUMN public.sellers.tipo_conta IS 'Tipo de conta (Corrente ou Poupança)';
