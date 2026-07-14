-- Backfill único: recalcula ciclo_repasse dos lançamentos já postados
-- (AGUARDANDO_REPASSE / ENTREGUE, ainda não PAGOs) que ficaram com o valor
-- antigo (segunda-feira) gravado antes de fix-fn-ciclo-repasse-terca.sql.
-- Não mexe em PAGO (já fechado) nem em BLOQUEADO (ainda não postado — esse
-- é recalculado automaticamente no momento da postagem, ver marcar-postado
-- e entregar routes).
--
-- Usa atualizado_em como data de referência: é o momento em que o status
-- virou AGUARDANDO_REPASSE/ENTREGUE (as rotas de postagem atualizam status +
-- ciclo_repasse + atualizado_em juntos), diferente de criado_em/data_evento
-- (que é a data da venda, não da postagem).

UPDATE public.financial_ledger
SET ciclo_repasse = public.fn_ciclo_repasse(atualizado_em)
WHERE status IN ('AGUARDANDO_REPASSE', 'ENTREGUE')
  AND ciclo_repasse IS NOT NULL
  AND ciclo_repasse <> public.fn_ciclo_repasse(atualizado_em);
