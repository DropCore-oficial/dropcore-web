-- Expedição / CD: endereço fiscal do fornecedor ≠ origem de despacho.
-- Rode no SQL Editor do Supabase (projeto DropCore).

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS expedicao_padrao_linha text;

COMMENT ON COLUMN public.fornecedores.expedicao_padrao_linha IS
  'Opcional. Texto livre do CD/despacho padrão para todos os produtos (ex.: CD Goiânia GO + endereço completo).';

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS expedicao_override_linha text;

COMMENT ON COLUMN public.skus.expedicao_override_linha IS
  'Opcional. Despacho deste SKU quando difere do expedicao_padrao_linha do fornecedor.';
