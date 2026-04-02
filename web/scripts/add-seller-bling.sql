-- Integração Bling (vínculo seller ↔ companyId + log de webhooks)
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.seller_bling_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers (id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  bling_company_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_bling_integrations_seller_unique UNIQUE (seller_id),
  CONSTRAINT seller_bling_integrations_company_unique UNIQUE (bling_company_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_bling_integrations_org
  ON public.seller_bling_integrations (org_id);

CREATE TABLE IF NOT EXISTS public.bling_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.sellers (id) ON DELETE SET NULL,
  org_id uuid,
  bling_event_id text,
  company_id text,
  event_type text,
  payload jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bling_webhook_logs_seller_criado
  ON public.bling_webhook_logs (seller_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_bling_webhook_logs_company_criado
  ON public.bling_webhook_logs (company_id, criado_em DESC);
