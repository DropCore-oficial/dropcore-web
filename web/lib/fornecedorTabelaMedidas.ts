import type { Medida } from "@/lib/fornecedorCriarVariantesRascunho";
import { ordenarTamanhosLista } from "@/lib/fornecedorVariantesUi";
import { getColunasTabelaMedidas, inferirTipo, type TipoProduto } from "@/lib/tipoProduto";

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

type MedidaCampoNumerico = Exclude<keyof Medida, "tamanho" | "extras">;

/** Campos numéricos suportados em `Medida` (demais tópicos usam `extras`). */
export function chaveTopicoMedida(topico: string): MedidaCampoNumerico | "extra" {
  const norm = normalizeTopico(topico);
  if (norm === "largura") return "largura";
  if (norm === "comprimento" || (norm.includes("comprimento") && !norm.includes("manga") && !norm.includes("perna")))
    return "comprimento";
  if (norm === "ombro" || norm === "ombros") return "ombro";
  if (norm === "manga" || norm.includes("comprimento da manga")) return "manga";
  if (norm === "cintura") return "cintura";
  if (norm === "quadril") return "quadril";
  if (norm === "busto") return "busto";
  if (norm.includes("entrepernas") || norm.includes("gancho") || norm.includes("bicep")) return "extra";
  return "extra";
}

export function valorTopicoFromMedida(m: Medida, topico: string): number | null {
  const k = chaveTopicoMedida(topico);
  if (k === "extra") {
    const v = m.extras?.[topico];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  const v = m[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const legado = m.extras?.[topico];
  return typeof legado === "number" && Number.isFinite(legado) ? legado : null;
}

/** Alguma medida numérica preenchida (campo fixo ou extra)? Usado para não deixar uma
 * linha duplicada em branco (ex.: criada via "Adicionar tamanho" com o mesmo tamanho que
 * já tinha linha preenchida) sobrescrever os valores já digitados. */
function medidaTemValor(m: Medida): boolean {
  if (
    m.largura != null ||
    m.comprimento != null ||
    m.ombro != null ||
    m.manga != null ||
    m.cintura != null ||
    m.quadril != null ||
    m.busto != null
  ) {
    return true;
  }
  return Object.values(m.extras ?? {}).some((v) => v != null);
}

/** Converte linhas do formulário para o JSON da tabela de medidas (seller + fornecedor). */
/** Alinha linhas da aba Medidas com os tamanhos escolhidos em Variações (preserva valores já digitados). */
export function syncMedidasLinhasComTamanhos(medidas: Medida[], tamanhosVariante: string[]): Medida[] {
  const byTam = new Map<string, Medida>();
  for (const m of medidas) {
    const t = m.tamanho.trim().toUpperCase();
    if (!t) continue;
    const atual = byTam.get(t);
    // Duas linhas pro mesmo tamanho: só deixa a nova substituir se a atual não tiver
    // valor nenhum — senão uma linha em branco (duplicata) apagaria dado já digitado.
    if (!atual || medidaTemValor(m) || !medidaTemValor(atual)) {
      byTam.set(t, { ...m, tamanho: t });
    }
  }
  if (tamanhosVariante.length === 0) {
    return medidas.length > 0
      ? medidas
      : [{ tamanho: "", largura: undefined, comprimento: undefined, ombro: undefined, manga: undefined }];
  }
  return tamanhosVariante.map((tam) => {
    const k = tam.toUpperCase();
    return (
      byTam.get(k) ?? {
        tamanho: k,
        largura: undefined,
        comprimento: undefined,
        ombro: undefined,
        manga: undefined,
      }
    );
  });
}

export function buildTabelaMedidasPayloadFromForm(
  medidas: Medida[],
  topicos: string[],
  tamanhosVariante: string[],
  nomeProduto: string,
  categoria: string | null | undefined
): TabelaMedidasPayload | null {
  const linhas = syncMedidasLinhasComTamanhos(medidas, tamanhosVariante);
  return medidasFormToTabelaMedidas(linhas, topicos, nomeProduto, categoria);
}

/** Converte `body.tabela_medidas` ou payload PUT em estrutura normalizada. */
export function parseTabelaMedidasRecord(raw: unknown): TabelaMedidasPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const tm = raw as Record<string, unknown>;
  const tipo = typeof tm.tipo_produto === "string" ? tm.tipo_produto.trim() || "generico" : "generico";
  const med = tm.medidas;
  if (!med || typeof med !== "object" || Array.isArray(med)) return null;
  const medidas: Record<string, Record<string, number>> = {};
  for (const [tamanho, vals] of Object.entries(med as Record<string, unknown>)) {
    if (!vals || typeof vals !== "object" || Array.isArray(vals)) continue;
    const row: Record<string, number> = {};
    for (const [k, v] of Object.entries(vals as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : parseFloat(String(v));
      if (Number.isFinite(n)) row[k] = n;
    }
    if (Object.keys(row).length > 0) medidas[tamanho.trim().toUpperCase()] = row;
  }
  if (Object.keys(medidas).length === 0) return null;
  return { tipo_produto: tipo, medidas };
}

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
/** Reconstrói linhas do formulário a partir do JSON gravado em `produto_tabela_medidas`. */
export function medidasLinhasFromTabelaPayload(
  payload: TabelaMedidasPayload,
  topicos: string[]
): Medida[] {
  const out: Medida[] = [];
  for (const [tamanho, row] of Object.entries(payload.medidas ?? {})) {
    const tam = tamanho.trim().toUpperCase();
    if (!tam) continue;
    const m: Medida = { tamanho: tam };
    for (const topico of topicos) {
      const val = row[topicoToStorageKey(topico)];
      if (val == null || !Number.isFinite(val)) continue;
      const k = chaveTopicoMedida(topico);
      if (k === "extra") {
        m.extras = { ...(m.extras ?? {}), [topico]: val };
      } else {
        m[k] = val;
      }
    }
    out.push(m);
  }
  return out;
}

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

/** Mescla tabelas (banco + JSON legado); valores de `primaria` prevalecem por célula. */
export function mergeTabelaMedidasPayload(
  primaria: TabelaMedidasPayload | null,
  secundaria: TabelaMedidasPayload | null
): TabelaMedidasPayload | null {
  const tipo =
    primaria?.tipo_produto?.trim() ||
    secundaria?.tipo_produto?.trim() ||
    "generico";
  const medidas: Record<string, Record<string, number>> = {};
  for (const src of [secundaria, primaria]) {
    if (!src?.medidas) continue;
    for (const [tam, row] of Object.entries(src.medidas)) {
      const k = tam.trim().toUpperCase();
      if (!k) continue;
      medidas[k] = { ...(medidas[k] ?? {}), ...row };
    }
  }
  if (Object.keys(medidas).length === 0) return null;
  return { tipo_produto: tipo, medidas };
}

/** Garante uma linha por tamanho do catálogo (linhas vazias viram `{}`). */
export function padTabelaMedidasComTamanhos(
  medidas: Record<string, Record<string, number>>,
  tamanhosVariante: string[]
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = { ...medidas };
  for (const tam of ordenarTamanhosLista(tamanhosVariante)) {
    const k = tam.trim().toUpperCase();
    if (!k) continue;
    if (!out[k]) out[k] = {};
  }
  return out;
}

/** Colunas com ao menos um valor numérico, na ordem do tipo de produto. */
export function chavesColunasTabelaMedidas(
  tipo: TipoProduto,
  medidas: Record<string, Record<string, number>>
): string[] {
  const colunas = getColunasTabelaMedidas(tipo);
  const present = new Set<string>();
  for (const row of Object.values(medidas)) {
    for (const [k, v] of Object.entries(row ?? {})) {
      if (Number.isFinite(v)) present.add(k);
    }
  }
  if (present.size === 0) return colunas.map((c) => c.key);
  const ordered: string[] = [];
  for (const c of colunas) {
    if (present.has(c.key)) {
      ordered.push(c.key);
      present.delete(c.key);
    }
  }
  for (const k of [...present].sort()) ordered.push(k);
  return ordered;
}

export function tamanhosOrdenadosTabelaMedidas(
  medidas: Record<string, Record<string, number>>
): string[] {
  return ordenarTamanhosLista(Object.keys(medidas));
}

/** Tamanhos do catálogo sem nenhum valor numérico na tabela (para validar save completo). */
export function tamanhosFaltantesNaTabelaMedidas(
  medidas: Record<string, Record<string, number>>,
  tamanhosEsperados: string[]
): string[] {
  const faltando: string[] = [];
  for (const tam of tamanhosEsperados) {
    const k = tam.trim().toUpperCase();
    if (!k) continue;
    const row = medidas[k] ?? {};
    const temValor = Object.values(row).some((v) => typeof v === "number" && Number.isFinite(v));
    if (!temValor) faltando.push(k);
  }
  return ordenarTamanhosLista(faltando);
}
