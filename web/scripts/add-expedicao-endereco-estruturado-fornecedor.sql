-- Endereço estruturado de despacho / CD padrão (paralelo a endereco_* da sede fiscal).
-- Rode no SQL Editor do Supabase após add-expedicao-padrao-fornecedor-e-sku.sql.

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS expedicao_cep text,
  ADD COLUMN IF NOT EXISTS expedicao_logradouro text,
  ADD COLUMN IF NOT EXISTS expedicao_numero text,
  ADD COLUMN IF NOT EXISTS expedicao_complemento text,
  ADD COLUMN IF NOT EXISTS expedicao_bairro text,
  ADD COLUMN IF NOT EXISTS expedicao_cidade text,
  ADD COLUMN IF NOT EXISTS expedicao_uf text;

COMMENT ON COLUMN public.fornecedores.expedicao_cep IS 'CEP do CD/despacho padrão (opcional; sede em endereco_cep).';
COMMENT ON COLUMN public.fornecedores.expedicao_logradouro IS 'Logradouro do CD/despacho padrão.';
COMMENT ON COLUMN public.fornecedores.expedicao_numero IS 'Número do CD/despacho padrão.';
COMMENT ON COLUMN public.fornecedores.expedicao_complemento IS 'Complemento do CD/despacho padrão.';
COMMENT ON COLUMN public.fornecedores.expedicao_bairro IS 'Bairro do CD/despacho padrão.';
COMMENT ON COLUMN public.fornecedores.expedicao_cidade IS 'Cidade do CD/despacho padrão.';
COMMENT ON COLUMN public.fornecedores.expedicao_uf IS 'UF do CD/despacho padrão (2 letras).';
