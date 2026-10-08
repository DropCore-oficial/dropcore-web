-- Andrey avulso passa a usar Anthropic Batch API no cron diário (desconto de 50%, mesmo
-- padrão do hub) — precisa de batch_id pra cron B (gestores-ia-avulso-andrey-resultado)
-- conferir quando o batch terminou e gravar o resultado na linha certa.
alter table calculadora_assinante_ai_runs
  add column if not exists batch_id text;
