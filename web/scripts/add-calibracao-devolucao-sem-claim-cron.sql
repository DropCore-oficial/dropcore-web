-- Cron de calibração (2026-10-31): a detecção de devolução hoje só escuta `claims` do ML —
-- caso real confirmado com a Vinz Collection, o comprador devolveu direto na logística ("me
-- arrependi"), sem reclamação nenhuma. Antes de inventar uma regra de detecção nova, esse
-- cron só observa: snapshot diário (order + shipment) de todo pedido entregue ainda sem
-- repasse, gravado em `ml_devolucao_calibracao_log` (tabela já existente). Não trava
-- dinheiro, não notifica, não decide nada.
-- Lock advisory 913021 (próximo livre; até 913020 já em uso por outros crons).

CREATE OR REPLACE FUNCTION public.dropcore_try_calibracao_devolucao_sem_claim_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913021);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_calibracao_devolucao_sem_claim_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913021);
$$;

-- Achado de segurança (2026-10-31): GRANT ... TO postgres sozinho não fecha anon/authenticated
-- (função SECURITY DEFINER nasce aberta por default do Supabase) — revoke explícito sempre.
REVOKE ALL ON FUNCTION public.dropcore_try_calibracao_devolucao_sem_claim_lock FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dropcore_release_calibracao_devolucao_sem_claim_lock FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dropcore_try_calibracao_devolucao_sem_claim_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_calibracao_devolucao_sem_claim_lock() TO postgres;

-- 1x por dia (03h UTC = meia-noite BRT) — só observação, não precisa de ritmo curto
SELECT cron.schedule(
  'dropcore-calibracao-devolucao-sem-claim',
  '0 3 * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/calibracao-devolucao-sem-claim', 60000);$$
);
