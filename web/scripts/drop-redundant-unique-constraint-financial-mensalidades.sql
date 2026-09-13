-- Reverte add-unique-constraint-financial-mensalidades.sql (2026-09-13, mesmo dia).
-- Constraint UNIQUE (org_id, tipo, entidade_id, ciclo) era redundante: já existia
-- UNIQUE (tipo, entidade_id, ciclo) (financial_mensalidades_tipo_entidade_id_ciclo_key),
-- estritamente mais forte (entidade_id já pertence a uma única org). O bug real
-- (uma linha nova por ciclo diferente todo mês, não duplicata no mesmo ciclo) não é
-- travável por UNIQUE — só em lógica de aplicação (gerarMensalidadesCicloOrg.ts).

ALTER TABLE public.financial_mensalidades
  DROP CONSTRAINT financial_mensalidades_org_tipo_entidade_ciclo_key;
