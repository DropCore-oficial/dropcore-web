-- Status "bloqueado" + motivo para pedidos recusados por regra de negócio
-- (cor não habilitada no plano, seller/fornecedor inadimplente, despacho misto,
-- valor inválido) — antes esses casos não geravam nenhuma linha em `pedidos` e a
-- venda real simplesmente sumia. Execute no Supabase SQL Editor.

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
    'pendente_estoque',
    'bloqueado'
  ));

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS motivo_bloqueio text;

COMMENT ON COLUMN public.pedidos.motivo_bloqueio IS
  'Motivo legível (mesma mensagem mostrada ao seller) quando status = bloqueado.';
