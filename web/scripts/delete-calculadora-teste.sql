-- =============================================================================
-- DropCore Calculadora — Zerar convites e assinaturas (dados de teste)
--
-- Apaga TODAS as linhas em calculadora_invites e calculadora_assinantes.
-- Convites novos: gere de novo no admin da calculadora.
--
-- Só executa se as tabelas existirem.
-- =============================================================================

BEGIN;

DO $c$
BEGIN
  IF to_regclass('public.calculadora_invites') IS NOT NULL THEN
    DELETE FROM public.calculadora_invites;
  END IF;
  IF to_regclass('public.calculadora_assinantes') IS NOT NULL THEN
    DELETE FROM public.calculadora_assinantes;
  END IF;
END
$c$;

COMMIT;
