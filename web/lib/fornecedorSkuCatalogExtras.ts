/** Campos de catálogo/fiscal gravados nas colunas de `skus` (não só em detalhes_produto_json). */

export type FornecedorSkuCatalogExtras = {
  categoria: string | null;
  ncm: string | null;
  origem: string | null;
  cest: string | null;
  expedicao_override_linha: string | null;
};

function optionalTrimString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function logisticaFromBody(body: Record<string, unknown>): Record<string, unknown> | null {
  const det = body.detalhes_produto_json;
  if (!det || typeof det !== "object" || Array.isArray(det)) return null;
  const log = (det as Record<string, unknown>).logistica;
  if (!log || typeof log !== "object" || Array.isArray(log)) return null;
  return log as Record<string, unknown>;
}

function pickString(body: Record<string, unknown>, log: Record<string, unknown> | null, keys: string[]): string | null {
  for (const k of keys) {
    const top = optionalTrimString(body[k]);
    if (top) return top;
  }
  if (log) {
    for (const k of keys) {
      const fromLog = optionalTrimString(log[k]);
      if (fromLog) return fromLog;
    }
  }
  return null;
}

/** Extrai colunas de catálogo/fiscal do corpo POST (com fallback em detalhes_produto_json.logistica). */
export function fornecedorSkuCatalogExtrasFromBody(body: Record<string, unknown>): FornecedorSkuCatalogExtras {
  const log = logisticaFromBody(body);
  const det = body.detalhes_produto_json;
  const infoBasica =
    det && typeof det === "object" && !Array.isArray(det)
      ? (det as Record<string, unknown>).infoBasica
      : null;
  const info =
    infoBasica && typeof infoBasica === "object" && !Array.isArray(infoBasica)
      ? (infoBasica as Record<string, unknown>)
      : null;

  const categoria =
    optionalTrimString(body.categoria) ?? (info ? optionalTrimString(info.categoria) : null);

  return {
    categoria,
    ncm: pickString(body, log, ["ncm"]),
    origem: pickString(body, log, ["origem", "origem_produto", "origemProduto"]),
    cest: pickString(body, log, ["cest"]),
    expedicao_override_linha: pickString(body, log, ["expedicao_override_linha", "cdSaida"]),
  };
}

/** Lê NCM/origem das colunas ou do JSON legado (cadastros antigos). */
export function ncmOrigemFromSkuRow(row: {
  ncm?: string | null;
  origem?: string | null;
  detalhes_produto_json?: unknown;
}): { ncm: string | null; origem: string | null } {
  let ncm = optionalTrimString(row.ncm);
  let origem = optionalTrimString(row.origem);
  const det = row.detalhes_produto_json;
  if ((!ncm || !origem) && det && typeof det === "object" && !Array.isArray(det)) {
    const log = (det as Record<string, unknown>).logistica;
    if (log && typeof log === "object" && !Array.isArray(log)) {
      const l = log as Record<string, unknown>;
      if (!ncm) ncm = optionalTrimString(l.ncm);
      if (!origem) origem = optionalTrimString(l.origemProduto) ?? optionalTrimString(l.origem);
    }
  }
  return { ncm, origem };
}
