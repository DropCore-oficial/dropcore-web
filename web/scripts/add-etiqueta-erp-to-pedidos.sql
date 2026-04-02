-- Adiciona campos para armazenar a etiqueta oficial do marketplace/transportadora
-- Enviado pelo ERP no fluxo POST /api/erp/pedidos
--
-- Preferência: salvar URL do PDF (pequeno e leve). Base64 pode ser usado se não houver URL.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS etiqueta_pdf_url text;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS etiqueta_pdf_base64 text;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tracking_codigo text;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS metodo_envio text;

COMMENT ON COLUMN public.pedidos.etiqueta_pdf_url IS 'URL do PDF da etiqueta oficial (marketplace/transportadora).';
COMMENT ON COLUMN public.pedidos.etiqueta_pdf_base64 IS 'Base64 do PDF da etiqueta oficial (opcional, quando não há URL).';
COMMENT ON COLUMN public.pedidos.tracking_codigo IS 'Código de rastreio retornado pelo marketplace/transportadora.';
COMMENT ON COLUMN public.pedidos.metodo_envio IS 'Método/transportadora/tipo de envio retornado pelo marketplace/transportadora.';

-- Índices opcionais
CREATE INDEX IF NOT EXISTS idx_pedidos_tracking_codigo ON public.pedidos(tracking_codigo) WHERE tracking_codigo IS NOT NULL;

