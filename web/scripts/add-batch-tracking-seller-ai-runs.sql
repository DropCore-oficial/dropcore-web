-- Suporte a Batch API da Anthropic em seller_ai_runs: submissão e processamento de
-- resultado acontecem em crons separados (batch pode levar até 24h), então precisa de um
-- estado "pendente" entre o cron que submete e o cron que verifica/grava o resultado.
-- Ver docs/SCHEMA.md e memória de projeto "Briefing Gestores de IA".

alter table public.seller_ai_runs
  drop constraint seller_ai_runs_status_check;

alter table public.seller_ai_runs
  add constraint seller_ai_runs_status_check
  check (status in ('pendente', 'ok', 'erro'));

alter table public.seller_ai_runs
  alter column status set default 'pendente';

alter table public.seller_ai_runs
  add column batch_id text;

-- Índice parcial: o cron de verificação só varre linhas pendentes, agrupando por batch_id.
create index idx_seller_ai_runs_batch_pendente
  on public.seller_ai_runs (batch_id)
  where status = 'pendente';
