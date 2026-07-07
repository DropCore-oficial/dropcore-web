-- Status pendente_estoque + dados do comprador/marketplace no pedido
-- Execute no Supabase SQL Editor.

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS chk_pedidos_status;

ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_status_check CHECK (status IN (
    'enviado',
    'aguardando_repasse',
    'entregue',
    'devolvido',
    'cancelado',
    'erro_saldo',
    'pendente_estoque'
  ));

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS marketplace_numero text;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS comprador_nome text;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS comprador_cidade text;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS comprador_uf text;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS comprador_fone text;

COMMENT ON COLUMN public.pedidos.marketplace_numero IS 'Número do pedido no marketplace (ex.: Shopee), vindo da Olist.';
COMMENT ON COLUMN public.pedidos.comprador_nome IS 'Nome do comprador/destinatário (import Olist).';
COMMENT ON COLUMN public.pedidos.comprador_cidade IS 'Cidade de entrega do comprador.';
COMMENT ON COLUMN public.pedidos.comprador_uf IS 'UF de entrega do comprador.';
COMMENT ON COLUMN public.pedidos.comprador_fone IS 'Telefone do comprador.';
