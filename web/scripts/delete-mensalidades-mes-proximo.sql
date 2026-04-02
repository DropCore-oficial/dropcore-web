-- Remove mensalidades do mês atual e do próximo mês (para poder gerar de novo e testar)
-- Execute no Supabase SQL Editor.

-- Mostra quantas linhas serão apagadas (para conferir antes)
SELECT COUNT(*) AS qtd_a_apagar, MIN(ciclo) AS primeiro_ciclo, MAX(ciclo) AS ultimo_ciclo
FROM public.financial_mensalidades
WHERE ciclo >= date_trunc('month', current_date)::date
  AND ciclo < (date_trunc('month', current_date) + interval '2 months')::date;

-- Apaga as mensalidades do mês atual e do próximo
DELETE FROM public.financial_mensalidades
WHERE ciclo >= date_trunc('month', current_date)::date
  AND ciclo < (date_trunc('month', current_date) + interval '2 months')::date;
