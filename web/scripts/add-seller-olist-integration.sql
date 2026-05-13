-- Integração Olist/Tiny por seller (token API V2 criptografado no servidor).
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.seller_olist_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL UNIQUE REFERENCES public.sellers(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  olist_token_ciphertext text,
  olist_token_prefix text,
  olist_account_name text,
  olist_token_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_olist_integrations_org_id
  ON public.seller_olist_integrations(org_id);

COMMENT ON TABLE public.seller_olist_integrations IS 'Token API Olist/Tiny por seller (ciphertext no servidor).';
COMMENT ON COLUMN public.seller_olist_integrations.olist_token_ciphertext IS 'Token criptografado (AES-GCM) para chamadas outbound à API Olist.';
COMMENT ON COLUMN public.seller_olist_integrations.olist_token_prefix IS 'Prefixo mascarado do token para exibição na UI.';
