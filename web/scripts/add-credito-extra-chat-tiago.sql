-- Crédito extra do chat do Tiago Silva (Gestor Mestre) — comprável via PIX quando a cota
-- diária (R$4/dia, ver TETO_CHAT_TIAGO_REAIS_DIA) esgota. Reaproveita seller_depositos_pix
-- (mesmo padrão do add-on "Gestores de IA") — não cria tabela nova.
-- Execute no Supabase SQL Editor.

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS gestor_mestre_chat_credito_extra_reais numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gestor_mestre_chat_credito_extra_dia_ref date NULL;

COMMENT ON COLUMN public.sellers.gestor_mestre_chat_credito_extra_reais IS
  'Crédito extra (R$ de uso liberado, já descontada a margem de 100%) comprado via PIX quando a cota diária do chat do Tiago Silva esgota. Só vale no dia de gestor_mestre_chat_credito_extra_dia_ref — não acumula pro dia seguinte.';
COMMENT ON COLUMN public.sellers.gestor_mestre_chat_credito_extra_dia_ref IS
  'Dia (BRT) em que o crédito extra foi comprado — se for diferente do dia atual, o crédito é tratado como zerado (expirado).';
