/**
 * Status/severidade da última rodada de cada gestor do Avulso (Andrey/Amanda/Ulisses) —
 * extraído de `gestores-ia-avulso/page.tsx` (2026-10-15) pra poder reaproveitar a mesma
 * leitura de `run.resultado` na página de Dashboard (seção "Pendências"), sem duplicar a
 * lógica de severidade em dois arquivos.
 */
import {
  SUCCESS_PREMIUM_TEXT_SOFT,
  DANGER_PREMIUM_TEXT_SOFT,
} from "@/lib/semanticPremium";
import { AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";

export type Severidade = "sucesso" | "atencao" | "critica" | "neutro";

export const SEVERIDADE_TEXT_CLASS: Record<Severidade, string> = {
  sucesso: SUCCESS_PREMIUM_TEXT_SOFT,
  atencao: AMBER_PREMIUM_TEXT_SOFT,
  critica: DANGER_PREMIUM_TEXT_SOFT,
  neutro: "text-[var(--muted)]",
};

/** Ordem de urgência pra ordenar lista de pendências — maior primeiro. */
export const SEVERIDADE_RANK: Record<Severidade, number> = {
  critica: 3,
  atencao: 2,
  sucesso: 1,
  neutro: 0,
};

type AndreyAnuncio = { chave: string; diagnostico: string; observacao: string; item_id_representante: string };
export type AndreyRun = {
  status: "pendente" | "ok" | "erro";
  resultado: { anuncios: AndreyAnuncio[]; destaque_prioridade: string[] } | null;
  executado_em: string;
} | null;

type AmandaResultado = {
  diagnostico: "saudavel" | "atencao" | "critica";
  observacao: string;
  perguntas: { pergunta_id: number; dias_pendente: number }[];
};
export type AmandaRun = { status: "pendente" | "ok" | "erro"; resultado: AmandaResultado | null; executado_em: string } | null;

type UlissesDiagnostico = "sem_custo" | "margem_abaixo_minima" | "margem_saudavel" | "margem_acima_maxima";
type UlissesSku = { chave: string; nome_produto: string; diagnostico: UlissesDiagnostico };
type UlissesResultado = { skus: UlissesSku[]; destaque_atencao: string[] };
export type UlissesRun = { status: "pendente" | "ok" | "erro"; resultado: UlissesResultado | null; executado_em: string } | null;

export function resumoStatusAndrey(run: AndreyRun): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const comProblema = run.resultado.anuncios.filter((a) => a.diagnostico !== "sem_problema_aparente").length;
  if (comProblema === 0) return "Nenhum problema encontrado";
  return `${comProblema} grupo${comProblema > 1 ? "s" : ""} sinalizado${comProblema > 1 ? "s" : ""}`;
}

export function resumoStatusAmanda(run: AmandaRun): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const qtdPerguntas = run.resultado.perguntas.length;
  if (run.resultado.diagnostico !== "saudavel") {
    return run.resultado.diagnostico === "critica" ? "Reputação crítica" : "Reputação em atenção";
  }
  if (qtdPerguntas > 0) return `${qtdPerguntas} pergunta${qtdPerguntas > 1 ? "s" : ""} pendente${qtdPerguntas > 1 ? "s" : ""}`;
  return "Tudo em dia";
}

export function resumoStatusUlisses(run: UlissesRun): string {
  if (!run || run.status !== "ok" || !run.resultado) return "Ainda não rodou";
  const abaixoMin = run.resultado.skus.filter((s) => s.diagnostico === "margem_abaixo_minima").length;
  const semCusto = run.resultado.skus.filter((s) => s.diagnostico === "sem_custo").length;
  if (abaixoMin > 0) return `${abaixoMin} com margem baixa`;
  if (semCusto > 0) return `${semCusto} sem custo cadastrado`;
  return "Margens saudáveis";
}

/** Prioriza o status real (urgência já calculada) sobre a descrição estática do card —
 * só cai na descrição fixa quando o gestor realmente ainda não rodou nenhuma vez. */
export function descricaoOuStatus(status: string, descricaoEstatica: string): string {
  return status === "Ainda não rodou" ? descricaoEstatica : status;
}

export function severidadeAndrey(run: AndreyRun): Severidade {
  if (!run || run.status !== "ok" || !run.resultado) return "neutro";
  const comProblema = run.resultado.anuncios.filter((a) => a.diagnostico !== "sem_problema_aparente").length;
  return comProblema > 0 ? "atencao" : "sucesso";
}

export function severidadeAmanda(run: AmandaRun): Severidade {
  if (!run || run.status !== "ok" || !run.resultado) return "neutro";
  if (run.resultado.diagnostico === "critica") return "critica";
  if (run.resultado.diagnostico === "atencao") return "atencao";
  return run.resultado.perguntas.length > 0 ? "atencao" : "sucesso";
}

export function severidadeUlisses(run: UlissesRun): Severidade {
  if (!run || run.status !== "ok" || !run.resultado) return "neutro";
  const abaixoMin = run.resultado.skus.filter((s) => s.diagnostico === "margem_abaixo_minima").length;
  if (abaixoMin > 0) return "critica";
  const semCusto = run.resultado.skus.filter((s) => s.diagnostico === "sem_custo").length;
  return semCusto > 0 ? "atencao" : "sucesso";
}
