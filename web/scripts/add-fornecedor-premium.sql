-- Fornecedores Premium (bloqueado no plano Starter; liberado no Pro)
-- Execute no Supabase SQL Editor.

ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS premium boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_fornecedores_premium
ON public.fornecedores(premium)
WHERE premium = true;

COMMENT ON COLUMN public.fornecedores.premium IS 'Se true: fornecedor premium (acesso só para orgs plano pro).';

