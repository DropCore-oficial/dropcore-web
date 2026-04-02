-- Plano da org: starter (limite 50 SKUs) ou pro (ilimitado)
-- Execute no Supabase SQL Editor.

ALTER TABLE public.orgs
ADD COLUMN IF NOT EXISTS plano text NOT NULL DEFAULT 'starter'
CHECK (plano IN ('starter', 'pro'));

COMMENT ON COLUMN public.orgs.plano IS 'Plano da organização: starter (50 SKUs máx) ou pro (ilimitado).';
