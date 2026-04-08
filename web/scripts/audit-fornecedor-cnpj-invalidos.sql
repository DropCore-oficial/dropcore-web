-- Auditoria de CNPJ inválido em fornecedores
-- Uso:
-- 1) Rode este script no SQL Editor
-- 2) Consulte o SELECT final (toda base) ou descomente o filtro por org_id

CREATE OR REPLACE FUNCTION public.is_valid_cnpj(cnpj_input text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
  i int;
  sum1 int := 0;
  sum2 int := 0;
  d1 int;
  d2 int;
  weights1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  weights2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
BEGIN
  digits := regexp_replace(coalesce(cnpj_input, ''), '\D', '', 'g');

  IF length(digits) <> 14 THEN
    RETURN false;
  END IF;

  IF digits ~ '^(\d)\1{13}$' THEN
    RETURN false;
  END IF;

  FOR i IN 1..12 LOOP
    sum1 := sum1 + cast(substr(digits, i, 1) as int) * weights1[i];
  END LOOP;
  d1 := CASE WHEN (sum1 % 11) < 2 THEN 0 ELSE 11 - (sum1 % 11) END;

  FOR i IN 1..13 LOOP
    sum2 := sum2 + cast(substr(digits, i, 1) as int) * weights2[i];
  END LOOP;
  d2 := CASE WHEN (sum2 % 11) < 2 THEN 0 ELSE 11 - (sum2 % 11) END;

  RETURN d1 = cast(substr(digits, 13, 1) as int)
     AND d2 = cast(substr(digits, 14, 1) as int);
END;
$$;

-- Lista fornecedores com CNPJ preenchido e inválido.
SELECT
  f.org_id,
  f.id AS fornecedor_id,
  f.nome,
  f.cnpj,
  f.telefone,
  f.email_comercial
FROM public.fornecedores f
WHERE coalesce(trim(f.cnpj), '') <> ''
  AND NOT public.is_valid_cnpj(f.cnpj)
-- AND f.org_id = 'COLE_O_ORG_ID_AQUI'
ORDER BY f.org_id, f.nome;
