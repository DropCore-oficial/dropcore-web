-- RPC pra ler status dos cron jobs (schema `cron` do pg_cron não é exposto via API padrão).
-- Usada pelo healthcheck automático (web/lib/cronHealthCheck.ts) — só service_role chama,
-- nunca vem do front.
CREATE OR REPLACE FUNCTION public.fn_cron_job_status()
RETURNS TABLE (
  jobname text,
  schedule text,
  last_status text,
  last_start timestamptz,
  last_end timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT
    j.jobname,
    j.schedule,
    r.status,
    r.start_time,
    r.end_time
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT d.status, d.start_time, d.end_time
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY d.start_time DESC
    LIMIT 1
  ) r ON true
  WHERE j.jobname LIKE 'dropcore-%';
$$;

REVOKE ALL ON FUNCTION public.fn_cron_job_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cron_job_status() TO service_role;
