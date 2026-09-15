import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Toda rota nova em app/api/cron/<pasta>/route.ts precisa virar uma entrada aqui
 * (nome real do job em cron.schedule, não o nome da pasta) — senão o healthcheck não
 * sabe que ela devia existir. Times/décadas atrás isso ficou esquecido pra
 * gestores-ia-sync-sku-ml (12 dias sem rodar) e mensalidades-mp-sync (nunca chegou a
 * ser aplicado) até alguém notar manualmente — é exatamente o que esta lista evita.
 */
export const CRONS_ESPERADOS = [
  "dropcore-bling-sync",
  "dropcore-cleanup-net-http-response",
  "dropcore-creditos-expiracao",
  "dropcore-estoque-reserva-expira",
  "dropcore-etiqueta-olist-retry",
  "dropcore-fornecedor-olist-sync-estoque",
  "dropcore-fornecedor-troca-janela-expira",
  "dropcore-gestores-ia-sync-sku-ml",
  "dropcore-inadimplencia",
  "dropcore-mensalidades-mes",
  "dropcore-mensalidades-mp-sync",
  "dropcore-olist-sync",
  "dropcore-olist-sync-precos",
  "dropcore-pedidos-bloqueados-retry",
  "dropcore-pedidos-erro-saldo-retry",
  "dropcore-pedidos-postado-auto-retry",
  "dropcore-repasse-fornecedor-atrasado",
  "dropcore-cron-healthcheck",
] as const;

type JobStatus = {
  jobname: string;
  schedule: string;
  last_status: string | null;
  last_start: string | null;
  last_end: string | null;
};

export type ProblemaCron =
  | { jobname: string; tipo: "nao_agendado" }
  | { jobname: string; tipo: "nunca_rodou" }
  | { jobname: string; tipo: "falhou"; ultimoStart: string }
  | { jobname: string; tipo: "atrasado"; ultimoStart: string; gapHoras: number };

/** Folga generosa (3x o intervalo do schedule) — evita falso positivo por variação normal. */
function gapMaximoMinutos(schedule: string): number {
  const [min, hora] = schedule.trim().split(/\s+/);
  if (min?.startsWith("*/")) {
    const n = parseInt(min.slice(2), 10);
    return Math.max(n * 3, 15);
  }
  if (min === "*") return 15;
  if (hora === "*") return 180;
  return 60 * 30;
}

export async function checarSaudeCrons(sb: SupabaseClient): Promise<ProblemaCron[]> {
  const { data, error } = await sb.rpc("fn_cron_job_status");
  if (error) throw new Error(error.message);

  const porNome = new Map((data as JobStatus[] | null ?? []).map((j) => [j.jobname, j]));
  const problemas: ProblemaCron[] = [];

  for (const jobname of CRONS_ESPERADOS) {
    const job = porNome.get(jobname);
    if (!job) {
      problemas.push({ jobname, tipo: "nao_agendado" });
      continue;
    }
    if (!job.last_start) {
      problemas.push({ jobname, tipo: "nunca_rodou" });
      continue;
    }
    if (job.last_status && job.last_status !== "succeeded") {
      problemas.push({ jobname, tipo: "falhou", ultimoStart: job.last_start });
      continue;
    }
    const gapMin = (Date.now() - new Date(job.last_start).getTime()) / 60000;
    const maxGapMin = gapMaximoMinutos(job.schedule);
    if (gapMin > maxGapMin) {
      problemas.push({
        jobname,
        tipo: "atrasado",
        ultimoStart: job.last_start,
        gapHoras: Math.round(gapMin / 60),
      });
    }
  }

  return problemas;
}
