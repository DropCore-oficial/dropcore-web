-- SLA de postagem por marketplace (Fase 2, v1 só notifica — sem penalidade financeira).
-- Prazo calculado a partir da etiqueta DISPONÍVEL (etiqueta_impressa_em), nunca da criação
-- do pedido — atraso causado pela etiqueta demorar (buffer do próprio ML, fila da Olist)
-- não pode virar "culpa do fornecedor". Mercado Livre é exceção: usa o prazo real que a
-- própria API do ML devolve (estimated_handling_limit), independente de etiqueta impressa.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS sla_prazo_despacho timestamptz,
  ADD COLUMN IF NOT EXISTS sla_atraso_notificado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_pedidos_sla_prazo_despacho
  ON public.pedidos (status, sla_prazo_despacho)
  WHERE sla_prazo_despacho IS NOT NULL AND sla_atraso_notificado_em IS NULL;
