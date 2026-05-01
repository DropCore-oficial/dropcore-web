/**
 * Rascunho do fluxo «Criar variantes» (fornecedor): chave localStorage, tipo JSON v1 e fusão servidor/local.
 */

export type CriarVariantesTabId =
  | "info-basica"
  | "caracteristicas"
  | "medidas"
  | "variacoes"
  | "lista-variacoes"
  | "qualidade"
  | "midia"
  | "dados-guiados"
  | "logistica";

export type ProdutoCaracteristicas = {
  tecido?: string;
  composicao?: string;
  caimento?: "slim" | "regular" | "oversized";
  elasticidade?: "baixa" | "media" | "alta";
  transparencia?: "nao" | "leve" | "alta";
  amassa?: boolean;
  clima?: "calor" | "frio" | "ambos";
  ocasioes?: string[];
  posicionamento?: "basico" | "intermediario" | "premium";
};

export type ProdutoQualidade = {
  naoDesbota?: boolean;
  encolhe?: boolean;
  costuraReforcada?: boolean;
  observacoes?: string;
};

export type ProdutoMidia = {
  principal?: string;
  frente?: string;
  costas?: string;
  detalhe?: string;
  lifestyle?: string;
  video?: string;
};

export type ProdutoGuiado = {
  diferencial?: string;
  indicacao?: string;
  observacoesSeller?: string;
};

export type Medida = {
  tamanho: string;
  largura?: number;
  comprimento?: number;
  ombro?: number;
  manga?: number;
  cintura?: number;
  quadril?: number;
  busto?: number;
  extras?: Record<string, number>;
};

export type Variante = {
  sku: string;
  cor: string;
  tamanho: string;
  estoque?: number;
  custo?: number;
  peso?: number;
  imagem?: string;
};

export type RascunhoCriarVariantesV1 = {
  v: 1;
  savedAt: string;
  tabAtiva: CriarVariantesTabId;
  nomeProduto: string;
  descricao: string;
  categoria?: string;
  marca: string;
  modelo?: string;
  tecido?: string;
  composicao?: string;
  caimento?: "" | "slim" | "regular" | "oversized";
  elasticidade?: "" | "baixa" | "media" | "alta";
  transparencia?: "" | "nao" | "leve" | "alta";
  amassa?: boolean | null;
  clima?: "" | "calor" | "frio" | "ambos";
  ocasioesUso?: string[];
  posicionamento?: "" | "basico" | "intermediario" | "premium";
  coresSelecionadas: string[];
  corCustom: string;
  tamanhosSelecionados: string[];
  tamanhoCustom: string;
  medidas?: Medida[];
  topicosMedidaSelecionados?: string[];
  topicosMedidaCustom?: string;
  dataLancamento: string;
  /** Removido do formulário; mantido opcional para rascunhos antigos no localStorage. */
  custoCompra?: string;
  custoPorTamanho: Record<string, string>;
  custoMatriz: Record<string, string>;
  custoPorCor: Record<string, string>;
  estoquePorTamanho: Record<string, string>;
  estoqueMatriz: Record<string, string>;
  estoquePorCor: Record<string, string>;
  fotoUrlPorCor: Record<string, string>;
  massaCusto: string;
  massaEstoque: string;
  peso: string;
  comp: string;
  largura: string;
  altura: string;
  linkFotos: string;
  linkVideo: string;
  midiaPrincipal?: string;
  midiaFrente?: string;
  midiaCostas?: string;
  midiaDetalhe?: string;
  midiaLifestyle?: string;
  naoDesbota?: boolean | null;
  encolhe?: boolean | null;
  costuraReforcada?: boolean | null;
  obsQualidade?: string;
  diferencial?: string;
  indicacao?: string;
  observacoesSeller?: string;
  slaEnvio?: "" | "24h" | "48h" | "72h";
  ncm?: string;
  cest?: string;
  origemProduto?: string;
  cfop?: string;
  unidadeComercial?: string;
  cdSaida?: string;
  /** Partes do local de saída (CD) — exibidas no formulário; `cdSaida` continua sendo a linha formatada. */
  cdSaidaCep?: string;
  cdSaidaLogradouro?: string;
  cdSaidaNumero?: string;
  cdSaidaComplemento?: string;
  cdSaidaBairro?: string;
  cdSaidaCidade?: string;
  cdSaidaUf?: string;
  /** Quando true, o endereço de saída espelha o «despacho padrão» do cadastro do fornecedor. */
  cdUsarDespachoCadastro?: boolean;
  produto?: {
    infoBasica: {
      nomeProduto: string;
      categoria?: string;
      marca?: string;
      modelo?: string;
    };
    caracteristicas: ProdutoCaracteristicas;
    medidas: Medida[];
    variacoes: Variante[];
    qualidade: ProdutoQualidade;
    midia: ProdutoMidia;
    guiado: ProdutoGuiado;
    logistica: {
      slaEnvio?: "24h" | "48h" | "72h";
      ncm?: string;
      cest?: string;
      origemProduto?: string;
      cfop?: string;
      unidadeComercial?: string;
      cdSaida?: string;
    };
  };
};

export const LS_RASCUNHO_CRIAR_VARIANTES = "dropcore:fornecedor:criar-variantes:rascunho:v1";

export type OrigemRascunhoCriarVariantes = "servidor" | "local";

function ts(iso: string): number {
  const n = new Date(iso).getTime();
  return Number.isFinite(n) ? n : 0;
}

/** Texto curto para o chip «Continuar rascunho» (topo + aninhado). */
export function rascunhoNomeExibicao(d: RascunhoCriarVariantesV1): string {
  const n = (d.nomeProduto || d.produto?.infoBasica?.nomeProduto || "").trim();
  return n;
}

function campoSemDataUrl(s: string | undefined): string | undefined {
  if (s == null || s === "") return s;
  return s.startsWith("data:") ? "" : s;
}

/**
 * Remove `data:` (base64) do JSON antes de guardar no `localStorage` — o limite do navegador é baixo
 * e o rascunho duplica fotos em `fotoUrlPorCor` e em `produto.variacoes[].imagem`.
 * A API continua a receber o payload completo no PUT.
 */
export function rascunhoLeveParaEspelhoLocal(d: RascunhoCriarVariantesV1): RascunhoCriarVariantesV1 {
  const fotoUrlPorCor: Record<string, string> = {};
  for (const [k, v] of Object.entries(d.fotoUrlPorCor ?? {})) {
    if (typeof v !== "string" || v.startsWith("data:")) continue;
    fotoUrlPorCor[k] = v;
  }

  const variacoes = (d.produto?.variacoes ?? []).map((row) => ({
    ...row,
    imagem: row.imagem?.startsWith("data:") ? "" : row.imagem ?? "",
  }));

  const mid = d.produto?.midia;
  const midiaLeve = mid
    ? {
        ...mid,
        principal: campoSemDataUrl(mid.principal),
        frente: campoSemDataUrl(mid.frente),
        costas: campoSemDataUrl(mid.costas),
        detalhe: campoSemDataUrl(mid.detalhe),
        lifestyle: campoSemDataUrl(mid.lifestyle),
      }
    : mid;

  const produto =
    d.produto != null
      ? {
          ...d.produto,
          variacoes,
          midia: midiaLeve ?? d.produto.midia,
        }
      : d.produto;

  return {
    ...d,
    fotoUrlPorCor,
    midiaPrincipal: campoSemDataUrl(d.midiaPrincipal),
    midiaFrente: campoSemDataUrl(d.midiaFrente),
    midiaCostas: campoSemDataUrl(d.midiaCostas),
    midiaDetalhe: campoSemDataUrl(d.midiaDetalhe),
    midiaLifestyle: campoSemDataUrl(d.midiaLifestyle),
    produto,
  };
}

function mapaTemValorString(rec: Record<string, string> | undefined): boolean {
  if (!rec || typeof rec !== "object") return false;
  for (const v of Object.values(rec)) {
    if (String(v ?? "").trim()) return true;
  }
  return false;
}

function mapaFotoUrl(rec: Record<string, string> | undefined): boolean {
  if (!rec || typeof rec !== "object") return false;
  for (const v of Object.values(rec)) {
    if (String(v ?? "").trim()) return true;
  }
  return false;
}

/**
 * Aceita JSON guardado no storage mesmo se `v` tiver sido omitido em versões antigas
 * (objeto ainda tem `savedAt` + campos do formulário).
 */
function coercerRascunhoV1Local(parsed: unknown): RascunhoCriarVariantesV1 | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (o.v === 1) {
    return parsed as RascunhoCriarVariantesV1;
  }
  const savedAt = o.savedAt;
  if (typeof savedAt !== "string" || !savedAt.trim()) return null;
  const temNome = typeof o.nomeProduto === "string" && o.nomeProduto.trim();
  const temProduto = o.produto && typeof o.produto === "object" && !Array.isArray(o.produto);
  const temCores = Array.isArray(o.coresSelecionadas) && o.coresSelecionadas.length > 0;
  const temTams = Array.isArray(o.tamanhosSelecionados) && o.tamanhosSelecionados.length > 0;
  const objNaoVazio = (x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) && Object.keys(x as object).length > 0;
  const temMapa =
    objNaoVazio(o.custoMatriz) ||
    objNaoVazio(o.estoqueMatriz) ||
    objNaoVazio(o.custoPorTamanho) ||
    objNaoVazio(o.estoquePorTamanho) ||
    objNaoVazio(o.custoPorCor) ||
    objNaoVazio(o.estoquePorCor) ||
    objNaoVazio(o.fotoUrlPorCor);
  if (!temNome && !temProduto && !temCores && !temTams && !temMapa) return null;
  return { ...(parsed as object), v: 1, savedAt } as RascunhoCriarVariantesV1;
}

export function parseLocalCriarVariantesDraft(): RascunhoCriarVariantesV1 | null {
  try {
    const raw = localStorage.getItem(LS_RASCUNHO_CRIAR_VARIANTES);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return coercerRascunhoV1Local(parsed);
  } catch {
    /* ignore */
  }
  return null;
}

export async function fetchServerCriarVariantesDraft(accessToken: string): Promise<RascunhoCriarVariantesV1 | null> {
  try {
    const res = await fetch("/api/fornecedor/produtos/rascunho", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as {
      draft?: unknown;
      atualizado_em?: string | null;
    };
    const draftRaw = j?.draft;
    if (!draftRaw || typeof draftRaw !== "object" || Array.isArray(draftRaw)) return null;
    let d = draftRaw as RascunhoCriarVariantesV1 & { v?: unknown };
    if (d.v !== 1) {
      const fixed = coercerRascunhoV1Local(draftRaw);
      if (!fixed) return null;
      d = fixed;
    }
    const savedAt = d.savedAt || j.atualizado_em || new Date().toISOString();
    return { ...d, savedAt };
  } catch {
    /* rede */
  }
  return null;
}

/** Evita que um rascunho vazio ganhe do cheio por causa só do `savedAt`. Inclui custo só por tamanho/cor (sem matriz). */
export function rascunhoTemConteudoSignificativo(d: RascunhoCriarVariantesV1): boolean {
  if ((d.nomeProduto || "").trim()) return true;
  if ((d.produto?.infoBasica?.nomeProduto || "").trim()) return true;
  if ((d.descricao || "").trim()) return true;
  if ((d.coresSelecionadas?.length ?? 0) > 0) return true;
  if ((d.tamanhosSelecionados?.length ?? 0) > 0) return true;
  if ((d.topicosMedidaSelecionados?.length ?? 0) > 0) return true;
  if (d.medidas?.some((m) => (m.tamanho || "").trim())) return true;
  if ((d.produto?.variacoes?.length ?? 0) > 0) return true;
  if ((d.marca || "").trim()) return true;
  if ((d.categoria || "").trim()) return true;
  if ((d.tecido || "").trim()) return true;
  if ((d.modelo || "").trim()) return true;
  if ((d.linkFotos || "").trim()) return true;
  if (mapaTemValorString(d.custoMatriz)) return true;
  if (mapaTemValorString(d.estoqueMatriz)) return true;
  if (mapaTemValorString(d.custoPorTamanho)) return true;
  if (mapaTemValorString(d.estoquePorTamanho)) return true;
  if (mapaTemValorString(d.custoPorCor)) return true;
  if (mapaTemValorString(d.estoquePorCor)) return true;
  if (mapaFotoUrl(d.fotoUrlPorCor)) return true;
  return false;
}

/**
 * Escolhe o rascunho entre API e localStorage.
 * Antes: só data (`savedAt`) — um rascunho vazio mais novo no servidor podia substituir um rascunho cheio só no aparelho.
 */
export function mergeCriarVariantesDrafts(
  serverDraft: RascunhoCriarVariantesV1 | null,
  localDraft: RascunhoCriarVariantesV1 | null
): { draft: RascunhoCriarVariantesV1; origem: OrigemRascunhoCriarVariantes } | null {
  if (!serverDraft && !localDraft) return null;

  if (serverDraft && !localDraft) {
    return { draft: serverDraft, origem: "servidor" };
  }
  if (!serverDraft && localDraft) {
    return { draft: localDraft, origem: "local" };
  }
  if (serverDraft && localDraft) {
    const serverOk = rascunhoTemConteudoSignificativo(serverDraft);
    const localOk = rascunhoTemConteudoSignificativo(localDraft);
    if (localOk && !serverOk) {
      return { draft: localDraft, origem: "local" };
    }
    if (serverOk && !localOk) {
      return { draft: serverDraft, origem: "servidor" };
    }
    if (ts(serverDraft.savedAt) >= ts(localDraft.savedAt)) {
      return { draft: serverDraft, origem: "servidor" };
    }
    return { draft: localDraft, origem: "local" };
  }
  return null;
}

export type ResumoRascunhoCriarVariantes = {
  savedAt: string;
  origem: OrigemRascunhoCriarVariantes;
  nomeResumo: string;
};

/** Para a lista «Meus produtos»: há rascunho e texto curto para o chip. */
export async function getResumoRascunhoCriarVariantes(accessToken: string | undefined): Promise<ResumoRascunhoCriarVariantes | null> {
  if (!accessToken) return null;
  const server = await fetchServerCriarVariantesDraft(accessToken);
  const local = parseLocalCriarVariantesDraft();
  const m = mergeCriarVariantesDrafts(server, local);
  if (!m) return null;
  const nome = rascunhoNomeExibicao(m.draft);
  const nomeResumo = nome.length > 40 ? `${nome.slice(0, 37)}…` : nome || "Sem título";
  const savedAt =
    m.draft.savedAt && String(m.draft.savedAt).trim() ? m.draft.savedAt : new Date().toISOString();
  return { savedAt, origem: m.origem, nomeResumo };
}
