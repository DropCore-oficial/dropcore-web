/**
 * Monta CSV para importação de produtos no ERP Olist/Tiny (planilha modelo).
 * Ref.: https://ajuda.olist.com/produtos/importar-planilha-de-produtos
 */
import { linkFotosComoSrcMiniatura } from "@/lib/fornecedorProdutoImagemSrc";
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
  marca: string | null;
  cest: string | null;
  peso_kg: number | null;
  peso_liquido_kg: number | null;
  peso_bruto_kg: number | null;
  comprimento_cm: number | null;
  largura_cm: number | null;
  altura_cm: number | null;
  habilitado_venda?: boolean;
};

/** @deprecated Use OLIST_TINY_PRODUTOS_IMPORT_HEADERS */
export const OLIST_PRODUTOS_CSV_HEADERS = OLIST_TINY_PRODUTOS_IMPORT_HEADERS;

/** Planilha oficial Olist/Tiny: vírgula + campos entre aspas. */
const SEP = ",";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function csvCampo(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/** CEST no padrão Olist (ex.: 28.038.00). */
export function formatCestOlist(cest: string | null): string {
  const raw = str(cest);
  if (!raw) return "";
  if (/^\d{2}\.\d{3}\.\d{2}$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length !== 7) return raw;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 7)}`;
}

/** Peso/dimensão com vírgula decimal (ex.: 0,350). */
export function formatMedidaOlist(value: number, casas = 3): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const n = Math.round(value * 10 ** casas) / 10 ** casas;
  return n.toFixed(casas).replace(".", ",");
}

/** Olist só aceita categoria com caminho `Nível 1 > Nível 2` já existente no ERP. */
export function categoriaOlist(categoria: string | null): string {
  const c = str(categoria);
  if (!c || !c.includes(">")) return "";
  return c
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" > ");
}

function isSementeSku(sku: string, nome: string): boolean {
  if (sku === "DJU999000") return true;
  if (nome.toLowerCase().includes("semente")) return true;
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

/** Olist importa só URL http(s) curta — `data:image/base64` estoura limite de 2 MB. */
export function urlImagemExportOlist(url: string | null | undefined): string | null {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s || s.startsWith("data:")) return null;
  const u = linkFotosComoSrcMiniatura(s);
  if (!u || u.startsWith("data:")) return null;
  if (u.length > 2048) return null;
  return u;
}

function parseFotoUrls(imagem_url: string | null, link_fotos: string | null): string[] {
  const out: string[] = [];
  const tryAdd = (raw: string) => {
    const u = urlImagemExportOlist(raw);
    if (u) out.push(u);
  };
  tryAdd(str(imagem_url));
  const raw = str(link_fotos);
  if (raw) {
    for (const chunk of raw.split(/(?:\r?\n|[,;|])+/).map((x) => x.trim()).filter(Boolean)) {
      tryAdd(chunk);
    }
  }
  return [...new Set(out)].slice(0, 6);
}

function collectDescricaoComplementarGrupo(
  pai: CatalogSkuForOlistExport | null,
  filhos: CatalogSkuForOlistExport[],
  nomeGrupo: string,
): string {
  for (const item of [pai, ...filhos]) {
    if (!item) continue;
    const d = descricaoComplementarOlist(item, nomeGrupo);
    if (d) return d;
  }
  return "";
}

function collectFotosGrupo(pai: CatalogSkuForOlistExport | null, filhos: CatalogSkuForOlistExport[]): string[] {
  const out: string[] = [];
  for (const item of [pai, ...filhos]) {
    if (!item) continue;
    for (const u of parseFotoUrls(item.imagem_url, item.link_fotos)) {
      if (!out.includes(u)) out.push(u);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

type LogisticaGrupoFields = Pick<
  CatalogSkuForOlistExport,
  | "ncm"
  | "origem"
  | "cest"
  | "marca"
  | "peso_kg"
  | "peso_liquido_kg"
  | "peso_bruto_kg"
  | "comprimento_cm"
  | "largura_cm"
  | "altura_cm"
>;

function posNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v > 0;
}

/** Peso/NCM/dimensões do representante ou filho entram no pai e nos SKUs sem dado próprio. */
export function collectLogisticaGrupo(
  pai: CatalogSkuForOlistExport | null,
  filhos: CatalogSkuForOlistExport[],
): Partial<LogisticaGrupoFields> {
  const out: Partial<LogisticaGrupoFields> = {};
  for (const item of [pai, ...filhos]) {
    if (!item) continue;
    if (out.peso_liquido_kg == null && posNum(item.peso_liquido_kg)) out.peso_liquido_kg = item.peso_liquido_kg;
    if (out.peso_bruto_kg == null && posNum(item.peso_bruto_kg)) out.peso_bruto_kg = item.peso_bruto_kg;
    if (out.peso_kg == null && posNum(item.peso_kg)) out.peso_kg = item.peso_kg;
    if (out.comprimento_cm == null && posNum(item.comprimento_cm)) out.comprimento_cm = item.comprimento_cm;
    if (out.largura_cm == null && posNum(item.largura_cm)) out.largura_cm = item.largura_cm;
    if (out.altura_cm == null && posNum(item.altura_cm)) out.altura_cm = item.altura_cm;
    if (out.ncm == null && str(item.ncm)) out.ncm = item.ncm;
    if (out.origem == null && str(item.origem)) out.origem = item.origem;
    if (out.cest == null && str(item.cest)) out.cest = item.cest;
    if (out.marca == null && str(item.marca)) out.marca = item.marca;
  }
  return out;
}

export function mergeComLogisticaGrupo(
  item: CatalogSkuForOlistExport,
  grupo: Partial<LogisticaGrupoFields>,
): CatalogSkuForOlistExport {
  const pickStr = (own: string | null, fallback: string | null | undefined) =>
    str(own) ? own : fallback != null && str(fallback) ? fallback : own;

  return {
    ...item,
    ncm: pickStr(item.ncm, grupo.ncm),
    origem: pickStr(item.origem, grupo.origem),
    cest: pickStr(item.cest, grupo.cest),
    marca: pickStr(item.marca, grupo.marca),
    peso_liquido_kg: posNum(item.peso_liquido_kg) ? item.peso_liquido_kg : (grupo.peso_liquido_kg ?? item.peso_liquido_kg),
    peso_bruto_kg: posNum(item.peso_bruto_kg) ? item.peso_bruto_kg : (grupo.peso_bruto_kg ?? item.peso_bruto_kg),
    peso_kg: posNum(item.peso_kg) ? item.peso_kg : (grupo.peso_kg ?? item.peso_kg),
    comprimento_cm: posNum(item.comprimento_cm) ? item.comprimento_cm : (grupo.comprimento_cm ?? item.comprimento_cm),
    largura_cm: posNum(item.largura_cm) ? item.largura_cm : (grupo.largura_cm ?? item.largura_cm),
    altura_cm: posNum(item.altura_cm) ? item.altura_cm : (grupo.altura_cm ?? item.altura_cm),
  };
}

/** Modelo Olist: `6109.10.00` (8 dígitos com pontos), não só `61091000`. */
export function formatNcmOlist(ncm: string | null): string {
  const digits = str(ncm).replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return digits;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
}

/** Pipe (`|`) na descrição conflita com o separador de variações da Olist. */
export function sanitizeDescricaoOlist(text: string): string {
  return text
    .replace(/\|/g, " — ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Código de origem NF-e (0–8) — planilha Olist não aceita só o texto "Nacional". */
export function normalizeOrigemOlist(origem: string | null): string {
  const o = str(origem);
  if (!o) return "0";
  if (/^[0-8]$/.test(o)) return o;
  const prefixo = o.match(/^([0-8])\s*-/);
  if (prefixo) return prefixo[1];
  const lower = o.toLowerCase();
  if (lower.includes("nacional") && !lower.includes("estrangeir")) return "0";
  return "0";
}

/** Decimais BR na importação Olist (vírgula: ex. 34,50). Ponto quebra com "Preço inválido". */
function formatDecimalOlist(value: number): string {
  const n = Math.round(value * 100) / 100;
  return n.toFixed(2).replace(".", ",");
}

function resolveCustoUnit(item: CatalogSkuForOlistExport, fallbackCusto?: number | null): number | null {
  const c = item.custo_total;
  if (c != null && Number.isFinite(c) && c > 0) return c;
  if (fallbackCusto != null && Number.isFinite(fallbackCusto) && fallbackCusto > 0) return fallbackCusto;
  return null;
}

const PRECO_VENDA_ZERADO_OLIST = "0,00";

/** Custo na coluna Preço de custo; `margemPct` opcional (ex.: 30 → +30% no custo). */
export function precoCustoOlistFromCusto(custo: number, margemPct = 0): string {
  if (!Number.isFinite(custo) || custo <= 0) return "";
  const mult = 1 + Math.max(0, margemPct) / 100;
  return formatDecimalOlist(custo * mult);
}

/** @deprecated Use precoCustoOlistFromCusto — mantido para testes legados. */
export function precoVendaOlistFromCusto(custo: number, margemPct = 0): string {
  return precoCustoOlistFromCusto(custo, margemPct);
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

function descricaoTituloOlist(item: CatalogSkuForOlistExport, fallbackNome: string): string {
  const nome = str(item.nome_produto) || fallbackNome;
  return sanitizeDescricaoOlist(nome);
}

function descricaoComplementarOlist(item: CatalogSkuForOlistExport, fallbackNome: string): string {
  const desc = sanitizeDescricaoOlist(str(item.descricao));
  const titulo = descricaoTituloOlist(item, fallbackNome);
  if (desc.length >= 10 && desc !== titulo) return desc;
  return "";
}

function resolvePesoLiquido(item: CatalogSkuForOlistExport): number | null {
  const pl = item.peso_liquido_kg ?? item.peso_kg;
  return pl != null && Number.isFinite(pl) && pl > 0 ? pl : null;
}

function resolvePesoBruto(item: CatalogSkuForOlistExport): number | null {
  const pb = item.peso_bruto_kg ?? item.peso_kg;
  return pb != null && Number.isFinite(pb) && pb > 0 ? pb : null;
}

function temDimensoesPacote(item: CatalogSkuForOlistExport): boolean {
  return [item.comprimento_cm, item.largura_cm, item.altura_cm].some(
    (v) => v != null && Number.isFinite(v) && v > 0,
  );
}

function applyLogisticaToRow(row: OlistTinyProdutosImportRow, item: CatalogSkuForOlistExport): void {
  const pl = resolvePesoLiquido(item);
  const pb = resolvePesoBruto(item);
  if (pl != null) row["Peso líquido (Kg)"] = formatMedidaOlist(pl);
  if (pb != null) row["Peso bruto (Kg)"] = formatMedidaOlist(pb);

  const larg = item.largura_cm;
  const alt = item.altura_cm;
  const comp = item.comprimento_cm;
  if (larg != null && Number.isFinite(larg) && larg > 0) row["Largura embalagem"] = formatMedidaOlist(larg, 1);
  if (alt != null && Number.isFinite(alt) && alt > 0) row["Altura Embalagem"] = formatMedidaOlist(alt, 1);
  if (comp != null && Number.isFinite(comp) && comp > 0) row["Comprimento embalagem"] = formatMedidaOlist(comp, 1);

  if (temDimensoesPacote(item) || pl != null || pb != null) {
    row["Formato embalagem"] = "Pacote / Caixa";
  }

  row.CEST = formatCestOlist(item.cest);
  row.Marca = str(item.marca);
}

type Grupo = { paiKey: string; pai: CatalogSkuForOlistExport | null; filhos: CatalogSkuForOlistExport[] };

function agruparItens(items: CatalogSkuForOlistExport[]): Grupo[] {
  const filtrados = items.filter((i) => {
    const sku = str(i.sku);
    if (!sku || isGrupoOculto(sku)) return false;
    if (isSementeSku(sku, str(i.nome_produto))) return false;
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
  if (item.habilitado_venda === false) return "Não";
  return "Sim";
}


function baseCells(
  item: CatalogSkuForOlistExport,
  opts?: {
    margemPct?: number;
    fallbackCusto?: number | null;
    fallbackFotos?: string[];
    nomeGrupo?: string;
    incluirFotos?: boolean;
    incluirDescricaoComplementar?: boolean;
  },
): OlistTinyProdutosImportRow {
  const row = emptyOlistTinyProdutosImportRow();
  const nomeGrupo = opts?.nomeGrupo ?? str(item.nome_produto);
  const incluirFotos = opts?.incluirFotos !== false;
  let fotos: string[] = [];
  if (incluirFotos) {
    fotos = parseFotoUrls(item.imagem_url, item.link_fotos);
    if (fotos.length === 0 && opts?.fallbackFotos?.length) fotos = opts.fallbackFotos;
  }
  const margemPct = opts?.margemPct ?? 0;
  const custoNum = resolveCustoUnit(item, opts?.fallbackCusto);
  const precoCusto = custoNum != null ? precoCustoOlistFromCusto(custoNum, margemPct) : "";
  const estoque =
    item.estoque_atual != null && Number.isFinite(item.estoque_atual)
      ? String(Math.max(0, Math.floor(item.estoque_atual)))
      : "0";

  row.ID = "";
  row["Código (SKU)"] = str(item.sku);
  row.Descrição = descricaoTituloOlist(item, nomeGrupo);
  row.Unidade = "Un";
  row["NCM (Classificação fiscal)"] = formatNcmOlist(item.ncm);
  row.Origem = normalizeOrigemOlist(item.origem);
  row.Preço = custoNum != null ? PRECO_VENDA_ZERADO_OLIST : "";
  row["Valor IPI fixo"] = "";
  row.Observações = "";
  row.Situação = situacaoFromStatus(item.status);
  row.Estoque = estoque;
  row["Preço de custo"] = precoCusto;
  row["GTIN/EAN"] = "";
  row["Tipo do produto"] = "S";
  row["Código do pai"] = "";
  row.Variações = buildAtributos(item.cor, item.tamanho);
  row.Categoria = categoriaOlist(item.categoria);
  row["Sob encomenda"] = "Não";
  row["Preço promocional"] = "";
  row["Controlar lotes"] = "Não";
  row["Permitir inclusão nas vendas"] = permitirVendasCell(item);
  row["Descrição complementar"] =
    opts?.incluirDescricaoComplementar === false ? "" : descricaoComplementarOlist(item, nomeGrupo);
  applyLogisticaToRow(row, item);
  if (incluirFotos) applyFotosToRow(row, fotos);
  return row;
}

/**
 * Gera linhas CSV (sem BOM) para importação Olist.
 * Com variações: linha pai (V) + filhos (S) ligados por Código do Pai.
 */
export function buildOlistProdutosCsvLines(
  items: CatalogSkuForOlistExport[],
  opts?: { margemPct?: number },
): string[] {
  const margemPct = opts?.margemPct ?? 0;
  const grupos = agruparItens(items);
  const lines: string[] = [OLIST_TINY_PRODUTOS_IMPORT_HEADERS.map((h) => csvCampo(h)).join(SEP)];

  for (const g of grupos) {
    const paiSku = g.pai?.sku ? str(g.pai.sku) : g.paiKey;
    const nomeGrupo = str(g.pai?.nome_produto) || str(g.filhos[0]?.nome_produto) || paiSku;
    const custoGrupo = g.filhos.reduce<number | null>((acc, f) => {
      const c = resolveCustoUnit(f);
      if (c == null) return acc;
      return acc == null ? c : Math.max(acc, c);
    }, resolveCustoUnit(g.pai ?? g.filhos[0]!));
    const fotosGrupo = collectFotosGrupo(g.pai, g.filhos);
    const descricaoComplementarGrupo = collectDescricaoComplementarGrupo(g.pai, g.filhos, nomeGrupo);
    const logisticaGrupo = collectLogisticaGrupo(g.pai, g.filhos);

    if (g.filhos.length > 0) {
      const paiCells = baseCells(
        mergeComLogisticaGrupo(
          {
            ...(g.pai ?? g.filhos[0]!),
            sku: paiSku,
            nome_produto: nomeGrupo,
            cor: "",
            tamanho: "",
            estoque_atual: null,
            custo_total: custoGrupo,
          },
          logisticaGrupo,
        ),
        { margemPct, fallbackCusto: custoGrupo, fallbackFotos: fotosGrupo, nomeGrupo, incluirFotos: true, incluirDescricaoComplementar: true },
      );
      paiCells["Tipo do produto"] = "V";
      paiCells.Variações = "";
      paiCells.Estoque = "0";
      paiCells.Preço = PRECO_VENDA_ZERADO_OLIST;
      paiCells["Permitir inclusão nas vendas"] = "Sim";
      if (descricaoComplementarGrupo) paiCells["Descrição complementar"] = descricaoComplementarGrupo;
      lines.push(rowToCells(paiCells).join(SEP));

      for (const filho of g.filhos) {
        const child = baseCells(mergeComLogisticaGrupo(filho, logisticaGrupo), {
          margemPct,
          fallbackCusto: custoGrupo,
          nomeGrupo,
          incluirFotos: false,
          incluirDescricaoComplementar: false,
        });
        child["Tipo do produto"] = "S";
        child["Código do pai"] = paiSku;
        child.Variações = buildAtributos(filho.cor, filho.tamanho);
        lines.push(rowToCells(child).join(SEP));
      }
      continue;
    }

    if (g.pai) {
      const logisticaSolo = collectLogisticaGrupo(g.pai, g.filhos);
      const simple = baseCells(mergeComLogisticaGrupo(g.pai, logisticaSolo), { margemPct });
      simple["Tipo do produto"] = "S";
      simple["Código do pai"] = "";
      lines.push(rowToCells(simple).join(SEP));
    }
  }

  return lines;
}

export function buildOlistProdutosCsv(items: CatalogSkuForOlistExport[], opts?: { margemPct?: number }): string {
  return "\uFEFF" + buildOlistProdutosCsvLines(items, opts).join("\n");
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
