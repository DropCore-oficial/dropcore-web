-- Víncio seller ↔ fornecedor: data de início + liberação antecipada (infração / acordo)
-- Execute no SQL Editor do Supabase após seller-fornecedor-id.sql

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS fornecedor_vinculado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS fornecedor_desvinculo_liberado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sellers.fornecedor_vinculado_em IS 'Quando o fornecedor_id atual foi associado; usado para exigir 3 meses antes de trocar.';
COMMENT ON COLUMN public.sellers.fornecedor_desvinculo_liberado IS 'Admin: permite troca/remoção antes do prazo (ex.: infração comprovada do armazém).';

-- Quem já tinha fornecedor: considerar víncio desde a criação do seller (retrocompatível)
UPDATE public.sellers
SET fornecedor_vinculado_em = COALESCE(criado_em::timestamptz, now())
WHERE fornecedor_id IS NOT NULL
  AND fornecedor_vinculado_em IS NULL;
