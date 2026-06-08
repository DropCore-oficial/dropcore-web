-- =============================================================================
-- DropCore — crons no Supabase (pg_cron + pg_net), NÃO na Vercel
-- =============================================================================
-- A Vercel só hospeda o Next.js. O "despertador" fica aqui e chama as rotas:
--   POST https://www.dropcore.com.br/api/cron/...
-- com Authorization: Bearer <CRON_SECRET> (guardado no Vault).
--
-- Pré-requisitos (Supabase Dashboard → Database → Extensions):
--   pg_cron, pg_net, supabase_vault (Vault) — habilitados no projeto.
--
-- Horários em UTC. Olist: a cada 1 minuto (automático; não depende do botão no painel).
-- =============================================================================

-- Extensões (idempotente; no hosted Supabase costuma já estar ativa)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1) Configurar o segredo (rode UMA vez; use o MESMO valor de CRON_SECRET na Vercel)
-- -----------------------------------------------------------------------------
-- Substitua SEU_CRON_SECRET_AQUI pelo valor forte (ex.: openssl rand -hex 32)
-- e mantenha o mesmo em Vercel → dropcore-web → CRON_SECRET (as rotas validam o Bearer).

-- SELECT vault.create_secret(
--   'SEU_CRON_SECRET_AQUI',
--   'cron_secret',
--   'Bearer para /api/cron/* do DropCore'
-- );

-- Se já existir e quiser trocar, use o painel Vault ou delete/recreate conforme docs Supabase.

-- -----------------------------------------------------------------------------
-- 2) Função auxiliar: POST autenticado nas rotas de cron do app
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dropcore_cron_http_post(text);

CREATE OR REPLACE FUNCTION public.dropcore_cron_http_post(
  p_path text,
  p_timeout_ms int DEFAULT 300000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_base_url text := 'https://www.dropcore.com.br';
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;

  IF v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RAISE EXCEPTION 'Vault: secret "cron_secret" ausente. Descomente vault.create_secret em supabase-cron-jobs.sql.';
  END IF;

  SELECT net.http_post(
    url := v_base_url || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(v_secret)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := GREATEST(p_timeout_ms, 5000)
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.dropcore_cron_http_post IS
  'Chama rota /api/cron/* em produção com CRON_SECRET do Vault. timeout padrão 5 min (sync preços Olist demora).';

REVOKE ALL ON FUNCTION public.dropcore_cron_http_post(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dropcore_cron_http_post(text) TO postgres;

-- Evita duas execuções do sync Olist ao mesmo tempo (cron a cada 1 min pode sobrepor)
CREATE OR REPLACE FUNCTION public.dropcore_try_olist_sync_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913001);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_olist_sync_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913001);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_olist_sync_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_olist_sync_lock() TO postgres;

-- -----------------------------------------------------------------------------
-- 3) Remover jobs antigos (re-rodar o script é seguro)
-- -----------------------------------------------------------------------------
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname LIKE 'dropcore-%';

-- -----------------------------------------------------------------------------
-- 4) Agendar (UTC)
-- -----------------------------------------------------------------------------
-- Olist sync automático — a cada 1 minuto (UTC). Caminho rápido: webhook /api/webhooks/olist (?w= token do seller).
-- Não aumentar o intervalo sem webhook ativo: o cron é rede de segurança, não a única via de pedido.
SELECT cron.schedule(
  'dropcore-olist-sync',
  '* * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/olist-sync');$$
);

-- Preços/custos Olist — a cada 10 min (UTC). Sellers com token + armazém ligado.
SELECT cron.schedule(
  'dropcore-olist-sync-precos',
  '*/10 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/olist-sync-precos');$$
);

-- Inadimplência + notificação admin org — a cada hora (UTC), em vez de em cada GET de dashboard
SELECT cron.schedule(
  'dropcore-inadimplencia',
  '0 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/inadimplencia');$$
);

-- Mensalidades do mês + inadimplência — 09:00 UTC
SELECT cron.schedule(
  'dropcore-mensalidades-mes',
  '0 9 * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/mensalidades-mes');$$
);

-- Expiração / avisos créditos seller — 10:00 UTC
SELECT cron.schedule(
  'dropcore-creditos-expiracao',
  '0 10 * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/creditos-expiracao');$$
);

-- -----------------------------------------------------------------------------
-- 5) Conferir
-- -----------------------------------------------------------------------------
-- SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname LIKE 'dropcore-%';
-- Teste manual (após vault.create_secret):
-- SELECT public.dropcore_cron_http_post('/api/cron/creditos-expiracao');
