import type { Medida } from "@/lib/fornecedorCriarVariantesRascunho";
import { inferirTipo, type TipoProduto } from "@/lib/tipoProduto";

export type TabelaMedidasPayload = {
  tipo_produto: string;
  medidas: Record<string, Record<string, number>>;
};

function normalizeTopico(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/** Mapeia rótulo do formulário «Criar variantes» para chave em `produto_tabela_medidas.medidas`. */
export function topicoToStorageKey(topico: string): string {
  const n = normalizeTopico(topico);
  if (n === "ombro" || n === "ombros") return "ombro";
  if (n === "manga" || n.includes("comprimento da manga")) return "manga";
  if (n === "biceps" || n.includes("bicep")) return "biceps";
  if (n.includes("entrepernas")) return "comprimento_perna";
  if (n.includes("gancho")) return "gancho";
  if (n.includes("comprimento") && n.includes("perna")) return "comprimento_perna";
  if (n === "comprimento" || n.includes("comprimento total")) return "comprimento";
  if (n === "largura") return "largura";
  if (n === "cintura") return "cintura";
  if (n === "quadril") return "quadril";
  if (n === "busto") return "busto";
  if (n === "punho") return "punho";
  if (n === "coxa") return "coxa";
  return n.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "extra";
}

function chaveTopicoMedida(topico: string): keyof Medida | "extra" {
  const norm = normalizeTopico(topico);
  if (norm === "largura") return "largura";
  if (norm === "comprimento") return "comprimento";
  if (norm === "ombro" || norm === "ombros") return "ombro";
  if (norm === "manga" || norm.includes("comprimento da manga")) return "manga";
  if (norm === "cintura") return "cintura";
  if (norm === "quadril") return "quadril";
  if (norm === "busto") return "busto";
  return "extra";
}

export function valorTopicoFromMedida(m: Medida, topico: string): number | null {
  const k = chaveTopicoMedida(topico);
  if (k === "extra") {
    const v = m.extras?.[topico];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  const v = m[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Converte linhas do formulário para o JSON da tabela de medidas (seller + fornecedor). */
export function medidasFormToTabelaMedidas(
  medidas: Medida[],
  topicos: string[],
  nomeProduto: string,
  categoria: string | null | undefined
): TabelaMedidasPayload | null {
  const tipo = inferirTipo(nomeProduto, categoria ?? null) as TipoProduto;
  const out: Record<string, Record<string, number>> = {};

  for (const m of medidas) {
    const tam = m.tamanho.trim().toUpperCase();
    if (!tam) continue;
    const row: Record<string, number> = {};
    for (const topico of topicos) {
      const val = valorTopicoFromMedida(m, topico);
      if (val == null) continue;
      row[topicoToStorageKey(topico)] = val;
    }
    if (Object.keys(row).length > 0) out[tam] = row;
  }

  if (Object.keys(out).length === 0) return null;
  return { tipo_produto: tipo, medidas: out };
}

/** Fallback: tabela salva em `detalhes_produto_json.medidas.linhas` (cadastros antes do fix). */
export function tabelaMedidasFromDetalhesJson(
  detalhes: unknown,
  nomeProduto: string,
  categoria: string | null | undefined
): TabelaMedidasPayload | null {
  if (!detalhes || typeof detalhes !== "object" || Array.isArray(detalhes)) return null;
  const med = (detalhes as Record<string, unknown>).medidas;
  if (!med || typeof med !== "object" || Array.isArray(med)) return null;
  const m = med as Record<string, unknown>;
  const linhas = m.linhas;
  if (!Array.isArray(linhas) || linhas.length === 0) return null;
  const topicos: string[] = [];
  if (Array.isArray(m.topicosSelecionados)) {
    for (const t of m.topicosSelecionados) if (typeof t === "string" && t.trim()) topicos.push(t.trim());
  }
  if (typeof m.topicosCustom === "string" && m.topicosCustom.trim()) {
    for (const part of m.topicosCustom.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
      topicos.push(part);
    }
  }
  return medidasFormToTabelaMedidas(linhas as Medida[], topicos, nomeProduto, categoria);
}
