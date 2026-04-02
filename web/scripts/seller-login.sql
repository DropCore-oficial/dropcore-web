-- =============================================================================
-- DropCore — Login do Seller (B1: convite por link)
-- Execute no SQL Editor do Supabase.
-- =============================================================================

-- 1. Adiciona user_id na tabela sellers (vincula ao Supabase Auth)
ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_user_id
  ON public.sellers(user_id)
  WHERE user_id IS NOT NULL;

-- 2. Tabela de convites
CREATE TABLE IF NOT EXISTS public.seller_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  seller_id   uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  usado       boolean NOT NULL DEFAULT false,
  expira_em   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_invites_token    ON public.seller_invites(token);
CREATE INDEX IF NOT EXISTS idx_seller_invites_seller   ON public.seller_invites(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_invites_org      ON public.seller_invites(org_id);

COMMENT ON TABLE public.seller_invites IS
  'Tokens de convite para sellers criarem login. Expira em 7 dias. Uso único.';
