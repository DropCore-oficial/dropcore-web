-- Notificações in-app para seller e admin (ex: depósito PIX aprovado)
-- Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text,
  metadata jsonb DEFAULT '{}',
  lido boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_lido ON public.notifications(user_id, lido);
CREATE INDEX IF NOT EXISTS idx_notifications_criado ON public.notifications(criado_em DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications (marcar lido)"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role pode inserir (webhook)
COMMENT ON TABLE public.notifications IS 'Notificações in-app (depósito aprovado, etc.)';
