-- Reprecificação do plano Pro (147,90 -> 197,90) + add-on "Gestores de IA" (Diogo/Andrey/
-- Amanda/Ulisses + futuros gestores), vendável em Start (+700) e Pro (+600).
-- Execute no Supabase SQL Editor.

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS mensalidade_valor_travado numeric NULL,
  ADD COLUMN IF NOT EXISTS gestores_ia_addon_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gestores_ia_addon_ativado_em timestamptz NULL;

COMMENT ON COLUMN public.sellers.mensalidade_valor_travado IS
  'Preço da mensalidade travado pra esse seller (ignora financial_planos.valor_seller nesse ciclo). Usado pra grandfathering quando o preço do plano muda.';
COMMENT ON COLUMN public.sellers.gestores_ia_addon_ativo IS
  'Add-on "Gestores de IA" ativo (libera Diogo/Andrey/Amanda; Ulisses já é liberado pro Pro de graça). +R$700/mês no Start, +R$600/mês no Pro.';
COMMENT ON COLUMN public.sellers.gestores_ia_addon_ativado_em IS
  'Quando o add-on Gestores de IA foi ativado (auditoria/histórico, não usado em cálculo).';

-- Trava os sellers que já pagam Pro hoje no valor atual, pra não pularem pro novo preço.
UPDATE public.sellers
  SET mensalidade_valor_travado = 147.90
  WHERE lower(trim(plano)) = 'pro' AND mensalidade_valor_travado IS NULL;

UPDATE public.financial_planos SET valor_seller = 197.90 WHERE plano = 'Pro';
