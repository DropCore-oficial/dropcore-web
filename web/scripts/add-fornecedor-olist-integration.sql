-- Integração Olist/Tiny por fornecedor (token API V2 criptografado no servidor).
-- Estoque: pull da Olist do fornecedor → skus no DropCore → push para sellers ligados.
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.fornecedor_olist_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL UNIQUE REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  olist_token_ciphertext text,
  olist_token_prefix text,
  olist_account_name text,
  olist_token_validated_at timestamptz,
  olist_last_estoque_sync_at timestamptz,
  olist_last_estoque_sync_status text,
  olist_last_estoque_sync_error text,
  olist_last_estoque_sync_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedor_olist_integrations_org_id
  ON public.fornecedor_olist_integrations(org_id);

COMMENT ON TABLE public.fornecedor_olist_integrations IS 'Token API Olist/Tiny por fornecedor — fonte de estoque no ERP do armazém.';
COMMENT ON COLUMN public.fornecedor_olist_integrations.olist_token_ciphertext IS 'Token criptografado (AES-GCM) para pull de estoque na Olist do fornecedor.';
COMMENT ON COLUMN public.fornecedor_olist_integrations.olist_last_estoque_sync_summary IS 'Resumo JSON: updated, unchanged, missing_olist, errors.';
