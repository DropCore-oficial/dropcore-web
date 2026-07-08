-- Qual lado (seller ou fornecedor) precisa agir para desbloquear um pedido "bloqueado".
-- Sem isso, o outro lado via a mesma instrução (ex.: "ative a cor no catálogo... plano Start")
-- mesmo quando não é ele quem pode fazer isso. Execute no Supabase SQL Editor.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS motivo_bloqueio_responsavel text
  CHECK (motivo_bloqueio_responsavel IN ('seller', 'fornecedor'));

COMMENT ON COLUMN public.pedidos.motivo_bloqueio_responsavel IS
  'Quem consegue agir para desbloquear (status=bloqueado): seller ou fornecedor. O outro lado vê um texto genérico em vez do motivo_bloqueio completo.';
