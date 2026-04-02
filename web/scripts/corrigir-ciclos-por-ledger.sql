-- =============================================================================
-- Corrigir financial_ciclos_repasse e financial_repasse_fornecedor
-- a partir do ledger (fonte da verdade).
-- Recalcula totais para cada ciclo que tem registros PAGO no ledger.
-- Execute no Supabase SQL Editor.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  v_org_id uuid;
  v_ciclo date;
  v_total_forn numeric;
  v_total_dc numeric;
  v_fechado_em timestamptz;
  v_forn RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT org_id, ciclo_repasse
    FROM financial_ledger
    WHERE tipo IN ('BLOQUEIO', 'VENDA')
      AND status = 'PAGO'
      AND ciclo_repasse IS NOT NULL
  )
  LOOP
    v_org_id := r.org_id;
    v_ciclo := r.ciclo_repasse;

    -- Totais do ledger (PAGO) por fornecedor, menos débitos a descontar
    WITH ledger_soma AS (
      SELECT
        fornecedor_id,
        SUM(valor_fornecedor) AS vf,
        SUM(valor_dropcore) AS vd
      FROM financial_ledger
      WHERE org_id = v_org_id
        AND ciclo_repasse = v_ciclo
        AND tipo IN ('BLOQUEIO', 'VENDA')
        AND status = 'PAGO'
        AND fornecedor_id IS NOT NULL
      GROUP BY fornecedor_id
    ),
    debitos_soma AS (
      SELECT
        fornecedor_id,
        COALESCE(SUM(valor_fornecedor), 0) AS vf,
        COALESCE(SUM(valor_dropcore), 0) AS vd
      FROM financial_debito_descontar
      WHERE org_id = v_org_id
        AND ciclo_a_descontar = v_ciclo
      GROUP BY fornecedor_id
    ),
    neto AS (
      SELECT
        l.fornecedor_id,
        GREATEST(0, l.vf - COALESCE(d.vf, 0)) AS valor_fornecedor,
        GREATEST(0, l.vd - COALESCE(d.vd, 0)) AS valor_dropcore
      FROM ledger_soma l
      LEFT JOIN debitos_soma d ON d.fornecedor_id = l.fornecedor_id
    )
    SELECT
      COALESCE(SUM(valor_fornecedor), 0),
      COALESCE(SUM(valor_dropcore), 0)
    INTO v_total_forn, v_total_dc
    FROM neto;

    -- Preservar fechado_em existente ou usar now()
    SELECT fechado_em INTO v_fechado_em
    FROM financial_ciclos_repasse
    WHERE org_id = v_org_id AND ciclo_repasse = v_ciclo;

    v_fechado_em := COALESCE(v_fechado_em, now());

    -- Upsert ciclos
    INSERT INTO financial_ciclos_repasse (org_id, ciclo_repasse, status, total_fornecedores, total_dropcore, fechado_em, criado_em)
    VALUES (v_org_id, v_ciclo, 'fechado', v_total_forn, v_total_dc, v_fechado_em, now())
    ON CONFLICT (org_id, ciclo_repasse)
    DO UPDATE SET
      total_fornecedores = EXCLUDED.total_fornecedores,
      total_dropcore = EXCLUDED.total_dropcore;

    -- Upsert repasse por fornecedor
    FOR v_forn IN (
      WITH ledger_soma AS (
        SELECT fornecedor_id, SUM(valor_fornecedor) AS vf, SUM(valor_dropcore) AS vd
        FROM financial_ledger
        WHERE org_id = v_org_id AND ciclo_repasse = v_ciclo AND tipo IN ('BLOQUEIO', 'VENDA') AND status = 'PAGO' AND fornecedor_id IS NOT NULL
        GROUP BY fornecedor_id
      ),
      debitos_soma AS (
        SELECT fornecedor_id, COALESCE(SUM(valor_fornecedor), 0) AS vf, COALESCE(SUM(valor_dropcore), 0) AS vd
        FROM financial_debito_descontar
        WHERE org_id = v_org_id AND ciclo_a_descontar = v_ciclo
        GROUP BY fornecedor_id
      )
      SELECT l.fornecedor_id, GREATEST(0, l.vf - COALESCE(d.vf, 0)) AS valor_total
      FROM ledger_soma l
      LEFT JOIN debitos_soma d ON d.fornecedor_id = l.fornecedor_id
      WHERE GREATEST(0, l.vf - COALESCE(d.vf, 0)) > 0
    )
    LOOP
      INSERT INTO financial_repasse_fornecedor (org_id, fornecedor_id, ciclo_repasse, valor_total, status, atualizado_em)
      VALUES (v_org_id, v_forn.fornecedor_id, v_ciclo, v_forn.valor_total, 'liberado', now())
      ON CONFLICT (fornecedor_id, ciclo_repasse)
      DO UPDATE SET
        valor_total = EXCLUDED.valor_total,
        atualizado_em = now();
    END LOOP;
  END LOOP;
END
$$;

-- Verificar resultado
SELECT ciclo_repasse, status, fechado_em, total_fornecedores, total_dropcore
FROM financial_ciclos_repasse
ORDER BY ciclo_repasse DESC
LIMIT 10;
