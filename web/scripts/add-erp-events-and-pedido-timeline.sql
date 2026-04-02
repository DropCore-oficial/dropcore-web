-- Eventos ERP idempotentes + timeline de pedidos
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.erp_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE RESTRICT,
  event_id text NOT NULL,
  tipo_evento text NOT NULL,
  pedido_id uuid NULL REFERENCES public.pedidos(id) ON DELETE SET NULL,
  referencia_externa text NULL,
  payload jsonb NULL,
  status_processamento text NOT NULL DEFAULT 'recebido' CHECK (status_processamento IN ('recebido','processado','duplicado','erro')),
  erro text NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_event_logs_unique
  ON public.erp_event_logs (org_id, seller_id, event_id);

CREATE INDEX IF NOT EXISTS idx_erp_event_logs_pedido
  ON public.erp_event_logs (pedido_id);

CREATE TABLE IF NOT EXISTS public.pedido_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('erp','manual','sistema')),
  actor_id uuid NULL,
  actor_tipo text NULL CHECK (actor_tipo IN ('seller','fornecedor','admin','sistema')),
  descricao text NULL,
  metadata jsonb NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido
  ON public.pedido_eventos (pedido_id, criado_em DESC);

