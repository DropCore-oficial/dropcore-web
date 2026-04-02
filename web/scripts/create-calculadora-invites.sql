-- =============================================================================
-- DropCore Calculadora — Convites de assinatura
-- Execute no SQL Editor do Supabase.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.calculadora_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  email_alvo      text,
  validade_dias   integer NOT NULL DEFAULT 30 CHECK (validade_dias > 0),
  expira_em       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  usado           boolean NOT NULL DEFAULT false,
  usado_em        timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calculadora_invites_token ON public.calculadora_invites(token);
CREATE INDEX IF NOT EXISTS idx_calculadora_invites_email ON public.calculadora_invites(email_alvo);

COMMENT ON TABLE public.calculadora_invites IS
  'Convites para criar conta de acesso apenas à calculadora.';

-- Exemplo de criação manual de convite (30 dias)
-- INSERT INTO public.calculadora_invites (email_alvo, validade_dias)
-- VALUES ('cliente@exemplo.com', 30)
-- RETURNING token, expira_em;
