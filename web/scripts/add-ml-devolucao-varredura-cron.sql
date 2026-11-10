-- Cron de segurança pra devolução do Mercado Livre (2026-11-10): a detecção em tempo real
-- (webhook "claims" -> detectarDevolucaoMl) só enxerga reclamações com status=opened e
-- depende 100% do ML entregar o webhook. Achado real: 9 devoluções confirmadas (ML já
-- reembolsou o comprador) em 2 sellers (Vinz Collection, Coimbra Company) nunca apareceram
-- no DropCore — 3 delas já tinham sido pagas pro fornecedor antes de alguém notar na mão.
-- Essa rotina varre TODO seller com integração ML ativa 1x/dia, sem filtro de status, e usa
-- o mesmo pipeline de classificação/trava/notificação do webhook (ver
-- `varrerDevolucoesMlTodosSellers` em web/lib/mlDevolucaoDeteccao.ts). Não substitui o
-- webhook (tempo real continua mais rápido) — é a rede de segurança pro caso ele falhar.
-- Lock advisory 913023 (próximo livre; até 913022 já em uso por outros crons).

CREATE OR REPLACE FUNCTION public.dropcore_try_ml_devolucao_varredura_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913023);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_ml_devolucao_varredura_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913023);
$$;

-- Função SECURITY DEFINER nasce aberta por default do Supabase — revoke explícito sempre
-- (regra inegociável 9 / checklist do CLAUDE.md), só o pg_cron (role postgres) chama.
REVOKE ALL ON FUNCTION public.dropcore_try_ml_devolucao_varredura_lock FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dropcore_release_ml_devolucao_varredura_lock FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dropcore_try_ml_devolucao_varredura_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_ml_devolucao_varredura_lock() TO postgres;

-- 1x por dia, 04h UTC (01h BRT) — horário de pouco tráfego, não precisa de ritmo curto
-- (devolução leva dias pra se resolver no ML, não minutos).
SELECT cron.schedule(
  'dropcore-ml-devolucao-varredura',
  '0 4 * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/ml-devolucao-varredura', 120000);$$
);
