-- Impede duplicata de mensalidade por (org, tipo, entidade, ciclo).
-- Contexto: bug de geração criava uma linha nova por mês pra entidade em trial
-- (cancelada em seguida) e não bloqueava ciclo novo pra quem já tinha mensalidade
-- inadimplente em aberto — corrigido em gerarMensalidadesCicloOrg.ts (2026-09-13),
-- mas essa constraint é a trava de banco contra qualquer recorrência futura do bug.
-- Duplicatas existentes já foram limpas manualmente antes de aplicar.

ALTER TABLE public.financial_mensalidades
  ADD CONSTRAINT financial_mensalidades_org_tipo_entidade_ciclo_key
  UNIQUE (org_id, tipo, entidade_id, ciclo);
