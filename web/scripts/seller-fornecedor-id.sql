-- Adiciona fornecedor_id na tabela sellers (conexão seller ↔ fornecedor)
-- Execute no SQL Editor do Supabase

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sellers_fornecedor_id ON public.sellers(fornecedor_id);

COMMENT ON COLUMN public.sellers.fornecedor_id IS 'Fornecedor conectado ao seller (ex: Djulios). Usado na calculadora para pré-selecionar produtos.';

-- Em seguida rode seller-fornecedor-vinculo-minimo.sql (compromisso de 3 meses + liberação antecipada).
