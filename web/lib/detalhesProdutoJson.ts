/**
 * Leitura/normalização de `skus.detalhes_produto_json` (cadastro multivariante).
 * O JSON costuma existir só no SKU pai (sufixo 000); variantes e grupos legados podem não ter o pai.
 */

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function campoPreenchido(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.some((x) => campoPreenchido(x));
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some(campoPreenchido);
  return false;
}

/** Aceita objeto jsonb ou string JSON serializada. */
export function parseDetalhesProdutoJson(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      const parsed = JSON.parse(t) as unknown;
      return asRecord(parsed);
    } catch {
      return null;
    }
  }
  return asRecord(raw);
}

/** Rascunhos antigos guardavam blocos em `produto.*` em vez da raiz. */
export function normalizarRaizDetalhesProduto(det: Record<string, unknown>): Record<string, unknown> {
  const prod = asRecord(det.produto);
  if (!prod) return det;

  const out: Record<string, unknown> = { ...det };
  const blocos = ["infoBasica", "caracteristicas", "qualidade", "midia", "guiado", "logistica", "medidas"] as const;
  for (const k of blocos) {
    if (!asRecord(out[k]) && asRecord(prod[k])) out[k] = prod[k];
  }
  return out;
}

const BLOCOS_DETALHES = ["infoBasica", "caracteristicas", "qualidade", "midia", "guiado", "logistica", "medidas"] as const;

/** Pontua quantos dados úteis existem (evita “ganhar” um JSON só com chaves null). */
export function scoreDetalhesProduto(det: Record<string, unknown> | null): number {
  if (!det) return 0;
  let score = 0;
  for (const bloco of BLOCOS_DETALHES) {
    const b = asRecord(det[bloco]);
    if (!b) continue;
    for (const v of Object.values(b)) {
      if (campoPreenchido(v)) score += 1;
    }
  }
  return score;
}

export function detalhesProdutoTemConteudo(det: Record<string, unknown> | null): boolean {
  return scoreDetalhesProduto(det) > 0;
}

/** Mescla blocos do JSON (alteração pendente parcial não apaga o que já estava no SKU). */
export function mergeDetalhesProdutoJson(atual: unknown, incoming: unknown): Record<string, unknown> | null {
  const a = parseDetalhesProdutoJson(atual);
  const b = parseDetalhesProdutoJson(incoming);
  if (!b) return a ? normalizarRaizDetalhesProduto(a) : null;
  if (!a) return normalizarRaizDetalhesProduto(b);
  const an = normalizarRaizDetalhesProduto(a);
  const bn = normalizarRaizDetalhesProduto(b);
  const out: Record<string, unknown> = { ...an, ...bn };
  for (const k of BLOCOS_DETALHES) {
    const A = asRecord(an[k]);
    const B = asRecord(bn[k]);
    if (!A && !B) continue;
    const bloco: Record<string, unknown> = { ...A };
    if (B) {
      for (const [bk, bv] of Object.entries(B)) {
        if (campoPreenchido(bv)) bloco[bk] = bv;
        else if (!(bk in bloco)) bloco[bk] = bv;
      }
    }
    out[k] = bloco;
  }
  return out;
}

/** Escolhe o JSON com mais dados entre pai, representante, filhos, etc. */
export function resolverDetalhesProdutoJson(...candidatos: unknown[]): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestScore = 0;
  for (const raw of candidatos) {
    const parsed = parseDetalhesProdutoJson(raw);
    if (!parsed) continue;
    const norm = normalizarRaizDetalhesProduto(parsed);
    const sc = scoreDetalhesProduto(norm);
    if (sc > bestScore) {
      bestScore = sc;
      best = norm;
    }
  }
  return best;
}

/** SKU de destino para gravar `detalhes_produto_json` (pai do bloco ou primeira linha do grupo). */
export function skuRowDestinoDetalhesGrupo<T extends { sku: string }>(
  grupoKey: string,
  rows: T[]
): T | null {
  const pk = grupoKey.trim().toUpperCase();
  if (!pk || rows.length === 0) return null;
  return rows.find((r) => r.sku.trim().toUpperCase() === pk) ?? rows[0] ?? null;
}

/** Chave de agrupamento (SKU pai …000). */
export function grupoKeyFromSku(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}000`;
}

/** Replica o melhor `detalhes_produto_json` do grupo em todos os SKUs (lista fornecedor/seller). */
export function propagarDetalhesProdutoJsonNoGrupo<T extends { sku: string; detalhes_produto_json?: unknown }>(
  rows: T[]
): T[] {
  const out = rows.map((row) => ({ ...row }));
  const porGrupo = new Map<string, T[]>();
  for (const row of out) {
    const key = grupoKeyFromSku(row.sku);
    if (!porGrupo.has(key)) porGrupo.set(key, []);
    porGrupo.get(key)!.push(row);
  }
  for (const membros of porGrupo.values()) {
    const melhor = resolverDetalhesProdutoJson(...membros.map((m) => m.detalhes_produto_json));
    if (!melhor) continue;
    for (const m of membros) {
      const merged = mergeDetalhesProdutoJson(m.detalhes_produto_json, melhor);
      if (merged) m.detalhes_produto_json = merged;
    }
  }
  return out;
}

/** Mescla `detalhes_produto_json` de alterações pendentes (seller/fornecedor). */
export function aplicarPendingDetalhesEmSkus<T extends { id: string; detalhes_produto_json?: unknown }>(
  rows: T[],
  pendingBySkuId: Map<string, Record<string, unknown>>
): T[] {
  return rows.map((row) => {
    const prop = pendingBySkuId.get(row.id);
    if (!prop || !("detalhes_produto_json" in prop)) return row;
    const merged = mergeDetalhesProdutoJson(row.detalhes_produto_json, prop.detalhes_produto_json);
    return merged ? { ...row, detalhes_produto_json: merged } : row;
  });
}
