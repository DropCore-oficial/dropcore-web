-- Adiciona o status 'aguardando_repasse' à constraint de pedidos
-- Execute no Supabase SQL Editor.

-- Remove a constraint antiga e cria uma nova com o novo status
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS chk_pedidos_status;

ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_status_check CHECK (status IN (
    'enviado',            -- bloqueio feito, aguardando o fornecedor postar
    'aguardando_repasse', -- fornecedor postou, entra no ciclo de repasse
    'entregue',           -- cliente confirmou recebimento
    'devolvido',          -- devolvido (antes ou após repasse)
    'cancelado',          -- cancelado/estornado
    'erro_saldo'          -- falhou por saldo insuficiente
  ));
