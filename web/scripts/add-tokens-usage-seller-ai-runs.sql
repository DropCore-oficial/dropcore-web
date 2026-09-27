-- Registra o consumo real de tokens de cada rodada dos Gestores de IA — hoje
-- seller_ai_runs.creditos_debitados fica sempre null porque o valor real de 1 crédito no
-- ledger nunca foi medido. Passo 1 pra medir: guardar o usage real que a Anthropic já devolve
-- na resposta do batch (gestorBatchResultado.ts), sem inventar número nenhum ainda.
-- Tabela é deny-all (RLS sem policy, acesso só via RPC SECURITY DEFINER) — colunas novas não
-- mudam esse comportamento.

ALTER TABLE seller_ai_runs
  ADD COLUMN IF NOT EXISTS tokens_input integer,
  ADD COLUMN IF NOT EXISTS tokens_output integer;
