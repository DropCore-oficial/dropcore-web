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
  custoCompra: string;
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

export function parseLocalCriarVariantesDraft(): RascunhoCriarVariantesV1 | null {
  try {
    const raw = localStorage.getItem(LS_RASCUNHO_CRIAR_VARIANTES);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && (parsed as RascunhoCriarVariantesV1).v === 1) {
      return parsed as RascunhoCriarVariantesV1;
    }
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
    const j = (await res.json().catch(() => ({}))) as {
      draft?: unknown;
      atualizado_em?: string | null;
    };
    if (j?.draft && typeof j.draft === "object" && !Array.isArray(j.draft) && (j.draft as RascunhoCriarVariantesV1).v === 1) {
      const d = j.draft as RascunhoCriarVariantesV1;
      const savedAt = d.savedAt || j.atualizado_em || new Date().toISOString();
      return { ...d, savedAt };
    }
  } catch {
    /* rede */
  }
  return null;
}

/**
 * Escolhe o rascunho mais recente entre API e localStorage (mesma regra que a página de criar variantes).
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
  const nome = (m.draft.nomeProduto || "").trim();
  const nomeResumo = nome.length > 40 ? `${nome.slice(0, 37)}…` : nome || "Sem título";
  return { savedAt: m.draft.savedAt, origem: m.origem, nomeResumo };
}
