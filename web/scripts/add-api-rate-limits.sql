-- Controle simples de rate limit por minuto (IP / API key)
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route text NOT NULL,
  key_type text NOT NULL CHECK (key_type IN ('ip', 'api_key')),
  key_value text NOT NULL,
  bucket_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_rate_limits_unique_bucket
  ON public.api_rate_limits (route, key_type, key_value, bucket_start);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_updated_at
  ON public.api_rate_limits (updated_at DESC);

-- Limpeza opcional (manual): apagar buckets antigos (> 2 dias)
-- DELETE FROM public.api_rate_limits WHERE bucket_start < now() - interval '2 days';

