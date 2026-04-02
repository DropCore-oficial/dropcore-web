-- Adiciona campos separados de dimensões do pacote (comprimento, largura, altura em cm)
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS comprimento_cm numeric,
  ADD COLUMN IF NOT EXISTS largura_cm numeric,
  ADD COLUMN IF NOT EXISTS altura_cm numeric;

COMMENT ON COLUMN public.skus.comprimento_cm IS 'Comprimento do pacote em cm';
COMMENT ON COLUMN public.skus.largura_cm IS 'Largura do pacote em cm';
COMMENT ON COLUMN public.skus.altura_cm IS 'Altura do pacote em cm';
