-- Controle de retry da busca de etiqueta real (Olist) em pedidos.
-- Usado por: web/lib/etiquetaOlistRetry.ts (cron /api/cron/etiqueta-olist-retry).
--
-- Hoje a etiqueta real só é buscada uma vez, no momento da importação/promoção do
-- pedido (web/lib/sellerOlistPedidoImport.ts). Se a Olist ainda não tiver gerado a
-- expedição nesse instante, a tentativa falha e nunca mais é repetida. Estas colunas
-- dão suporte a um retry dedicado que insiste até conseguir, e alertam o time uma
-- única vez se continuar falhando.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS etiqueta_tentativas int NOT NULL DEFAULT 0;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS etiqueta_ultima_tentativa_em timestamptz;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS etiqueta_alerta_enviado_em timestamptz;

COMMENT ON COLUMN public.pedidos.etiqueta_tentativas IS 'Quantas vezes o cron de retry tentou buscar a etiqueta real na Olist sem sucesso.';
COMMENT ON COLUMN public.pedidos.etiqueta_ultima_tentativa_em IS 'Timestamp da última tentativa do cron de retry de etiqueta.';
COMMENT ON COLUMN public.pedidos.etiqueta_alerta_enviado_em IS 'Quando a notificação de "etiqueta não chegou" foi disparada pros admins da org — evita alertar de novo a cada execução do cron.';

-- Acelera a query do cron: pedidos ainda sem etiqueta real, aguardando envio.
CREATE INDEX IF NOT EXISTS idx_pedidos_etiqueta_pendente
  ON public.pedidos(status)
  WHERE etiqueta_pdf_url IS NULL AND etiqueta_pdf_base64 IS NULL;
