-- =============================================================================
-- APAGAR UTILIZADOR AUTH POR E-MAIL (para voltar a usar o e-mail num convite)
-- =============================================================================
-- AVISO: Remove a CONTA DE LOGIN no Supabase Auth para esse e-mail.
-- Se for a mesma conta de admin org / fornecedor / calculadora, perde acesso a tudo.
-- Correr no Supabase → SQL Editor. Altera só o e-mail na variável abaixo.
-- =============================================================================

DO $$
DECLARE
  target_email text := 'oficial.galileus@gmail.com';  -- <-- troca aqui se for outro
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(target_email) LIMIT 1;

  IF uid IS NULL THEN
    RAISE NOTICE 'Nenhum utilizador em auth.users com o e-mail: %', target_email;
    RETURN;
  END IF;

  -- Desvincula qualquer seller que ainda aponte para este user
  UPDATE public.sellers
  SET user_id = NULL, atualizado_em = now()
  WHERE user_id = uid;

  DELETE FROM auth.identities WHERE user_id = uid;

  DELETE FROM auth.users WHERE id = uid;

  RAISE NOTICE 'Utilizador removido (id: %). Podes criar de novo o convite com o mesmo e-mail.', uid;
END $$;
