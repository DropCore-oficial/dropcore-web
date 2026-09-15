-- Corrige create-fn-cron-job-status.sql: a versão original usava LATERAL (1 subquery
-- correlacionada por job) contra cron.job_run_details (415k linhas, sem índice em
-- jobid/start_time, sem dono acessível pra criar um — ver add-index-cron-job-run-details.sql)
-- e estourava statement_timeout via PostgREST. Reescrita pra 1 scan só (DISTINCT ON),
-- ~5s em vez de timeout.
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
  WITH ultimos AS (
    SELECT DISTINCT ON (jobid) jobid, status, start_time, end_time
    FROM cron.job_run_details
    ORDER BY jobid, start_time DESC
  )
  SELECT j.jobname, j.schedule, u.status, u.start_time, u.end_time
  FROM cron.job j
  LEFT JOIN ultimos u ON u.jobid = j.jobid
  WHERE j.jobname LIKE 'dropcore-%';
$$;
