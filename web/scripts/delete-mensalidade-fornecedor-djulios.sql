-- Remove mensalidades do fornecedor cujo nome contém "Djulios" (case-insensitive).
-- Rode no SQL Editor do Supabase APÓS revisar o SELECT.

-- 1) Pré-visualização (obrigatório: confira ids e valores)
SELECT m.id, m.org_id, m.ciclo, m.status, m.valor, f.id AS fornecedor_id, f.nome
FROM public.financial_mensalidades m
INNER JOIN public.fornecedores f ON f.id = m.entidade_id AND m.tipo = 'fornecedor'
WHERE f.nome ILIKE '%djulios%'
ORDER BY m.ciclo DESC;

-- 2) Excluir todas as linhas desse fornecedor em financial_mensalidades
DELETE FROM public.financial_mensalidades m
USING public.fornecedores f
WHERE m.tipo = 'fornecedor'
  AND m.entidade_id = f.id
  AND f.nome ILIKE '%djulios%';

-- Opcional: só o ciclo de abril/2026 (descomente o AND e ajuste a data)
-- AND m.ciclo = '2026-04-01'
