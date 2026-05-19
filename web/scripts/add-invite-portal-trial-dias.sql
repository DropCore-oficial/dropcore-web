-- Dias de teste grátis do painel definidos por convite (como calculadora_invites.validade_dias).
-- Execute no SQL Editor do Supabase após deploy.

ALTER TABLE public.seller_invites
  ADD COLUMN IF NOT EXISTS portal_trial_dias integer NOT NULL DEFAULT 7;

COMMENT ON COLUMN public.seller_invites.portal_trial_dias IS
  'Dias de teste grátis do portal ao aceitar o convite (0 = sem período).';

ALTER TABLE public.fornecedor_invites
  ADD COLUMN IF NOT EXISTS portal_trial_dias integer NOT NULL DEFAULT 7;

COMMENT ON COLUMN public.fornecedor_invites.portal_trial_dias IS
  'Dias de teste grátis do portal ao aceitar o convite (0 = sem período).';
