-- Gestores de IA avulso: orçamento vira diário (R$4/dia, igual ao chat do Tiago Silva no
-- hub), calculado em tempo real a partir do uso de token de cada rodada — não mais um
-- acumulador mensal em calculadora_assinantes (gestores_custo_mes/gestores_limite_mes/
-- gestores_mes_ref ficam sem uso daqui pra frente, mantidas na tabela sem necessidade de
-- dropar).
alter table public.calculadora_assinante_ai_runs
  add column tokens_input integer,
  add column tokens_output integer;
