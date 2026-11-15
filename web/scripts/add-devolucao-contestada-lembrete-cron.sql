-- Lembrete diário de devolução contestada pelo fornecedor sem decisão do admin — 2026-11-11.
-- Achado real: a contestação do fornecedor (fn_devolucao_fornecedor_contestar) só gravava no
-- banco e travava a liberação automática de 72h, sem avisar ninguém — um caso ficou 8 dias
-- parado até alguém notar por acaso. Agora a contestação já notifica admin+seller na hora
-- (ver notifyAdminDevolucaoContestada.ts); essa rotina é o reforço diário pros casos que
-- passaram 48h sem ninguém decidir, pra garantir que não se perde de novo numa notificação
-- única enterrada no meio de outras.
-- Lock advisory 913025 (próximo livre; até 913024 já em uso por outros crons).

CREATE OR REPLACE FUNCTION public.dropcore_try_devolucao_contestada_lembrete_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913025);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_devolucao_contestada_lembrete_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913025);
$$;

REVOKE ALL ON FUNCTION public.dropcore_try_devolucao_contestada_lembrete_lock FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dropcore_release_devolucao_contestada_lembrete_lock FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dropcore_try_devolucao_contestada_lembrete_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_devolucao_contestada_lembrete_lock() TO postgres;

-- 1x por dia, 12h UTC (09h BRT) — horário comercial, pra cair no começo do dia de trabalho
-- do admin em vez de de madrugada.
SELECT cron.schedule(
  'dropcore-devolucao-contestada-lembrete',
  '0 12 * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/devolucao-contestada-lembrete', 60000);$$
);
