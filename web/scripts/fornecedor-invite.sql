-- =============================================================================
-- DropCore — Convite para Fornecedor (criar login via link)
-- Execute no SQL Editor do Supabase.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.fornecedor_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  usado         boolean NOT NULL DEFAULT false,
  expira_em     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedor_invites_token ON public.fornecedor_invites(token);
CREATE INDEX IF NOT EXISTS idx_fornecedor_invites_fornecedor ON public.fornecedor_invites(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_fornecedor_invites_org ON public.fornecedor_invites(org_id);

COMMENT ON TABLE public.fornecedor_invites IS
  'Tokens de convite para fornecedores criarem login. Expira em 7 dias. Uso único.';
