-- Campos estruturados do formulário completo (9 etapas) no SKU pai.
-- Guarda modelo, características, qualidade, dados guiados e logística complementar.

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS detalhes_produto_json jsonb;

COMMENT ON COLUMN public.skus.detalhes_produto_json IS
  'JSON com detalhes completos do produto (modelo, caracteristicas, qualidade, midia complementar, guiado e logistica), preenchidos pelo fornecedor.';
