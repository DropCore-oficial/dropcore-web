-- Normaliza produto_tabela_medidas para o schema canónico (grupo_key PK, sem fornecedor_id).
-- Execute no SQL Editor do Supabase se o PUT da tabela de medidas falhar com fornecedor_id NOT NULL.
--
-- 1) Copia medidas legadas (grupo_sku) para grupo_key quando ainda não existir linha canónica.
-- 2) Remove duplicatas legadas após merge.
-- 3) Torna fornecedor_id/org_id opcionais ou remove colunas (ajuste conforme o seu schema).

DO $$
BEGIN
  IF to_regclass('public.produto_tabela_medidas') IS NULL THEN
    RAISE NOTICE 'Tabela produto_tabela_medidas não existe — nada a fazer.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'grupo_sku'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'grupo_key'
  ) THEN
    INSERT INTO public.produto_tabela_medidas (grupo_key, tipo_produto, medidas, criado_em, atualizado_em)
    SELECT
      upper(trim(coalesce(nullif(trim(grupo_key), ''), trim(grupo_sku)))),
      coalesce(nullif(trim(tipo_produto), ''), 'generico'),
      coalesce(medidas, '{}'::jsonb),
      coalesce(criado_em, now()),
      coalesce(atualizado_em, now())
    FROM public.produto_tabela_medidas src
    WHERE coalesce(nullif(trim(grupo_key), ''), trim(grupo_sku)) IS NOT NULL
      AND coalesce(nullif(trim(grupo_key), ''), trim(grupo_sku)) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.produto_tabela_medidas dst
        WHERE dst.grupo_key = upper(trim(coalesce(nullif(trim(src.grupo_key), ''), trim(src.grupo_sku))))
      )
    ON CONFLICT (grupo_key) DO UPDATE SET
      medidas = EXCLUDED.medidas,
      tipo_produto = EXCLUDED.tipo_produto,
      atualizado_em = now();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'fornecedor_id'
  ) THEN
    ALTER TABLE public.produto_tabela_medidas ALTER COLUMN fornecedor_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'produto_tabela_medidas' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.produto_tabela_medidas ALTER COLUMN org_id DROP NOT NULL;
  END IF;
END $$;
