/**
 * Monta CSV para importação de produtos no ERP Olist/Tiny (planilha modelo).
 * Ref.: https://ajuda.olist.com/produtos/importar-planilha-de-produtos
 */
import {
  emptyOlistTinyProdutosImportRow,
  OLIST_TINY_PRODUTOS_IMPORT_HEADERS,
  type OlistTinyProdutosImportRow,
} from "@/lib/olistTinyProdutosImportTemplate";

export type CatalogSkuForOlistExport = {
  sku: string;
  nome_produto: string;
  cor: string;
  tamanho: string;
  status: string;
  categoria: string | null;
  estoque_atual: number | null;
  custo_total: number | null;
  imagem_url: string | null;
  link_fotos: string | null;
  descricao: string | null;
  ncm: string | null;
  origem: string | null;
  habilitado_venda?: boolean;
};

/** @deprecated Use OLIST_TINY_PRODUTOS_IMPORT_HEADERS */
export const OLIST_PRODUTOS_CSV_HEADERS = OLIST_TINY_PRODUTOS_IMPORT_HEADERS;

const SEP = ";";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function csvCampo(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes('"') || s.includes(SEP) || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function isSementeSku(sku: string, nome: string, cor: string, tam: string): boolean {
  if (sku === "DJU999000") return true;
  if (!sku.endsWith("000")) return false;
  if (nome.toLowerCase().includes("semente")) return true;
  if (!cor && !tam) return true;
  return false;
}

function isGrupoOculto(sku: string): boolean {
  const key = sku.length >= 3 ? sku.slice(0, -3) + "000" : sku;
  return key === "DJU999000";
}

export function paiKeyFromSku(sku: string): string {
  const s = sku.trim();
  return s.length >= 3 ? s.slice(0, -3) + "000" : s;
}

function parseFotoUrls(imagem_url: string | null, link_fotos: string | null): string[] {
  const out: string[] = [];
  const main = str(imagem_url);
  if (main && /^https?:\/\//i.test(main)) out.push(main);
  const raw = str(link_fotos);
  if (raw) {
    for (const chunk of raw.split(/(?:\r?\n|[,;|])+/).map((x) => x.trim()).filter(Boolean)) {
      if (/^https?:\/\//i.test(chunk)) out.push(chunk);
    }
  }
  return [...new Set(out)].slice(0, 10);
}

function normalizeNcm(ncm: string | null): string {
  const digits = str(ncm).replace(/\D/g, "");
  return digits.slice(0, 8);
}

function normalizeOrigem(origem: string | null): string {
  const o = str(origem);
  if (!o) return "0";
  if (/^\d$/.test(o)) return o;
  if (o.startsWith("0")) return o;
  return o;
}

function buildAtributos(cor: string, tamanho: string): string {
  const parts: string[] = [];
  const c = str(cor);
  const t = str(tamanho);
  if (c) parts.push(`Cor:${c}`);
  if (t) parts.push(`Tamanho:${t}`);
  return parts.join("||");
}

function situacaoFromStatus(status: string): string {
  return str(status).toLowerCase() === "ativo" ? "Ativo" : "Inativo";
}

function descricaoLinha(item: CatalogSkuForOlistExport, fallbackNome: string): string {
  const desc = str(item.descricao);
  if (desc.length >= 3) return desc;
  const nome = str(item.nome_produto) || fallbackNome;
  const cor = str(item.cor);
  const tam = str(item.tamanho);
  const bits = [nome, cor, tam].filter(Boolean);
  return bits.join(" — ") || nome;
}

type Grupo = { paiKey: string; pai: CatalogSkuForOlistExport | null; filhos: CatalogSkuForOlistExport[] };

function agruparItens(items: CatalogSkuForOlistExport[]): Grupo[] {
  const filtrados = items.filter((i) => {
    const sku = str(i.sku);
    if (!sku || isGrupoOculto(sku)) return false;
    if (isSementeSku(sku, str(i.nome_produto), str(i.cor), str(i.tamanho))) return false;
    return true;
  });

  const porPai = new Map<string, { pai: CatalogSkuForOlistExport | null; filhos: CatalogSkuForOlistExport[] }>();
  for (const item of filtrados) {
    const key = paiKeyFromSku(item.sku);
    if (!porPai.has(key)) porPai.set(key, { pai: null, filhos: [] });
    const g = porPai.get(key)!;
    if (str(item.sku).endsWith("000")) g.pai = item;
    else g.filhos.push(item);
  }

  return Array.from(porPai.entries())
    .map(([paiKey, g]) => ({
      paiKey,
      pai: g.pai,
      filhos: g.filhos.sort((a, b) => str(a.sku).localeCompare(str(b.sku))),
    }))
    .sort((a, b) => a.paiKey.localeCompare(b.paiKey));
}

function rowToCells(cells: OlistTinyProdutosImportRow): string[] {
  return OLIST_TINY_PRODUTOS_IMPORT_HEADERS.map((h) => csvCampo(cells[h] ?? ""));
}

function applyFotosToRow(row: OlistTinyProdutosImportRow, fotos: string[]): void {
  const principais: Array<keyof OlistTinyProdutosImportRow> = [
    "URL imagem 1",
    "URL imagem 2",
    "URL imagem 3",
    "URL imagem 4",
    "URL imagem 5",
    "URL imagem 6",
  ];
  const extras: Array<keyof OlistTinyProdutosImportRow> = [
    "URL imagem externa 7",
    "URL imagem externa 8",
    "URL imagem externa 9",
    "URL imagem externa 10",
  ];
  for (let i = 0; i < principais.length; i++) {
    row[principais[i]!] = fotos[i] ?? "";
  }
  for (let j = 0; j < extras.length; j++) {
    row[extras[j]!] = fotos[principais.length + j] ?? "";
  }
}

function permitirVendasCell(item: CatalogSkuForOlistExport): string {
  if (item.habilitado_venda === true) return "Sim";
  if (item.habilitado_venda === false) return "Não";
  return "";
}

function baseCells(item: CatalogSkuForOlistExport): OlistTinyProdutosImportRow {
  const row = emptyOlistTinyProdutosImportRow();
  const fotos = parseFotoUrls(item.imagem_url, item.link_fotos);
  const custo =
    item.custo_total != null && Number.isFinite(item.custo_total) ? String(item.custo_total).replace(".", ",") : "";
  const estoque =
    item.estoque_atual != null && Number.isFinite(item.estoque_atual)
      ? String(Math.max(0, Math.floor(item.estoque_atual)))
      : "0";

  row.ID = "";
  row["Código (SKU)"] = str(item.sku);
  row.Descrição = descricaoLinha(item, str(item.nome_produto));
  row.Unidade = "UN";
  row["NCM (Classificação fiscal)"] = normalizeNcm(item.ncm);
  row.Origem = normalizeOrigem(item.origem);
  row.Preço = "";
  row["Valor IPI fixo"] = "";
  row.Observações = "";
  row.Situação = situacaoFromStatus(item.status);
  row.Estoque = estoque;
  row["Preço de custo"] = custo;
  row["GTIN/EAN"] = "";
  row["Tipo do produto"] = "S";
  row["Código do pai"] = "";
  row.Variações = buildAtributos(item.cor, item.tamanho);
  row.Marca = "";
  row.Categoria = str(item.categoria);
  row["Sob encomenda"] = "Não";
  row["Preço promocional"] = "";
  row["Permitir inclusão nas vendas"] = permitirVendasCell(item);
  applyFotosToRow(row, fotos);
  return row;
}

/**
 * Gera linhas CSV (sem BOM) para importação Olist.
 * Com variações: linha pai (V) + filhos (S) ligados por Código do Pai.
 */
export function buildOlistProdutosCsvLines(items: CatalogSkuForOlistExport[]): string[] {
  const grupos = agruparItens(items);
  const lines: string[] = [OLIST_TINY_PRODUTOS_IMPORT_HEADERS.join(SEP)];

  for (const g of grupos) {
    const paiSku = g.pai?.sku ? str(g.pai.sku) : g.paiKey;
    const nomeGrupo = str(g.pai?.nome_produto) || str(g.filhos[0]?.nome_produto) || paiSku;

    if (g.filhos.length > 0) {
      const paiRef = g.pai ?? g.filhos[0]!;
      const paiCells = baseCells({
        ...paiRef,
        sku: paiSku,
        nome_produto: nomeGrupo,
        cor: "",
        tamanho: "",
        estoque_atual: null,
      });
      paiCells["Tipo do produto"] = "V";
      paiCells.Variações = "";
      paiCells.Estoque = "0";
      lines.push(rowToCells(paiCells).join(SEP));

      for (const filho of g.filhos) {
        const child = baseCells(filho);
        child["Tipo do produto"] = "S";
        child["Código do pai"] = paiSku;
        child.Variações = buildAtributos(filho.cor, filho.tamanho);
        lines.push(rowToCells(child).join(SEP));
      }
      continue;
    }

    if (g.pai) {
      const simple = baseCells(g.pai);
      simple["Tipo do produto"] = "S";
      simple["Código do pai"] = "";
      lines.push(rowToCells(simple).join(SEP));
    }
  }

  return lines;
}

export function buildOlistProdutosCsv(items: CatalogSkuForOlistExport[]): string {
  return "\uFEFF" + buildOlistProdutosCsvLines(items).join("\n");
}

export function filterSkusForOlistExport(
  items: CatalogSkuForOlistExport[],
  scope: "habilitados" | "todos",
): CatalogSkuForOlistExport[] {
  if (scope === "todos") return items;
  return items.filter((i) => i.habilitado_venda === true);
}

/** Exporta só SKUs do grupo (pai + variações). */
export function filterSkusByGrupo(items: CatalogSkuForOlistExport[], grupoKey: string): CatalogSkuForOlistExport[] {
  const key = str(grupoKey).toUpperCase();
  if (!key) return [];
  return items.filter((i) => paiKeyFromSku(str(i.sku)) === key);
}
