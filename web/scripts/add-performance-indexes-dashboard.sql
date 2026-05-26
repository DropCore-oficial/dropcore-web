-- Índices para dashboards admin, mensalidades e catálogo (execute no Supabase SQL Editor).
-- Idempotente.

-- Mensalidades: inadimplência, pendentes por org/tipo
CREATE INDEX IF NOT EXISTS idx_mensalidades_org_status_vencimento
  ON public.financial_mensalidades (org_id, status, vencimento_em);

CREATE INDEX IF NOT EXISTS idx_mensalidades_org_tipo_status
  ON public.financial_mensalidades (org_id, tipo, status);

-- SKUs: contagens e listagens por org / fornecedor
CREATE INDEX IF NOT EXISTS idx_skus_org_status
  ON public.skus (org_id, status);

CREATE INDEX IF NOT EXISTS idx_skus_fornecedor_status
  ON public.skus (fornecedor_id, status);

CREATE INDEX IF NOT EXISTS idx_skus_org_estoque_baixo
  ON public.skus (org_id)
  WHERE estoque_minimo IS NOT NULL AND estoque_atual IS NOT NULL;

-- Pedidos: dashboard Pro (30 dias por org)
CREATE INDEX IF NOT EXISTS idx_pedidos_org_criado_em
  ON public.pedidos (org_id, criado_em DESC);

-- Ledger: dashboard Pro
CREATE INDEX IF NOT EXISTS idx_ledger_org_data_evento
  ON public.financial_ledger (org_id, data_evento DESC)
  WHERE tipo IN ('BLOQUEIO', 'VENDA');

-- Webhook Olist: último evento por seller (checklist no painel)
CREATE INDEX IF NOT EXISTS idx_olist_webhook_logs_seller_created
  ON public.olist_webhook_logs (seller_id, created_at DESC)
  WHERE seller_id IS NOT NULL;
