-- Dia do mês (1–28) em que vence a mensalidade da entidade (âncora tipo calculadora, mês civil).
-- NULL = legado: na geração usa-se o dia 10 como antes.
-- Execute no Supabase SQL Editor (produção/staging).

ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS mensalidade_dia_vencimento integer
  CHECK (mensalidade_dia_vencimento IS NULL OR (mensalidade_dia_vencimento >= 1 AND mensalidade_dia_vencimento <= 28));

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS mensalidade_dia_vencimento integer
  CHECK (mensalidade_dia_vencimento IS NULL OR (mensalidade_dia_vencimento >= 1 AND mensalidade_dia_vencimento <= 28));

COMMENT ON COLUMN public.sellers.mensalidade_dia_vencimento IS 'Dia fixo (1–28) do vencimento mensal no calendário; null = usar 10 na geração (legado).';
COMMENT ON COLUMN public.fornecedores.mensalidade_dia_vencimento IS 'Dia fixo (1–28) do vencimento mensal no calendário; null = usar 10 na geração (legado).';
