-- Teste grátis do painel seller/fornecedor (dias definidos por PORTAL_TRIAL_DAYS no deploy, padrão 7).
-- Rode no SQL Editor do Supabase.

ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS trial_valido_ate timestamptz NULL;
ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS trial_valido_ate timestamptz NULL;

COMMENT ON COLUMN public.sellers.trial_valido_ate IS 'Até quando o teste grátis isenta bloqueio por mensalidade vencida.';
COMMENT ON COLUMN public.fornecedores.trial_valido_ate IS 'Até quando o teste grátis isenta bloqueio por mensalidade vencida.';
