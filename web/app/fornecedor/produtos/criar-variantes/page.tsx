"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { FornecedorNav } from "../../FornecedorNav";
import { NotificationToasts } from "@/components/NotificationToasts";
import { toTitleCase } from "@/lib/formatText";
import {
  CORES_PREDEFINIDAS,
  TAMANHOS_PREDEFINIDOS,
  caimentoOptions,
  climaOptions,
  elasticidadeOptions,
  posicionamentoOptions,
  transparenciaOptions,
} from "@/lib/fornecedorVariantesUi";
import { chaveEstoqueVariante } from "@/lib/estoqueVarianteKeys";
import {
  LS_RASCUNHO_CRIAR_VARIANTES,
  type Medida,
  type RascunhoCriarVariantesV1,
  type CriarVariantesTabId,
  type Variante,
  parseLocalCriarVariantesDraft,
  fetchServerCriarVariantesDraft,
  mergeCriarVariantesDrafts,
  rascunhoLeveParaEspelhoLocal,
} from "@/lib/fornecedorCriarVariantesRascunho";
import { buildExpedicaoPadraoLinha } from "@/lib/expedicaoFornecedorFormat";
import { cepParaConsultaViaCep } from "@/lib/cepViaCep";
import {
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_BODY,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SOFT,
} from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

function upperBr(s: string): string {
  return s.toLocaleUpperCase("pt-BR");
}

/** Resposta mínima do ViaCEP (https://viacep.com.br/). */
type ViaCepJson = {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

type PartesEnderecoCd = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type ProdutoExistenteEdicao = {
  id: string;
  sku: string;
  nome_produto: string;
  cor: string | null;
  tamanho: string | null;
  estoque_atual: number | null;
  custo_base: number | null;
  peso_kg: number | null;
  categoria?: string | null;
  marca?: string | null;
  descricao?: string | null;
  data_lancamento?: string | null;
  link_fotos?: string | null;
  imagem_url?: string | null;
  ncm?: string | null;
  origem?: string | null;
  cest?: string | null;
  cfop?: string | null;
  comprimento_cm?: number | null;
  largura_cm?: number | null;
  altura_cm?: number | null;
  expedicao_override_linha?: string | null;
  detalhes_produto_json?: Record<string, unknown> | null;
};

function grupoKeyFromSku(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}000`;
}

function slaFromExpedicaoLinha(raw: string | null | undefined): "" | "24h" | "48h" | "72h" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("24h")) return "24h";
  if (s.includes("48h")) return "48h";
  if (s.includes("72h")) return "72h";
  return "";
}

function numToStr(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "" : String(v);
}

function asObj(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function pairKeyFromValues(cor: string | null | undefined, tamanho: string | null | undefined): string {
  return `${String(cor ?? "").trim().toLowerCase()}|${String(tamanho ?? "").trim().toUpperCase()}`;
}

function montarRascunhoEdicao(
  grupoKey: string,
  rows: ProdutoExistenteEdicao[]
): RascunhoCriarVariantesV1 | null {
  const pk = grupoKey.trim().toUpperCase();
  if (!pk) return null;
  const grupoRows = rows
    .filter((r) => grupoKeyFromSku(r.sku) === pk)
    .sort((a, b) => a.sku.localeCompare(b.sku));
  if (grupoRows.length === 0) return null;

  const pai = grupoRows.find((r) => r.sku.trim().toUpperCase() === pk) ?? grupoRows[0];
  const detalhes = asObj(pai.detalhes_produto_json);
  const infoBasica = asObj(detalhes?.infoBasica);
  const caracteristicas = asObj(detalhes?.caracteristicas);
  const qualidade = asObj(detalhes?.qualidade);
  const guiado = asObj(detalhes?.guiado);
  const logistica = asObj(detalhes?.logistica);
  const midia = asObj(detalhes?.midia);
  const variantesBase = grupoRows.filter((r) => r.sku.trim().toUpperCase() !== pk);
  const variantes = variantesBase.length > 0 ? variantesBase : grupoRows;

  const coresSelecionadas = new Set<string>();
  const tamanhosSelecionados = new Set<string>();
  const custoMatriz: Record<string, string> = {};
  const estoqueMatriz: Record<string, string> = {};
  const fotoUrlPorCor: Record<string, string> = {};

  for (const v of variantes) {
    const cor = toTitleCase(String(v.cor ?? "").trim());
    const tamanho = String(v.tamanho ?? "").trim().toUpperCase();
    if (cor) coresSelecionadas.add(cor);
    if (tamanho) tamanhosSelecionados.add(tamanho);
    const key = chaveEstoqueVariante(cor, tamanho);

    if (v.custo_base != null && Number.isFinite(v.custo_base)) {
      custoMatriz[key] = String(v.custo_base);
    }
    if (v.estoque_atual != null && Number.isFinite(v.estoque_atual)) {
      estoqueMatriz[key] = String(v.estoque_atual);
    }
    if (cor && !fotoUrlPorCor[cor.toLowerCase()]) {
      const foto = String(v.imagem_url ?? "").trim();
      if (foto) fotoUrlPorCor[cor.toLowerCase()] = foto;
    }
  }

  const tamanhosOrdenados = ordenarTamanhosLista(Array.from(tamanhosSelecionados));
  const medidasBase: Medida[] =
    tamanhosOrdenados.length > 0
      ? tamanhosOrdenados.map((tamanho) => ({ tamanho }))
      : [{ tamanho: "" }];

  return {
    v: 1,
    savedAt: new Date().toISOString(),
    tabAtiva: "info-basica",
    nomeProduto: String(pai.nome_produto ?? "").trim(),
    descricao: String(pai.descricao ?? "").trim(),
    categoria: String(pai.categoria ?? "").trim(),
    marca: String(pai.marca ?? "").trim(),
    modelo: typeof infoBasica?.modelo === "string" ? infoBasica.modelo : "",
    tecido: typeof caracteristicas?.tecido === "string" ? caracteristicas.tecido : "",
    composicao: typeof caracteristicas?.composicao === "string" ? caracteristicas.composicao : "",
    caimento: typeof caracteristicas?.caimento === "string" ? (caracteristicas.caimento as "" | "slim" | "regular" | "oversized") : "",
    elasticidade: typeof caracteristicas?.elasticidade === "string" ? (caracteristicas.elasticidade as "" | "baixa" | "media" | "alta") : "",
    transparencia: typeof caracteristicas?.transparencia === "string" ? (caracteristicas.transparencia as "" | "nao" | "leve" | "alta") : "",
    amassa: typeof caracteristicas?.amassa === "boolean" ? caracteristicas.amassa : null,
    clima: typeof caracteristicas?.clima === "string" ? (caracteristicas.clima as "" | "calor" | "frio" | "ambos") : "",
    ocasioesUso: Array.isArray(caracteristicas?.ocasioes) ? caracteristicas.ocasioes.filter((x): x is string => typeof x === "string") : [],
    posicionamento: typeof caracteristicas?.posicionamento === "string" ? (caracteristicas.posicionamento as "" | "basico" | "intermediario" | "premium") : "",
    coresSelecionadas: Array.from(coresSelecionadas),
    corCustom: "",
    tamanhosSelecionados: Array.from(tamanhosSelecionados),
    tamanhoCustom: "",
    medidas: medidasBase,
    topicosMedidaSelecionados: ["Comprimento"],
    topicosMedidaCustom: "",
    dataLancamento: String(pai.data_lancamento ?? "").slice(0, 10),
    custoPorTamanho: {},
    custoMatriz,
    custoPorCor: {},
    estoquePorTamanho: {},
    estoqueMatriz,
    estoquePorCor: {},
    fotoUrlPorCor,
    massaCusto: "",
    massaEstoque: "",
    peso: numToStr(pai.peso_kg),
    comp: numToStr(pai.comprimento_cm),
    largura: numToStr(pai.largura_cm),
    altura: numToStr(pai.altura_cm),
    linkFotos: String(pai.link_fotos ?? "").trim(),
    linkVideo: typeof midia?.video === "string" ? midia.video : "",
    midiaPrincipal: typeof midia?.principal === "string" ? midia.principal : "",
    midiaFrente: typeof midia?.frente === "string" ? midia.frente : "",
    midiaCostas: typeof midia?.costas === "string" ? midia.costas : "",
    midiaDetalhe: typeof midia?.detalhe === "string" ? midia.detalhe : "",
    midiaLifestyle: typeof midia?.lifestyle === "string" ? midia.lifestyle : "",
    naoDesbota: typeof qualidade?.naoDesbota === "boolean" ? qualidade.naoDesbota : null,
    encolhe: typeof qualidade?.encolhe === "boolean" ? qualidade.encolhe : null,
    costuraReforcada: typeof qualidade?.costuraReforcada === "boolean" ? qualidade.costuraReforcada : null,
    obsQualidade: typeof qualidade?.observacoes === "string" ? qualidade.observacoes : "",
    diferencial: typeof guiado?.diferencial === "string" ? guiado.diferencial : "",
    indicacao: typeof guiado?.indicacao === "string" ? guiado.indicacao : "",
    observacoesSeller: typeof guiado?.observacoesSeller === "string" ? guiado.observacoesSeller : "",
    slaEnvio:
      typeof logistica?.slaEnvio === "string"
        ? (logistica.slaEnvio as "" | "24h" | "48h" | "72h")
        : slaFromExpedicaoLinha(pai.expedicao_override_linha),
    ncm: String(pai.ncm ?? "").trim(),
    cest: String(pai.cest ?? "").trim(),
    origemProduto: String(pai.origem ?? "").trim(),
    cfop: String(pai.cfop ?? "").trim(),
    unidadeComercial: typeof logistica?.unidadeComercial === "string" ? logistica.unidadeComercial : "UN",
    cdSaida: typeof logistica?.cdSaida === "string" ? logistica.cdSaida : String(pai.expedicao_override_linha ?? "").trim(),
    produto: {
      infoBasica: {
        nomeProduto: String(pai.nome_produto ?? "").trim(),
        categoria: String(pai.categoria ?? "").trim() || undefined,
        marca: String(pai.marca ?? "").trim() || undefined,
        modelo: undefined,
      },
      caracteristicas: {},
      medidas: medidasBase,
      variacoes: variantes.map((v) => ({
        sku: v.sku,
        cor: toTitleCase(String(v.cor ?? "").trim()),
        tamanho: String(v.tamanho ?? "").trim().toUpperCase(),
        estoque: v.estoque_atual ?? undefined,
        custo: v.custo_base ?? undefined,
        peso: v.peso_kg ?? undefined,
        imagem: String(v.imagem_url ?? "").trim() || undefined,
      })),
      qualidade: {},
      midia: {},
      guiado: {},
      logistica: {
        slaEnvio: slaFromExpedicaoLinha(pai.expedicao_override_linha) || undefined,
        ncm: String(pai.ncm ?? "").trim() || undefined,
        cest: String(pai.cest ?? "").trim() || undefined,
        origemProduto: String(pai.origem ?? "").trim() || undefined,
        cfop: String(pai.cfop ?? "").trim() || undefined,
        unidadeComercial: "UN",
        cdSaida: String(pai.expedicao_override_linha ?? "").trim() || undefined,
      },
    },
  };
}

/** Ordem estável para listar tamanhos (PP... depois extras). */
function ordenarTamanhosLista(tams: string[]): string[] {
  const ordem = new Map(TAMANHOS_PREDEFINIDOS.map((t, i) => [t.toUpperCase(), i]));
  return [...tams].sort((a, b) => {
    const ia = ordem.get(a.toUpperCase()) ?? 999;
    const ib = ordem.get(b.toUpperCase()) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}
import { VarianteExtrasTagInput } from "@/components/VarianteExtrasTagInput";

type TabId = CriarVariantesTabId;

const TABS: { id: TabId; label: string }[] = [
  { id: "info-basica", label: "Informações básicas" },
  { id: "caracteristicas", label: "Características" },
  { id: "medidas", label: "Medidas" },
  { id: "variacoes", label: "Variações" },
  { id: "lista-variacoes", label: "Lista de variações" },
  { id: "qualidade", label: "Qualidade" },
  { id: "midia", label: "Mídia" },
  { id: "dados-guiados", label: "Dados guiados" },
  { id: "logistica", label: "Fiscal e despacho" },
];

/** Preenchimento rápido — NCM/CEST/CFOP usuais em vestuário nacional (conferir com seu contador). CD de saída não vem no modelo. */
const PRESETS_FISCAL_DESPACHO: {
  id: string;
  label: string;
  ncm: string;
  cest: string;
  origemProduto: string;
  cfop: string;
  unidadeComercial: string;
  slaEnvio: "24h" | "48h" | "72h";
}[] = [
  {
    id: "camiseta",
    label: "Camiseta / camisa",
    ncm: "6105.20.00",
    cest: "28.038.00",
    origemProduto: "Nacional",
    cfop: "5102",
    unidadeComercial: "UN",
    slaEnvio: "24h",
  },
  {
    id: "calca",
    label: "Calça / bermuda",
    ncm: "6103.42.00",
    cest: "28.038.00",
    origemProduto: "Nacional",
    cfop: "5102",
    unidadeComercial: "UN",
    slaEnvio: "24h",
  },
  {
    id: "vestido",
    label: "Vestido / saia",
    ncm: "6104.43.00",
    cest: "28.038.00",
    origemProduto: "Nacional",
    cfop: "5102",
    unidadeComercial: "UN",
    slaEnvio: "48h",
  },
  {
    id: "jaqueta",
    label: "Jaqueta / blusa frio",
    ncm: "6101.20.00",
    cest: "28.038.00",
    origemProduto: "Nacional",
    cfop: "5102",
    unidadeComercial: "UN",
    slaEnvio: "48h",
  },
  {
    id: "acessorio",
    label: "Acessório têxtil",
    ncm: "6117.80.00",
    cest: "28.038.00",
    origemProduto: "Nacional",
    cfop: "5102",
    unidadeComercial: "UN",
    slaEnvio: "24h",
  },
];

const btnPillFiscalExtra =
  "rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700";

/** Origem da mercadoria — atalhos comuns (o campo continua livre para outro texto). */
const ATALHOS_ORIGEM_PRODUTO: { id: string; label: string; valor: string }[] = [
  { id: "nac", label: "Nacional", valor: "Nacional" },
  { id: "imp-d", label: "Imp. direta", valor: "Importação direta" },
  { id: "imp-mi", label: "Mercado int.", valor: "Importado - mercado interno" },
];

/** Unidade comercial — atalhos típicos em vestuário. */
const ATALHOS_UNIDADE_COMERCIAL: { id: string; label: string; valor: string }[] = [
  { id: "un", label: "UN", valor: "UN" },
  { id: "kg", label: "KG", valor: "KG" },
  { id: "cx", label: "CX", valor: "CX" },
  { id: "pct", label: "PCT", valor: "PCT" },
];

const inputBase = "w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-300 bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500";
const inputDelicado =
  "w-full rounded-lg border border-[#e5e9ef] bg-white px-3 py-2 text-[13px] text-[#1f2937] placeholder:text-[#9aa3af] shadow-[inset_0_1px_1px_rgba(15,23,42,0.03)] transition focus:outline-none focus:border-[#b8c6db] focus:ring-2 focus:ring-[#dbe8ff] dark:border-[#394353] dark:bg-[#161c25] dark:text-[#e5e7eb] dark:placeholder:text-[#8b95a5] dark:focus:border-[#5d7fb4] dark:focus:ring-[#1e3355]";
const btnAtalhoNumeroCd =
  "rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700";

/** Alinhado ao resto do formulário (ex.: py-2.5 dos inputs e CTAs sky/azul). */
const btnRascunho =
  "inline-flex items-center justify-center rounded-lg border border-[#d9dee5] bg-white px-3 py-2 text-[13px] font-medium text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 sm:px-3.5 sm:py-1.5";
const btnPassoSec =
  "inline-flex flex-1 items-center justify-center rounded-lg border border-[#d9dee5] bg-[var(--card)] px-3 py-2 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-800 sm:flex-none sm:min-w-[7.5rem] sm:px-3.5 sm:py-1.5";
const btnSeguir =
  "inline-flex flex-1 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[13px] font-semibold text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800 sm:flex-none sm:min-w-[7.5rem] sm:px-3.5 sm:py-1.5";
const btnSalvarProduto =
  "inline-flex flex-1 items-center justify-center rounded-lg bg-[#2563eb] px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#1d4ed8] disabled:opacity-55 dark:shadow-none sm:flex-none sm:px-4 sm:py-1.5";

/** Tópicos sugeridos na tabela de medidas. Medidas “extras” (não mapeadas em Medida) vão para `extras` no rascunho. */
const MEDIDAS_PREDEFINIDAS = [
  "Largura",
  "Comprimento",
  "Ombros",
  "Manga",
  "Comprimento da manga",
  "Punho",
  "Cava",
  "Bíceps",
  "Gola",
  "Busto",
  "Costas",
  "Cintura",
  "Quadril",
  "Coxa",
  "Joelho",
  "Gancho (altura · calça)",
  "Entrepernas",
  "Barra",
  "Tornozelo",
] as const;

function detectarTipoMedida(categoria: string): "camisa" | "calca" | "vestido" | "geral" {
  const s = categoria.toLowerCase();
  if (/camisa|camiseta|blusa|jaqueta|moletom/.test(s)) return "camisa";
  if (/calca|calça|bermuda|short/.test(s)) return "calca";
  if (/vestido/.test(s)) return "vestido";
  return "geral";
}

/** Limite por arquivo na lista de variações (data URL no JSON). */
const MAX_FOTO_COR_BYTES = 900 * 1024;

function estadoInicialRascunhoVazio(): RascunhoCriarVariantesV1 {
  return {
    v: 1,
    savedAt: new Date().toISOString(),
    tabAtiva: "info-basica",
    nomeProduto: "",
    descricao: "",
    categoria: "",
    marca: "",
    modelo: "",
    tecido: "",
    composicao: "",
    caimento: "",
    elasticidade: "",
    transparencia: "",
    amassa: null,
    clima: "",
    ocasioesUso: [],
    posicionamento: "",
    coresSelecionadas: [],
    corCustom: "",
    tamanhosSelecionados: [],
    tamanhoCustom: "",
    medidas: [],
    topicosMedidaSelecionados: [],
    topicosMedidaCustom: "",
    dataLancamento: "",
    custoPorTamanho: {},
    custoMatriz: {},
    custoPorCor: {},
    estoquePorTamanho: {},
    estoqueMatriz: {},
    estoquePorCor: {},
    fotoUrlPorCor: {},
    massaCusto: "",
    massaEstoque: "",
    peso: "",
    comp: "",
    largura: "",
    altura: "",
    linkFotos: "",
    linkVideo: "",
    midiaPrincipal: "",
    midiaFrente: "",
    midiaCostas: "",
    midiaDetalhe: "",
    midiaLifestyle: "",
    naoDesbota: null,
    encolhe: null,
    costuraReforcada: null,
    obsQualidade: "",
    diferencial: "",
    indicacao: "",
    observacoesSeller: "",
    slaEnvio: "",
    ncm: "",
    cest: "",
    origemProduto: "",
    cfop: "",
    unidadeComercial: "",
    cdSaida: "",
    cdSaidaCep: "",
    cdSaidaLogradouro: "",
    cdSaidaNumero: "",
    cdSaidaComplemento: "",
    cdSaidaBairro: "",
    cdSaidaCidade: "",
    cdSaidaUf: "",
    cdUsarDespachoCadastro: false,
    produto: {
      infoBasica: { nomeProduto: "" },
      caracteristicas: {},
      medidas: [],
      variacoes: [],
      qualidade: {},
      midia: {},
      guiado: {},
      logistica: {},
    },
  };
}

export default function CriarVariantesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const grupoEdicao = (searchParams.get("editar") ?? "").trim().toUpperCase();
  const modoEdicao = grupoEdicao.length > 0;
  const tabsNavRef = useRef<HTMLDivElement | null>(null);
  const [tabAtiva, setTabAtiva] = useState<TabId>("info-basica");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [carregandoEdicao, setCarregandoEdicao] = useState(false);

  // Info. Básica
  const [nomeProduto, setNomeProduto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [modelo, setModelo] = useState("");

  // Características
  const [tecido, setTecido] = useState("");
  const [composicao, setComposicao] = useState("");
  const [caimento, setCaimento] = useState<"slim" | "regular" | "oversized" | "">("");
  const [elasticidade, setElasticidade] = useState<"baixa" | "media" | "alta" | "">("");
  const [transparencia, setTransparencia] = useState<"nao" | "leve" | "alta" | "">("");
  const [amassa, setAmassa] = useState<boolean | null>(null);
  const [clima, setClima] = useState<"calor" | "frio" | "ambos" | "">("");
  const [ocasioesUsoTexto, setOcasioesUsoTexto] = useState("");
  const [posicionamento, setPosicionamento] = useState<"basico" | "intermediario" | "premium" | "">("");

  // Informações de Variantes
  const [descricao, setDescricao] = useState("");
  const [marca, setMarca] = useState("");
  const [coresSelecionadas, setCoresSelecionadas] = useState<Set<string>>(new Set());
  const [corCustom, setCorCustom] = useState("");
  const [tamanhosSelecionados, setTamanhosSelecionados] = useState<Set<string>>(new Set());
  const [tamanhoCustom, setTamanhoCustom] = useState("");
  const [medidas, setMedidas] = useState<Medida[]>([{ tamanho: "", largura: undefined, comprimento: undefined, ombro: undefined, manga: undefined }]);
  const [topicosMedidaSelecionados, setTopicosMedidaSelecionados] = useState<Set<string>>(new Set(["Comprimento"]));
  const [topicosMedidaCustom, setTopicosMedidaCustom] = useState("");
  const [modalTopicosMedida, setModalTopicosMedida] = useState(false);

  // Info. de Variantes (bulk)
  const [dataLancamento, setDataLancamento] = useState("");
  const [custoPorTamanho, setCustoPorTamanho] = useState<Record<string, string>>({});
  const [custoMatriz, setCustoMatriz] = useState<Record<string, string>>({});
  const [custoPorCor, setCustoPorCor] = useState<Record<string, string>>({});
  /** Quando há tamanhos: mesmo número para todas as cores daquele tamanho. Chave = tamanho em maiúsculas. */
  const [estoquePorTamanho, setEstoquePorTamanho] = useState<Record<string, string>>({});
  /** Cor × tamanho: uma quantidade por célula (modo «matriz»). Chave = `corLower|tamUpper`. */
  const [estoqueMatriz, setEstoqueMatriz] = useState<Record<string, string>>({});
  /** Mesmo estoque em todos os tamanhos daquela cor (modo «por cor»). Chave = cor em minúsculas. */
  const [estoquePorCor, setEstoquePorCor] = useState<Record<string, string>>({});
  /** Barra estilo Shopee «Aplicar a todos». */
  const [massaCusto, setMassaCusto] = useState("");
  const [massaEstoque, setMassaEstoque] = useState("");
  /** Foto principal por cor (URL ou data URL); chave = cor em minúsculas. */
  const [fotoUrlPorCor, setFotoUrlPorCor] = useState<Record<string, string>>({});
  const [avisoFoto, setAvisoFoto] = useState<string | null>(null);
  /** Aviso fino após aplicar rascunho ao abrir a página (o atalho principal fica em «Meus produtos»). */
  const [avisoRascunhoCarregado, setAvisoRascunhoCarregado] = useState<{
    savedAt: string;
    origem: "servidor" | "local";
  } | null>(null);
  /** `sucesso` = verde; `aviso` = âmbar (salvo só local / falha na nuvem — não é “tudo certo”). */
  const [msgRascunho, setMsgRascunho] = useState<{ text: string; tipo: "sucesso" | "aviso" } | null>(null);
  const [rascunhoSalvando, setRascunhoSalvando] = useState(false);
  const [peso, setPeso] = useState("");
  const [comp, setComp] = useState("");
  const [largura, setLargura] = useState("");
  const [altura, setAltura] = useState("");

  // Mídia
  const [linkFotos, setLinkFotos] = useState("");
  const [linkVideo, setLinkVideo] = useState("");
  const [midiaPrincipal, setMidiaPrincipal] = useState("");
  const [midiaFrente, setMidiaFrente] = useState("");
  const [midiaCostas, setMidiaCostas] = useState("");
  const [midiaDetalhe, setMidiaDetalhe] = useState("");
  const [midiaLifestyle, setMidiaLifestyle] = useState("");

  // Qualidade
  const [naoDesbota, setNaoDesbota] = useState<boolean | null>(null);
  const [encolhe, setEncolhe] = useState<boolean | null>(null);
  const [costuraReforcada, setCosturaReforcada] = useState<boolean | null>(null);
  const [obsQualidade, setObsQualidade] = useState("");

  // Dados guiados
  const [diferencial, setDiferencial] = useState("");
  const [indicacao, setIndicacao] = useState("");
  const [observacoesSeller, setObservacoesSeller] = useState("");

  // Logística
  const [slaEnvio, setSlaEnvio] = useState<"24h" | "48h" | "72h" | "">("");
  const [ncm, setNcm] = useState("");
  const [cest, setCest] = useState("");
  const [origemProduto, setOrigemProduto] = useState("");
  const [cfop, setCfop] = useState("");
  const [unidadeComercial, setUnidadeComercial] = useState("");
  const [cdCep, setCdCep] = useState("");
  const [cdLogradouro, setCdLogradouro] = useState("");
  const [cdNumero, setCdNumero] = useState("");
  const [cdComplemento, setCdComplemento] = useState("");
  const [cdBairro, setCdBairro] = useState("");
  const [cdCidade, setCdCidade] = useState("");
  const [cdUf, setCdUf] = useState("");
  const [cdUsarDespachoCadastro, setCdUsarDespachoCadastro] = useState(false);
  const [perfilExpedicao, setPerfilExpedicao] = useState<PartesEnderecoCd | null>(null);
  const [buscandoCepCd, setBuscandoCepCd] = useState(false);
  const [pickerCampo, setPickerCampo] = useState<null | "caimento" | "elasticidade" | "transparencia" | "clima" | "posicionamento">(null);
  const cdCepRef = useRef("");
  cdCepRef.current = cdCep;

  const cdLinhaFormatada = useMemo(() => {
    const linha =
      buildExpedicaoPadraoLinha({
        expedicao_cep: cdCep,
        expedicao_logradouro: cdLogradouro,
        expedicao_numero: cdNumero,
        expedicao_complemento: cdComplemento,
        expedicao_bairro: cdBairro,
        expedicao_cidade: cdCidade,
        expedicao_uf: cdUf,
      }) ?? "";
    return linha.trim();
  }, [cdCep, cdLogradouro, cdNumero, cdComplemento, cdBairro, cdCidade, cdUf]);

  const perfilExpedicaoPreenchido = useMemo(() => {
    if (!perfilExpedicao) return false;
    return Object.values(perfilExpedicao).some((v) => String(v ?? "").trim().length > 0);
  }, [perfilExpedicao]);

  const coresFinais = useMemo(() => {
    const set = new Set(coresSelecionadas);
    for (const part of corCustom
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      set.add(toTitleCase(part));
    }
    return Array.from(set);
  }, [coresSelecionadas, corCustom]);

  const tamanhosFinais = useMemo(() => {
    const set = new Set(tamanhosSelecionados);
    for (const part of tamanhoCustom
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      set.add(part.toUpperCase());
    }
    return Array.from(set);
  }, [tamanhosSelecionados, tamanhoCustom]);

  const combinacoes = useMemo(() => {
    const out: { cor: string; tamanho: string }[] = [];
    if (coresFinais.length > 0 && tamanhosFinais.length > 0) {
      for (const cor of coresFinais) {
        for (const tam of tamanhosFinais) {
          out.push({ cor, tamanho: tam });
        }
      }
    } else if (coresFinais.length > 0) {
      for (const cor of coresFinais) {
        out.push({ cor, tamanho: "" });
      }
    } else if (tamanhosFinais.length > 0) {
      for (const tam of tamanhosFinais) {
        out.push({ cor: "", tamanho: tam });
      }
    }
    return out;
  }, [coresFinais, tamanhosFinais]);

  function parseNum(s: string): number | undefined {
    const n = Number.parseFloat(String(s).replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }

  function aplicarPresetFiscal(p: (typeof PRESETS_FISCAL_DESPACHO)[number]) {
    setNcm(p.ncm);
    setCest(p.cest);
    setOrigemProduto(p.origemProduto);
    setCfop(p.cfop);
    setUnidadeComercial(p.unidadeComercial);
    setSlaEnvio(p.slaEnvio);
  }

  function skuAutomatico(cor: string, tamanho: string, idx: number): string {
    const base = nomeProduto
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .map((p) => p.slice(0, 2).toUpperCase())
      .join("");
    const corSigla = (cor || "UN").slice(0, 2).toUpperCase();
    const tamSigla = (tamanho || "U").slice(0, 3).toUpperCase();
    return `${base || "PRD"}-${corSigla}${tamSigla}-${String(idx + 1).padStart(3, "0")}`;
  }

  const variantesGeradas = useMemo<Variante[]>(
    () =>
      combinacoes.map((c, idx) => {
        const key = chaveEstoqueVariante(c.cor, c.tamanho);
        const corKey = c.cor.trim().toLowerCase();
        const tamKey = c.tamanho.trim().toUpperCase();
        return {
          sku: skuAutomatico(c.cor, c.tamanho, idx),
          cor: c.cor || "—",
          tamanho: c.tamanho || "—",
          estoque: parseQty(estoqueMatriz[key] ?? estoquePorCor[corKey] ?? estoquePorTamanho[tamKey] ?? "") ?? undefined,
          custo: parseMoney(custoMatriz[key] ?? custoPorCor[corKey] ?? custoPorTamanho[tamKey] ?? "") ?? undefined,
          peso: parseNum(peso),
          imagem: fotoUrlPorCor[corKey] ?? "",
        };
      }),
    [combinacoes, estoqueMatriz, estoquePorCor, estoquePorTamanho, custoMatriz, custoPorCor, custoPorTamanho, peso, fotoUrlPorCor, nomeProduto]
  );

  const ocasioesUsoLista = useMemo(
    () =>
      ocasioesUsoTexto
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [ocasioesUsoTexto]
  );
  const tipoMedida = useMemo(() => detectarTipoMedida(categoria), [categoria]);
  const topicosMedidaFinais = useMemo(() => {
    const set = new Set<string>(topicosMedidaSelecionados);
    for (const part of topicosMedidaCustom.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
      set.add(toTitleCase(part));
    }
    if (set.size === 0) {
      if (tipoMedida === "camisa") return ["Ombros", "Comprimento da manga", "Comprimento", "Bíceps"];
      if (tipoMedida === "calca") return ["Cintura", "Quadril", "Comprimento", "Entrepernas", "Gancho (altura · calça)"];
      if (tipoMedida === "vestido") return ["Busto", "Cintura", "Comprimento"];
      return ["Largura", "Comprimento"];
    }
    return Array.from(set);
  }, [topicosMedidaSelecionados, topicosMedidaCustom, tipoMedida]);

  function chaveTopico(topico: string): keyof Medida | "extra" {
    const norm = topico.toLowerCase();
    if (norm === "largura") return "largura";
    if (norm === "comprimento") return "comprimento";
    if (norm === "ombro" || norm === "ombros") return "ombro";
    if (norm === "manga") return "manga";
    if (norm === "cintura") return "cintura";
    if (norm === "quadril") return "quadril";
    if (norm === "busto") return "busto";
    return "extra";
  }

  function getValorTopico(m: Medida, topico: string): string {
    const k = chaveTopico(topico);
    if (k === "extra") return m.extras?.[topico] != null ? String(m.extras[topico]) : "";
    const val = m[k];
    return typeof val === "number" ? String(val) : "";
  }

  function setValorTopico(idx: number, topico: string, raw: string) {
    const parsed = parseNum(raw);
    setMedidas((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const k = chaveTopico(topico);
        if (k === "extra") {
          const nextExtras = { ...(it.extras ?? {}) };
          if (parsed == null) delete nextExtras[topico];
          else nextExtras[topico] = parsed;
          return { ...it, extras: nextExtras };
        }
        return { ...it, [k]: parsed } as Medida;
      })
    );
  }

  function labelSelecionado<T extends { value: string; label: string }>(opts: readonly T[], value: string): string {
    return opts.find((o) => o.value === value)?.label ?? "Selecione";
  }

  const tamanhosOrdenados = useMemo(() => ordenarTamanhosLista(tamanhosFinais), [tamanhosFinais]);

  useEffect(() => {
    setFotoUrlPorCor((prev) => {
      const next: Record<string, string> = {};
      for (const cor of coresFinais) {
        const k = cor.trim().toLowerCase();
        if (prev[k]) next[k] = prev[k];
      }
      return next;
    });
  }, [coresFinais.join("|")]);

  useEffect(() => {
    setEstoquePorTamanho((prev) => {
      const next: Record<string, string> = {};
      for (const tam of tamanhosFinais) {
        const k = tam.toUpperCase();
        next[k] = prev[k] ?? "";
      }
      return next;
    });
  }, [tamanhosFinais.join("|")]);

  useEffect(() => {
    if (coresFinais.length === 0 || tamanhosFinais.length === 0) return;
    setEstoqueMatriz((prev) => {
      const next: Record<string, string> = {};
      for (const cor of coresFinais) {
        for (const tam of tamanhosFinais) {
          const key = chaveEstoqueVariante(cor, tam);
          next[key] = prev[key] ?? "";
        }
      }
      return next;
    });
  }, [coresFinais.join("|"), tamanhosFinais.join("|")]);

  useEffect(() => {
    setEstoquePorCor((prev) => {
      const next: Record<string, string> = {};
      for (const cor of coresFinais) {
        const k = cor.trim().toLowerCase();
        next[k] = prev[k] ?? "";
      }
      return next;
    });
  }, [coresFinais.join("|")]);

  useEffect(() => {
    setCustoPorTamanho((prev) => {
      const next: Record<string, string> = {};
      for (const tam of tamanhosFinais) {
        const k = tam.toUpperCase();
        next[k] = prev[k] ?? "";
      }
      return next;
    });
  }, [tamanhosFinais.join("|")]);

  useEffect(() => {
    if (coresFinais.length === 0 || tamanhosFinais.length === 0) return;
    setCustoMatriz((prev) => {
      const next: Record<string, string> = {};
      for (const cor of coresFinais) {
        for (const tam of tamanhosFinais) {
          const key = chaveEstoqueVariante(cor, tam);
          next[key] = prev[key] ?? "";
        }
      }
      return next;
    });
  }, [coresFinais.join("|"), tamanhosFinais.join("|")]);

  useEffect(() => {
    setCustoPorCor((prev) => {
      const next: Record<string, string> = {};
      for (const cor of coresFinais) {
        const k = cor.trim().toLowerCase();
        next[k] = prev[k] ?? "";
      }
      return next;
    });
  }, [coresFinais.join("|")]);

  function parseQty(s: string): number | null {
    const raw = s.trim();
    if (!raw) return null;
    const n = parseFloat(raw.replace(",", "."));
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
  }

  function parseMoney(s: string): number | null {
    const raw = s.trim();
    if (!raw) return null;
    const n = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }

  function toggleCor(cor: string) {
    setCoresSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(cor)) next.delete(cor);
      else next.add(cor);
      return next;
    });
  }

  function toggleTamanho(tam: string) {
    setTamanhosSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(tam)) next.delete(tam);
      else next.add(tam);
      return next;
    });
  }

  function moverCorParaCampoExtras(cor: string) {
    setCoresSelecionadas((prev) => {
      const next = new Set(prev);
      next.delete(cor);
      return next;
    });
    setCorCustom((prev) => {
      const parts = prev
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const lower = new Set(parts.map((p) => p.toLowerCase()));
      if (!lower.has(cor.toLowerCase())) parts.unshift(cor);
      else {
        const filtered = parts.filter((p) => p.toLowerCase() !== cor.toLowerCase());
        return [cor, ...filtered].join(", ");
      }
      return parts.join(", ");
    });
  }

  function moverTamanhoParaCampoExtras(tam: string) {
    setTamanhosSelecionados((prev) => {
      const next = new Set(prev);
      next.delete(tam);
      return next;
    });
    setTamanhoCustom((prev) => {
      const parts = prev
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const upper = new Set(parts.map((p) => p.toUpperCase()));
      if (!upper.has(tam.toUpperCase())) parts.unshift(tam);
      else {
        const filtered = parts.filter((p) => p.toUpperCase() !== tam.toUpperCase());
        return [tam, ...filtered].join(", ");
      }
      return parts.join(", ");
    });
  }

  function aoEscolherArquivoFotoCor(cor: string, e: React.ChangeEvent<HTMLInputElement>) {
    setAvisoFoto(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvisoFoto("Use JPEG, PNG, WebP ou GIF.");
      return;
    }
    if (file.size > MAX_FOTO_COR_BYTES) {
      setAvisoFoto("Arquivo muito grande (máx. ~900 KB). Use uma URL pública ou comprima a imagem.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const s = typeof reader.result === "string" ? reader.result : "";
      if (s) setFotoUrlPorCor((prev) => ({ ...prev, [cor.trim().toLowerCase()]: s }));
    };
    reader.readAsDataURL(file);
  }

  function aplicarMassaTodos() {
    const es = massaEstoque.trim();
    const cu = massaCusto.trim();
    if (coresFinais.length > 0 && tamanhosFinais.length > 0) {
      if (es) {
        setEstoqueMatriz((prev) => {
          const next = { ...prev };
          for (const cor of coresFinais) {
            for (const tam of tamanhosOrdenados) {
              next[chaveEstoqueVariante(cor, tam)] = es;
            }
          }
          return next;
        });
      }
      if (cu) {
        setCustoMatriz((prev) => {
          const next = { ...prev };
          for (const cor of coresFinais) {
            for (const tam of tamanhosOrdenados) {
              next[chaveEstoqueVariante(cor, tam)] = cu;
            }
          }
          return next;
        });
      }
    } else if (tamanhosFinais.length > 0) {
      if (es) {
        setEstoquePorTamanho((prev) => {
          const next = { ...prev };
          for (const tam of tamanhosOrdenados) {
            next[tam.toUpperCase()] = es;
          }
          return next;
        });
      }
      if (cu) {
        setCustoPorTamanho((prev) => {
          const next = { ...prev };
          for (const tam of tamanhosOrdenados) {
            next[tam.toUpperCase()] = cu;
          }
          return next;
        });
      }
    } else if (coresFinais.length > 0) {
      if (es) {
        setEstoquePorCor((prev) => {
          const next = { ...prev };
          for (const cor of coresFinais) {
            next[cor.trim().toLowerCase()] = es;
          }
          return next;
        });
      }
      if (cu) {
        setCustoPorCor((prev) => {
          const next = { ...prev };
          for (const cor of coresFinais) {
            next[cor.trim().toLowerCase()] = cu;
          }
          return next;
        });
      }
    }
    setMassaEstoque("");
    setMassaCusto("");
  }

  function construirRascunho(): RascunhoCriarVariantesV1 {
    const infoBasica = {
      nomeProduto,
      categoria,
      marca,
      modelo,
    };
    const caracteristicas = {
      tecido,
      composicao,
      caimento: caimento || undefined,
      elasticidade: elasticidade || undefined,
      transparencia: transparencia || undefined,
      amassa: amassa ?? undefined,
      clima: clima || undefined,
      ocasioes: ocasioesUsoLista,
      posicionamento: posicionamento || undefined,
    };
    const qualidade = {
      naoDesbota: naoDesbota ?? undefined,
      encolhe: encolhe ?? undefined,
      costuraReforcada: costuraReforcada ?? undefined,
      observacoes: obsQualidade.trim() || undefined,
    };
    const midia = {
      principal: midiaPrincipal.trim() || undefined,
      frente: midiaFrente.trim() || undefined,
      costas: midiaCostas.trim() || undefined,
      detalhe: midiaDetalhe.trim() || undefined,
      lifestyle: midiaLifestyle.trim() || undefined,
      video: linkVideo.trim() || undefined,
    };
    const guiado = {
      diferencial: diferencial.trim() || undefined,
      indicacao: indicacao.trim() || undefined,
      observacoesSeller: observacoesSeller.trim() || undefined,
    };
    const logistica = {
      slaEnvio: slaEnvio || undefined,
      ncm: ncm.trim() || undefined,
      cest: cest.trim() || undefined,
      origemProduto: origemProduto.trim() || undefined,
      cfop: cfop.trim() || undefined,
      unidadeComercial: unidadeComercial.trim() || undefined,
      cdSaida: cdLinhaFormatada || undefined,
    };

    return {
      v: 1,
      savedAt: new Date().toISOString(),
      tabAtiva,
      nomeProduto,
      descricao,
      categoria,
      marca,
      modelo,
      tecido,
      composicao,
      caimento,
      elasticidade,
      transparencia,
      amassa,
      clima,
      ocasioesUso: ocasioesUsoLista,
      posicionamento,
      coresSelecionadas: [...coresSelecionadas],
      corCustom,
      tamanhosSelecionados: [...tamanhosSelecionados],
      tamanhoCustom,
      medidas,
      topicosMedidaSelecionados: [...topicosMedidaSelecionados],
      topicosMedidaCustom,
      dataLancamento,
      custoPorTamanho: { ...custoPorTamanho },
      custoMatriz: { ...custoMatriz },
      custoPorCor: { ...custoPorCor },
      estoquePorTamanho: { ...estoquePorTamanho },
      estoqueMatriz: { ...estoqueMatriz },
      estoquePorCor: { ...estoquePorCor },
      fotoUrlPorCor: { ...fotoUrlPorCor },
      massaCusto,
      massaEstoque,
      peso,
      comp,
      largura,
      altura,
      linkFotos,
      linkVideo,
      midiaPrincipal,
      midiaFrente,
      midiaCostas,
      midiaDetalhe,
      midiaLifestyle,
      naoDesbota,
      encolhe,
      costuraReforcada,
      obsQualidade,
      diferencial,
      indicacao,
      observacoesSeller,
      slaEnvio,
      ncm,
      cest,
      origemProduto,
      cfop,
      unidadeComercial,
      cdSaida: cdLinhaFormatada,
      produto: {
        infoBasica,
        caracteristicas,
        medidas,
        variacoes: variantesGeradas,
        qualidade,
        midia,
        guiado,
        logistica,
      },
    };
  }

  function aplicarPayloadRascunho(p: RascunhoCriarVariantesV1) {
    const tabIds = new Set(TABS.map((t) => t.id));
    setTabAtiva(tabIds.has(p.tabAtiva) ? p.tabAtiva : "info-basica");
    setNomeProduto(p.nomeProduto ?? "");
    setCategoria(p.categoria ?? p.produto?.infoBasica?.categoria ?? "");
    setDescricao(p.descricao ?? "");
    setMarca(p.marca ?? "");
    setModelo(p.modelo ?? p.produto?.infoBasica?.modelo ?? "");
    setTecido(p.tecido ?? p.produto?.caracteristicas?.tecido ?? "");
    setComposicao(p.composicao ?? p.produto?.caracteristicas?.composicao ?? "");
    setCaimento((p.caimento ?? p.produto?.caracteristicas?.caimento ?? "") as "slim" | "regular" | "oversized" | "");
    setElasticidade((p.elasticidade ?? p.produto?.caracteristicas?.elasticidade ?? "") as "baixa" | "media" | "alta" | "");
    setTransparencia((p.transparencia ?? p.produto?.caracteristicas?.transparencia ?? "") as "nao" | "leve" | "alta" | "");
    setAmassa(p.amassa ?? p.produto?.caracteristicas?.amassa ?? null);
    setClima((p.clima ?? p.produto?.caracteristicas?.clima ?? "") as "calor" | "frio" | "ambos" | "");
    setOcasioesUsoTexto((p.ocasioesUso ?? p.produto?.caracteristicas?.ocasioes ?? []).join(", "));
    setPosicionamento((p.posicionamento ?? p.produto?.caracteristicas?.posicionamento ?? "") as "basico" | "intermediario" | "premium" | "");
    setCoresSelecionadas(new Set(p.coresSelecionadas ?? []));
    setCorCustom(p.corCustom ?? "");
    setTamanhosSelecionados(new Set(p.tamanhosSelecionados ?? []));
    setTamanhoCustom(p.tamanhoCustom ?? "");
    setMedidas(p.medidas ?? p.produto?.medidas ?? [{ tamanho: "", largura: undefined, comprimento: undefined, ombro: undefined, manga: undefined }]);
    setTopicosMedidaSelecionados(new Set(p.topicosMedidaSelecionados ?? []));
    setTopicosMedidaCustom(p.topicosMedidaCustom ?? "");
    setDataLancamento(p.dataLancamento ?? "");
    setCustoPorTamanho({ ...(p.custoPorTamanho ?? {}) });
    setCustoMatriz({ ...(p.custoMatriz ?? {}) });
    setCustoPorCor({ ...(p.custoPorCor ?? {}) });
    setEstoquePorTamanho({ ...(p.estoquePorTamanho ?? {}) });
    setEstoqueMatriz({ ...(p.estoqueMatriz ?? {}) });
    setEstoquePorCor({ ...(p.estoquePorCor ?? {}) });
    setFotoUrlPorCor({ ...(p.fotoUrlPorCor ?? {}) });
    setMassaCusto(p.massaCusto ?? "");
    setMassaEstoque(p.massaEstoque ?? "");
    setPeso(p.peso ?? "");
    setComp(p.comp ?? "");
    setLargura(p.largura ?? "");
    setAltura(p.altura ?? "");
    setLinkFotos(p.linkFotos ?? "");
    setLinkVideo(p.linkVideo ?? "");
    setMidiaPrincipal(p.midiaPrincipal ?? p.produto?.midia?.principal ?? "");
    setMidiaFrente(p.midiaFrente ?? p.produto?.midia?.frente ?? "");
    setMidiaCostas(p.midiaCostas ?? p.produto?.midia?.costas ?? "");
    setMidiaDetalhe(p.midiaDetalhe ?? p.produto?.midia?.detalhe ?? "");
    setMidiaLifestyle(p.midiaLifestyle ?? p.produto?.midia?.lifestyle ?? "");
    setNaoDesbota(p.naoDesbota ?? p.produto?.qualidade?.naoDesbota ?? null);
    setEncolhe(p.encolhe ?? p.produto?.qualidade?.encolhe ?? null);
    setCosturaReforcada(p.costuraReforcada ?? p.produto?.qualidade?.costuraReforcada ?? null);
    setObsQualidade(p.obsQualidade ?? p.produto?.qualidade?.observacoes ?? "");
    setDiferencial(p.diferencial ?? p.produto?.guiado?.diferencial ?? "");
    setIndicacao(p.indicacao ?? p.produto?.guiado?.indicacao ?? "");
    setObservacoesSeller(p.observacoesSeller ?? p.produto?.guiado?.observacoesSeller ?? "");
    setSlaEnvio((p.slaEnvio ?? p.produto?.logistica?.slaEnvio ?? "") as "24h" | "48h" | "72h" | "");
    setNcm(p.ncm ?? p.produto?.logistica?.ncm ?? "");
    setCest(p.cest ?? p.produto?.logistica?.cest ?? "");
    setOrigemProduto(p.origemProduto ?? p.produto?.logistica?.origemProduto ?? "");
    setCfop(p.cfop ?? p.produto?.logistica?.cfop ?? "");
    setUnidadeComercial(p.unidadeComercial ?? p.produto?.logistica?.unidadeComercial ?? "");

    const usarCadastro = p.cdUsarDespachoCadastro ?? false;
    setCdUsarDespachoCadastro(usarCadastro);

    const temPartesSalvas =
      String(p.cdSaidaCep ?? "").trim() ||
      String(p.cdSaidaLogradouro ?? "").trim() ||
      String(p.cdSaidaNumero ?? "").trim() ||
      String(p.cdSaidaComplemento ?? "").trim() ||
      String(p.cdSaidaBairro ?? "").trim() ||
      String(p.cdSaidaCidade ?? "").trim() ||
      String(p.cdSaidaUf ?? "").trim();

    if (!usarCadastro) {
      if (temPartesSalvas) {
        setCdCep(String(p.cdSaidaCep ?? "").replace(/\D/g, "").slice(0, 8));
        setCdLogradouro(upperBr(String(p.cdSaidaLogradouro ?? "")));
        setCdNumero(upperBr(String(p.cdSaidaNumero ?? "")));
        setCdComplemento(upperBr(String(p.cdSaidaComplemento ?? "")));
        setCdBairro(upperBr(String(p.cdSaidaBairro ?? "")));
        setCdCidade(upperBr(String(p.cdSaidaCidade ?? "")));
        setCdUf(String(p.cdSaidaUf ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 2));
      } else {
        const legado = (p.cdSaida ?? p.produto?.logistica?.cdSaida ?? "").trim();
        setCdCep("");
        setCdNumero("");
        setCdComplemento("");
        setCdBairro("");
        setCdCidade("");
        setCdUf("");
        setCdLogradouro(legado ? upperBr(legado) : "");
      }
    } else {
      setCdCep("");
      setCdLogradouro("");
      setCdNumero("");
      setCdComplemento("");
      setCdBairro("");
      setCdCidade("");
      setCdUf("");
    }
  }

  /** Sempre remove base64 (`data:`) antes do localStorage — quota baixa; nuvem recebe payload completo no PUT. */
  function gravarRascunhoLocal(data: RascunhoCriarVariantesV1) {
    const leve = rascunhoLeveParaEspelhoLocal(data);
    localStorage.setItem(LS_RASCUNHO_CRIAR_VARIANTES, JSON.stringify(leve));
  }

  async function salvarRascunho() {
    setMsgRascunho(null);
    setRascunhoSalvando(true);
    const payload = construirRascunho();
    let usouSóUrlsFotos = false;

    const tentarQuotaLocal = (data: RascunhoCriarVariantesV1) => {
      try {
        gravarRascunhoLocal(data);
        return true;
      } catch (e) {
        const isQuota =
          (e instanceof Error && e.name === "QuotaExceededError") ||
          (typeof e === "object" && e !== null && (e as { code?: number }).code === 22);
        if (isQuota) {
          const fotoSóHttp: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.fotoUrlPorCor ?? {})) {
            if (typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"))) fotoSóHttp[k] = v;
          }
          try {
            gravarRascunhoLocal({ ...data, fotoUrlPorCor: fotoSóHttp });
            setMsgRascunho({
              tipo: "aviso",
              text: "Rascunho salvo neste aparelho sem fotos em base64 (limite). As URLs https das imagens foram mantidas. Salve de novo para tentar enviar à conta.",
            });
            return true;
          } catch {
            setMsgRascunho({
              tipo: "aviso",
              text: "Não foi possível salvar o rascunho (armazenamento cheio neste aparelho).",
            });
            return false;
          }
        }
        setMsgRascunho({ tipo: "aviso", text: "Não foi possível salvar o rascunho neste aparelho." });
        return false;
      }
    };

    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }

      let corpo: RascunhoCriarVariantesV1 = payload;
      let res = await fetch("/api/fornecedor/produtos/rascunho", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(corpo),
      });

      if (res.status === 413) {
        const fotoSóHttp: Record<string, string> = {};
        for (const [k, v] of Object.entries(payload.fotoUrlPorCor ?? {})) {
          if (typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"))) fotoSóHttp[k] = v;
        }
        corpo = { ...payload, fotoUrlPorCor: fotoSóHttp };
        usouSóUrlsFotos = true;
        res = await fetch("/api/fornecedor/produtos/rascunho", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(corpo),
        });
      }

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503 && String(j?.error ?? "").includes("create-fornecedor-produto-rascunhos")) {
          if (tentarQuotaLocal(payload)) {
            setMsgRascunho({
              tipo: "aviso",
              text: "Rascunho salvo só neste aparelho: a tabela na nuvem ainda não foi criada. Peça à equipe para executar o script SQL em web/scripts/create-fornecedor-produto-rascunhos.sql no Supabase.",
            });
          }
          return;
        }
        if (tentarQuotaLocal(payload)) {
          let detalhe = "O servidor não conseguiu salvar o rascunho na nuvem neste momento.";
          if (res.status === 401) {
            detalhe = "Sessão expirada ou sem permissão. Atualize a página ou entre de novo.";
          } else if (res.status === 413) {
            detalhe = "Rascunho maior que o limite permitido para salvar na conta.";
          } else if (typeof j?.error === "string" && j.error.trim()) {
            detalhe = j.error.trim();
          } else if (res.status >= 500) {
            detalhe = "Erro no servidor ao gravar o rascunho.";
          }
          setMsgRascunho({
            tipo: "aviso",
            text: `${detalhe} Seus dados foram salvos só neste aparelho. Tente «Salvar rascunho» de novo.`,
          });
        }
        return;
      }

      const textoSucessoNuvem = usouSóUrlsFotos
        ? "Rascunho salvo na sua conta sem fotos em base64 (tamanho). URLs https foram mantidas."
        : "Rascunho salvo na sua conta. Você pode continuar em outro aparelho ou mais tarde nesta página.";

      try {
        gravarRascunhoLocal(corpo);
        setMsgRascunho({ tipo: "sucesso", text: textoSucessoNuvem });
      } catch {
        setMsgRascunho({
          tipo: "sucesso",
          text: `${textoSucessoNuvem} Na conta está tudo certo. Este navegador não guardou cópia offline (ainda muito grande ou armazenamento cheio).`,
        });
      }
    } catch {
      if (tentarQuotaLocal(payload)) {
        setMsgRascunho({
          tipo: "aviso",
          text: "Não foi possível enviar o rascunho à nuvem (rede ou servidor inacessível). Rascunho salvo só neste aparelho — tente «Salvar rascunho» de novo.",
        });
      }
    } finally {
      setRascunhoSalvando(false);
      window.setTimeout(() => setMsgRascunho(null), 10000);
    }
  }

  async function descartarRascunhoGuardado() {
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (session?.access_token) {
        await fetch("/api/fornecedor/produtos/rascunho", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(LS_RASCUNHO_CRIAR_VARIANTES);
    } catch {
      /* ignore */
    }
    aplicarPayloadRascunho(estadoInicialRascunhoVazio());
    setAvisoRascunhoCarregado(null);
    setMsgRascunho(null);
  }

  useEffect(() => {
    if (modoEdicao) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      const token = session?.access_token;
      const serverDraft = token && !cancelled ? await fetchServerCriarVariantesDraft(token) : null;
      const localDraft = !cancelled ? parseLocalCriarVariantesDraft() : null;
      if (cancelled) return;
      const merged = mergeCriarVariantesDrafts(serverDraft, localDraft);
      if (!merged) return;

      aplicarPayloadRascunho(merged.draft);
      if (merged.origem === "servidor") {
        try {
          gravarRascunhoLocal(merged.draft);
        } catch {
          /* ignore */
        }
      }
      setAvisoRascunhoCarregado({ savedAt: merged.draft.savedAt, origem: merged.origem });
      window.setTimeout(() => tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    })();
    return () => {
      cancelled = true;
    };
  }, [modoEdicao]);

  useEffect(() => {
    if (!modoEdicao) return;
    let cancelled = false;
    setCarregandoEdicao(true);
    setFormError(null);
    setAvisoRascunhoCarregado(null);
    setMsgRascunho(null);
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          router.replace("/fornecedor/login");
          return;
        }
        const res = await fetch("/api/fornecedor/produtos", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const j = await res.json().catch(() => []);
        if (!res.ok) {
          throw new Error((j as { error?: string })?.error ?? "Erro ao carregar produto para edição.");
        }
        const payload = montarRascunhoEdicao(grupoEdicao, Array.isArray(j) ? (j as ProdutoExistenteEdicao[]) : []);
        if (!payload) {
          throw new Error("Produto não encontrado para edição.");
        }
        if (cancelled) return;
        aplicarPayloadRascunho(payload);
      } catch (e: unknown) {
        if (cancelled) return;
        setFormError(e instanceof Error ? e.message : "Erro ao preparar edição.");
      } finally {
        if (!cancelled) setCarregandoEdicao(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modoEdicao, grupoEdicao, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        const token = session?.access_token;
        if (!token || cancelled) return;
        const res = await fetch("/api/fornecedor/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json().catch(() => ({}))) as { fornecedor?: Record<string, unknown> };
        const f = json.fornecedor ?? {};
        const legExpLinha = String(f.expedicao_padrao_linha ?? "").trim();
        const expCep = String(f.expedicao_cep ?? "").replace(/\D/g, "").slice(0, 8);
        const expLog = upperBr(String(f.expedicao_logradouro ?? ""));
        const expNum = upperBr(String(f.expedicao_numero ?? ""));
        const expComp = upperBr(String(f.expedicao_complemento ?? ""));
        const expBai = upperBr(String(f.expedicao_bairro ?? ""));
        const expCid = upperBr(String(f.expedicao_cidade ?? ""));
        const expUf = upperBr(String(f.expedicao_uf ?? ""))
          .replace(/[^A-Z]/g, "")
          .slice(0, 2);
        const structVazio = !expCep && !expLog && !expNum && !expComp && !expBai && !expCid && !expUf;
        const perfil: PartesEnderecoCd = {
          cep: expCep,
          logradouro: structVazio && legExpLinha ? upperBr(legExpLinha) : expLog,
          numero: expNum,
          complemento: expComp,
          bairro: expBai,
          cidade: expCid,
          uf: expUf,
        };
        if (!cancelled) setPerfilExpedicao(perfil);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cdUsarDespachoCadastro || !perfilExpedicao) return;
    setCdCep(perfilExpedicao.cep);
    setCdLogradouro(perfilExpedicao.logradouro);
    setCdNumero(perfilExpedicao.numero);
    setCdComplemento(perfilExpedicao.complemento);
    setCdBairro(perfilExpedicao.bairro);
    setCdCidade(perfilExpedicao.cidade);
    setCdUf(perfilExpedicao.uf);
  }, [cdUsarDespachoCadastro, perfilExpedicao]);

  useEffect(() => {
    if (cdUsarDespachoCadastro) {
      setBuscandoCepCd(false);
      return;
    }
    const cepConsulta = cepParaConsultaViaCep(cdCep);
    if (!cepConsulta) {
      if (cdCep.replace(/\D/g, "").length === 0) setBuscandoCepCd(false);
      return;
    }
    setBuscandoCepCd(true);
    const ac = new AbortController();
    void fetch(`https://viacep.com.br/ws/${cepConsulta}/json/`, { signal: ac.signal })
      .then((r) => r.json() as Promise<ViaCepJson>)
      .then((data) => {
        if (cepParaConsultaViaCep(cdCepRef.current) !== cepConsulta) return;
        if (data.erro) {
          setBuscandoCepCd(false);
          return;
        }
        const log = String(data.logradouro ?? "").trim();
        const bai = String(data.bairro ?? "").trim();
        const cid = String(data.localidade ?? "").trim();
        const uf = String(data.uf ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 2);
        setCdCep(cepConsulta);
        setCdLogradouro((prev) => (log ? upperBr(log) : prev));
        setCdBairro((prev) => (bai ? upperBr(bai) : prev));
        setCdCidade((prev) => (cid ? upperBr(cid) : prev));
        setCdUf((prev) => (uf ? uf : prev));
        setBuscandoCepCd(false);
      })
      .catch(() => setBuscandoCepCd(false));
    return () => ac.abort();
  }, [cdCep, cdUsarDespachoCadastro]);

  const indiceTab = TABS.findIndex((t) => t.id === tabAtiva);

  function irParaTab(delta: -1 | 1) {
    const next = indiceTab + delta;
    if (next < 0 || next >= TABS.length) return;
    setTabAtiva(TABS[next].id);
    window.setTimeout(() => tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!nomeProduto.trim()) {
      setFormError("Nome do produto é obrigatório.");
      return;
    }
    if (combinacoes.length === 0) {
      setFormError(
        "Falta escolher variante: marque pelo menos uma cor ou um tamanho na aba «Variações» (deslize as abas no celular se não as vir todas)."
      );
      setTabAtiva("variacoes");
      window.setTimeout(() => {
        tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
      return;
    }
    const categoriaVestu = categoria.trim().toLowerCase();
    const exigeMedidas = /camisa|camiseta|blusa|calca|calça|bermuda|saia|vestido|jaqueta|moletom|vestu[aá]rio/.test(categoriaVestu);
    const medidasValidas = medidas.filter((m) => m.tamanho.trim());
    if (exigeMedidas && medidasValidas.length === 0) {
      setFormError("Para vestuário, preencha ao menos uma linha na tabela de medidas.");
      setTabAtiva("medidas");
      return;
    }
    setFormLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const cores = coresFinais;
      const tamanhos = tamanhosFinais;
      const descricaoGuiada = [diferencial, indicacao, observacoesSeller].filter((t) => t.trim()).join(" | ");
      const detalhesProdutoJson: Record<string, unknown> = {
        infoBasica: {
          nomeProduto: nomeProduto.trim() || null,
          categoria: categoria.trim() || null,
          marca: marca.trim() || null,
          modelo: modelo.trim() || null,
          descricao: descricao.trim() || null,
          dataLancamento: dataLancamento || null,
        },
        caracteristicas: {
          tecido: tecido.trim() || null,
          composicao: composicao.trim() || null,
          caimento: caimento || null,
          elasticidade: elasticidade || null,
          transparencia: transparencia || null,
          amassa,
          clima: clima || null,
          ocasioes: ocasioesUsoLista,
          posicionamento: posicionamento || null,
        },
        qualidade: {
          naoDesbota,
          encolhe,
          costuraReforcada,
          observacoes: obsQualidade.trim() || null,
        },
        midia: {
          linkFotos: linkFotos.trim() || null,
          video: linkVideo.trim() || null,
          principal: midiaPrincipal.trim() || null,
          frente: midiaFrente.trim() || null,
          costas: midiaCostas.trim() || null,
          detalhe: midiaDetalhe.trim() || null,
          lifestyle: midiaLifestyle.trim() || null,
        },
        guiado: {
          diferencial: diferencial.trim() || null,
          indicacao: indicacao.trim() || null,
          observacoesSeller: observacoesSeller.trim() || null,
        },
        logistica: {
          slaEnvio: slaEnvio || null,
          ncm: ncm.trim() || null,
          cest: cest.trim() || null,
          origemProduto: origemProduto.trim() || null,
          cfop: cfop.trim() || null,
          unidadeComercial: unidadeComercial.trim() || null,
          cdSaida: cdLinhaFormatada || null,
          cdUsarDespachoCadastro,
          cdSaidaCep: cdCep || null,
          cdSaidaLogradouro: cdLogradouro.trim() || null,
          cdSaidaNumero: cdNumero.trim() || null,
          cdSaidaComplemento: cdComplemento.trim() || null,
          cdSaidaBairro: cdBairro.trim() || null,
          cdSaidaCidade: cdCidade.trim() || null,
          cdSaidaUf: cdUf.trim() || null,
        },
        medidas: {
          topicosSelecionados: [...topicosMedidaSelecionados],
          topicosCustom: topicosMedidaCustom.trim() || null,
        },
      };
      const body: Record<string, unknown> = {
        nome_produto: nomeProduto.trim(),
        cores,
        tamanhos,
        link_fotos: (midiaPrincipal || linkFotos).trim() || null,
        descricao: descricaoGuiada || descricao.trim() || null,
        marca: marca.trim() || null,
        comprimento_cm: comp.trim() ? parseFloat(comp.replace(",", ".")) : undefined,
        largura_cm: largura.trim() ? parseFloat(largura.replace(",", ".")) : undefined,
        altura_cm: altura.trim() ? parseFloat(altura.replace(",", ".")) : undefined,
        peso_kg: peso.trim() ? parseFloat(peso.replace(",", ".")) : undefined,
        data_lancamento: dataLancamento || null,
        detalhes_produto_json: detalhesProdutoJson,
      };
      if (cores.length > 0 && tamanhos.length > 0) {
        const por: Record<string, number> = {};
        for (const cor of cores) {
          for (const tam of tamanhos) {
            const k = chaveEstoqueVariante(cor, tam);
            por[k] = parseQty(estoqueMatriz[k] ?? "") ?? 0;
          }
        }
        body.estoque_por_variante = por;
      } else if (tamanhos.length > 0) {
        const por: Record<string, number> = {};
        for (const tam of tamanhos) {
          const k = tam.toUpperCase();
          por[k] = parseQty(estoquePorTamanho[k] ?? "") ?? 0;
        }
        body.estoque_por_tamanho = por;
      } else if (cores.length > 0) {
        const por: Record<string, number> = {};
        for (const cor of cores) {
          const k = cor.trim().toLowerCase();
          por[k] = parseQty(estoquePorCor[k] ?? "") ?? 0;
        }
        body.estoque_por_cor = por;
      }

      /** Sem custo global: só os valores da tabela / “Aplicar a todos”; células vazias viram 0 no envio. */
      const fallbackCusto = null;
      if (cores.length > 0 && tamanhos.length > 0) {
        const por: Record<string, number> = {};
        for (const cor of cores) {
          for (const tam of tamanhos) {
            const k = chaveEstoqueVariante(cor, tam);
            por[k] = parseMoney(custoMatriz[k] ?? "") ?? fallbackCusto ?? 0;
          }
        }
        body.custo_por_variante = por;
      } else if (tamanhos.length > 0) {
        const por: Record<string, number> = {};
        for (const tam of tamanhos) {
          const k = tam.toUpperCase();
          por[k] = parseMoney(custoPorTamanho[k] ?? "") ?? fallbackCusto ?? 0;
        }
        body.custo_por_tamanho = por;
      } else if (cores.length > 0) {
        const por: Record<string, number> = {};
        for (const cor of cores) {
          const k = cor.trim().toLowerCase();
          por[k] = parseMoney(custoPorCor[k] ?? "") ?? fallbackCusto ?? 0;
        }
        body.custo_por_cor = por;
      }

      if (cores.length > 0) {
        const img: Record<string, string> = {};
        for (const cor of cores) {
          const k = cor.trim().toLowerCase();
          const u = (fotoUrlPorCor[k] ?? "").trim();
          if (u) img[k] = u;
        }
        if (Object.keys(img).length > 0) body.imagem_url_por_cor = img;
      }

      if (modoEdicao) {
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        };

        const addRes = await fetch("/api/fornecedor/produtos/grupo-adicionar-variantes", {
          method: "POST",
          headers,
          body: JSON.stringify({
            grupoKey: grupoEdicao,
            cores,
            tamanhos,
          }),
        });
        const addJson = await addRes.json().catch(() => ({}));
        if (!addRes.ok) {
          throw new Error(addJson?.error ?? "Erro ao sincronizar variantes do grupo.");
        }

        const listRes = await fetch("/api/fornecedor/produtos", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const listJson = await listRes.json().catch(() => []);
        if (!listRes.ok) {
          throw new Error((listJson as { error?: string })?.error ?? "Erro ao carregar produtos para editar.");
        }
        const rows = (Array.isArray(listJson) ? listJson : []) as ProdutoExistenteEdicao[];
        const grupoRows = rows
          .filter((r) => grupoKeyFromSku(r.sku) === grupoEdicao)
          .sort((a, b) => a.sku.localeCompare(b.sku));
        if (grupoRows.length === 0) {
          throw new Error("Grupo não encontrado para edição.");
        }

        const pai = grupoRows.find((r) => r.sku.trim().toUpperCase() === grupoEdicao) ?? null;
        const variantes = grupoRows.filter((r) => r.sku.trim().toUpperCase() !== grupoEdicao);
        const mapVariante = new Map<string, ProdutoExistenteEdicao>();
        for (const row of variantes) {
          mapVariante.set(pairKeyFromValues(row.cor, row.tamanho), row);
        }

        const descricaoGuiada = [diferencial, indicacao, observacoesSeller].filter((t) => t.trim()).join(" | ");
        const patchPai: Record<string, unknown> = {
          nome_produto: nomeProduto.trim(),
          categoria: categoria.trim() || null,
          descricao: descricaoGuiada || descricao.trim() || null,
          comprimento_cm: comp.trim() ? parseFloat(comp.replace(",", ".")) : null,
          largura_cm: largura.trim() ? parseFloat(largura.replace(",", ".")) : null,
          altura_cm: altura.trim() ? parseFloat(altura.replace(",", ".")) : null,
          peso_kg: peso.trim() ? parseFloat(peso.replace(",", ".")) : null,
          link_fotos: (midiaPrincipal || linkFotos).trim() || null,
          ncm: ncm.trim() || null,
          origem: origemProduto.trim() || null,
          cest: cest.trim() || null,
          cfop: cfop.trim() || null,
          expedicao_override_linha: cdLinhaFormatada || null,
          detalhes_produto_json: detalhesProdutoJson,
        };

        const reqs: Promise<Response>[] = [];
        if (pai?.id) {
          reqs.push(
            fetch(`/api/fornecedor/produtos/${pai.id}`, {
              method: "PATCH",
              headers,
              body: JSON.stringify(patchPai),
            })
          );
        }

        for (const combo of combinacoes) {
          const corNorm = combo.cor ? toTitleCase(combo.cor) : "";
          const tamNorm = combo.tamanho ? combo.tamanho.toUpperCase() : "";
          const row = mapVariante.get(pairKeyFromValues(corNorm, tamNorm));
          if (!row?.id) continue;
          const keyMatriz = chaveEstoqueVariante(corNorm, tamNorm);
          const estoqueAtual =
            cores.length > 0 && tamanhos.length > 0
              ? parseQty(estoqueMatriz[keyMatriz] ?? "")
              : tamanhos.length > 0
                ? parseQty(estoquePorTamanho[tamNorm] ?? "")
                : parseQty(estoquePorCor[corNorm.trim().toLowerCase()] ?? "");
          const custoAtual =
            cores.length > 0 && tamanhos.length > 0
              ? parseMoney(custoMatriz[keyMatriz] ?? "")
              : tamanhos.length > 0
                ? parseMoney(custoPorTamanho[tamNorm] ?? "")
                : parseMoney(custoPorCor[corNorm.trim().toLowerCase()] ?? "");
          const imgCorStr = (fotoUrlPorCor[corNorm.trim().toLowerCase()] ?? "").trim();
          const imgCor = imgCorStr || null;

          const patchVariante: Record<string, unknown> = {};
          if ((row.cor ?? "") !== (corNorm || null)) patchVariante.cor = corNorm || null;
          if ((row.tamanho ?? "") !== (tamNorm || null)) patchVariante.tamanho = tamNorm || null;
          if (estoqueAtual != null && estoqueAtual !== row.estoque_atual) patchVariante.estoque_atual = estoqueAtual;
          if (custoAtual != null && custoAtual !== row.custo_base) patchVariante.custo_base = custoAtual;
          if (imgCor !== (row.imagem_url ?? null)) patchVariante.imagem_url = imgCor;
          if (Object.keys(patchVariante).length === 0) continue;

          reqs.push(
            fetch(`/api/fornecedor/produtos/${row.id}`, {
              method: "PATCH",
              headers,
              body: JSON.stringify(patchVariante),
            })
          );
        }

        const results = await Promise.all(reqs);
        for (const r of results) {
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j?.error ?? "Erro ao salvar alterações do produto.");
          }
        }
      } else {
        const res = await fetch("/api/fornecedor/produtos/multivariante", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "Erro ao criar variantes.");
      }
      try {
        await fetch("/api/fornecedor/produtos/rascunho", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem(LS_RASCUNHO_CRIAR_VARIANTES);
      } catch {
        /* ignore */
      }
      router.push("/fornecedor/produtos");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : modoEdicao ? "Erro ao editar produto." : "Erro ao criar variantes.");
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div className="min-h-screen min-w-0 bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] md:pb-16">
      {/*
        Barra do formulário: sticky só no mobile (abaixo do MobileAppBar).
        No desktop, fixed + sticky empilhados costumam causar “travamento”/cliques estranhos no topo — aqui fica estática; use «Salvar» no fim do formulário.
      */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-20 border-b border-[var(--card-border)] bg-[var(--card)] shadow-sm md:static md:top-auto md:z-auto md:shadow-none">
        <div className="dropcore-shell-4xl flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Link
              href="/fornecedor/produtos"
              className="flex shrink-0 items-center gap-1.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">Voltar</span>
            </Link>
            <h1 className="min-w-0 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100 sm:text-base">
              {modoEdicao ? "Editar produto" : "Criar variantes"}
            </h1>
          </div>
          <div />
        </div>
      </div>

      <div className="dropcore-shell-4xl flex flex-col gap-4 overflow-x-hidden py-4 md:flex-row md:gap-6">
        {/* Conteúdo principal */}
        <div className="min-w-0 flex-1 order-2 md:order-1">
          <form id="form-criar-variantes" onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-100 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
                {formError}
              </div>
            )}
            {modoEdicao && (
              <div className="rounded-lg border border-neutral-200/90 bg-neutral-50 p-3 text-xs text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800/70 dark:text-neutral-200">
                {carregandoEdicao
                  ? `Carregando dados do produto ${grupoEdicao}...`
                  : `Editando o grupo ${grupoEdicao} no formulário completo.`}
              </div>
            )}

            {tabAtiva === "caracteristicas" && (
              <div className="rounded-2xl border border-[#e8ecf2] bg-[var(--card)] p-5 shadow-[0_6px_18px_-16px_rgba(15,23,42,0.2)] sm:p-6 dark:border-[#2f3540]">
                <div className="mb-4">
                  <h2 className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">Características do produto</h2>
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">Dados de percepção para anúncio e decisão rápida do seller.</p>
                </div>

                <div className="space-y-3.5">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium tracking-wide text-neutral-600 dark:text-neutral-400">Tipo de tecido *</label>
                    <input value={tecido} onChange={(e) => setTecido(e.target.value)} className={inputDelicado} placeholder="Ex.: Poliéster" required />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium tracking-wide text-neutral-600 dark:text-neutral-400">Composição</label>
                    <input value={composicao} onChange={(e) => setComposicao(e.target.value)} className={inputDelicado} placeholder="Ex.: 96% poliéster, 4% elastano" />
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-100 p-3 dark:border-[#313844] dark:bg-[#1d232c]">
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Caimento</label>
                      <select value={caimento} onChange={(e) => setCaimento(e.target.value as "slim" | "regular" | "oversized" | "")} className={`${inputDelicado} hidden md:block`}>
                        <option value="">Selecione</option>
                        {caimentoOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button type="button" onClick={() => setPickerCampo("caimento")} className={`${inputDelicado} flex w-full items-center justify-between md:hidden`}>
                        <span>{labelSelecionado(caimentoOptions, caimento)}</span>
                        <span className="text-neutral-400">▾</span>
                      </button>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Elasticidade</label>
                      <select value={elasticidade} onChange={(e) => setElasticidade(e.target.value as "baixa" | "media" | "alta" | "")} className={`${inputDelicado} hidden md:block`}>
                        <option value="">Selecione</option>
                        {elasticidadeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button type="button" onClick={() => setPickerCampo("elasticidade")} className={`${inputDelicado} flex w-full items-center justify-between md:hidden`}>
                        <span>{labelSelecionado(elasticidadeOptions, elasticidade)}</span>
                        <span className="text-neutral-400">▾</span>
                      </button>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Transparência</label>
                      <select value={transparencia} onChange={(e) => setTransparencia(e.target.value as "nao" | "leve" | "alta" | "")} className={`${inputDelicado} hidden md:block`}>
                        <option value="">Selecione</option>
                        {transparenciaOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button type="button" onClick={() => setPickerCampo("transparencia")} className={`${inputDelicado} flex w-full items-center justify-between md:hidden`}>
                        <span>{labelSelecionado(transparenciaOptions, transparencia)}</span>
                        <span className="text-neutral-400">▾</span>
                      </button>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Clima ideal</label>
                      <select value={clima} onChange={(e) => setClima(e.target.value as "calor" | "frio" | "ambos" | "")} className={`${inputDelicado} hidden md:block`}>
                        <option value="">Selecione</option>
                        {climaOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button type="button" onClick={() => setPickerCampo("clima")} className={`${inputDelicado} flex w-full items-center justify-between md:hidden`}>
                        <span>{labelSelecionado(climaOptions, clima)}</span>
                        <span className="text-neutral-400">▾</span>
                      </button>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Posicionamento</label>
                      <select value={posicionamento} onChange={(e) => setPosicionamento(e.target.value as "basico" | "intermediario" | "premium" | "")} className={`${inputDelicado} hidden md:block`}>
                        <option value="">Selecione</option>
                        {posicionamentoOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button type="button" onClick={() => setPickerCampo("posicionamento")} className={`${inputDelicado} flex w-full items-center justify-between md:hidden`}>
                        <span>{labelSelecionado(posicionamentoOptions, posicionamento)}</span>
                        <span className="text-neutral-400">▾</span>
                      </button>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Amassa fácil?</label>
                      <div className="flex h-[34px] items-center gap-1.5 rounded-lg border border-[#e5e9ef] bg-white px-1.5 dark:border-[#394353] dark:bg-[#161c25]">
                      <button type="button" onClick={() => setAmassa(true)} className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${amassa === true ? "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200" : "border-transparent text-neutral-600 dark:text-neutral-300"}`}>Sim</button>
                      <button type="button" onClick={() => setAmassa(false)} className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${amassa === false ? "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200" : "border-transparent text-neutral-600 dark:text-neutral-300"}`}>Não</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-medium tracking-wide text-neutral-600 dark:text-neutral-400">Ocasião de uso</p>
                  <VarianteExtrasTagInput
                    value={ocasioesUsoTexto}
                    onChange={setOcasioesUsoTexto}
                    normalize="title"
                    placeholder="Digite e pressione Enter (ex.: Dia a Dia, Trabalho, Evento)"
                    aria-label="Ocasiões de uso"
                    inputClassName="max-w-full"
                  />
                  <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Você pode adicionar várias ocasiões. Digite uma opção e pressione Enter para salvar.
                  </p>
                </div>
                </div>
              </div>
            )}

            {tabAtiva === "medidas" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-5 sm:p-5.5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Medidas</h2>
                  <button
                    type="button"
                    onClick={() => setMedidas((prev) => [...prev, { tamanho: "", largura: undefined, comprimento: undefined, ombro: undefined, manga: undefined }])}
                    className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
                  >
                    Adicionar tamanho
                  </button>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Preset rápido</label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTopicosMedidaSelecionados(new Set(["Ombros", "Comprimento da manga", "Comprimento", "Bíceps"]));
                          setTopicosMedidaCustom("");
                        }}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      >
                        Camisa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTopicosMedidaSelecionados(
                            new Set(["Cintura", "Quadril", "Comprimento", "Entrepernas", "Gancho (altura · calça)"]),
                          );
                          setTopicosMedidaCustom("");
                        }}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      >
                        Calça
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTopicosMedidaSelecionados(new Set(["Busto", "Cintura", "Comprimento"]));
                          setTopicosMedidaCustom("");
                        }}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      >
                        Vestido
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTopicosMedidaSelecionados(new Set());
                          setTopicosMedidaCustom("");
                        }}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      >
                        Personalizado
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Tópicos selecionados</label>
                      <button
                        type="button"
                        onClick={() => setModalTopicosMedida(true)}
                        className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
                      >
                        + Adicionar tópico
                      </button>
                    </div>
                    <div className="mt-1 flex min-h-[38px] max-h-[82px] flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-[#edf1f5] bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900/40">
                      {topicosMedidaFinais.map((topico) => (
                        <span key={`resumo-${topico}`} className="rounded-full border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
                          {topico}
                        </span>
                      ))}
                      {topicosMedidaFinais.length === 0 && <span className="text-[11px] text-neutral-400">Nenhum tópico selecionado.</span>}
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Preencha uma linha por tamanho (ex.: PP, P, M, G, GG) e os tópicos escolhidos.
                  </p>
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <div className="flex min-w-max flex-col gap-2.5 pr-1">
                  {medidas.map((m, idx) => (
                    <div
                      key={`medida-desktop-${idx}`}
                      className="grid gap-2 rounded-lg border border-neutral-200 bg-neutral-100 p-2 dark:border-neutral-700 dark:bg-neutral-900/40"
                      style={{
                        gridTemplateColumns: `minmax(140px,1fr) repeat(${Math.max(topicosMedidaFinais.length, 1)}, minmax(110px,1fr)) auto`,
                        minWidth: `${220 + Math.max(topicosMedidaFinais.length, 1) * 130}px`,
                      }}
                    >
                      <input value={m.tamanho} onChange={(e) => setMedidas((prev) => prev.map((it, i) => (i === idx ? { ...it, tamanho: e.target.value.toUpperCase() } : it)))} placeholder="Tamanho" className={inputDelicado} />
                      {topicosMedidaFinais.map((topico) => (
                        <input
                          key={`${topico}-${idx}`}
                          value={getValorTopico(m, topico)}
                          onChange={(e) => setValorTopico(idx, topico, e.target.value)}
                          placeholder={topico}
                          className={inputDelicado}
                        />
                      ))}
                      <button type="button" onClick={() => setMedidas((prev) => prev.filter((_, i) => i !== idx))} className="rounded-lg border border-red-200 bg-red-100 px-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/20">
                        Remover
                      </button>
                    </div>
                  ))}
                  </div>
                </div>
                <div className="md:hidden overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-100 p-2 pr-1 dark:border-neutral-700 dark:bg-neutral-900/30">
                  <div className="flex min-w-max flex-col gap-2.5">
                    {medidas.map((m, idx) => (
                      <div
                        key={`medida-mobile-${idx}`}
                        className="grid gap-2 rounded-lg border border-neutral-200 bg-neutral-100 p-2 dark:border-neutral-700 dark:bg-neutral-900/40"
                        style={{
                          gridTemplateColumns: `minmax(140px,1fr) repeat(${Math.max(topicosMedidaFinais.length, 1)}, minmax(110px,1fr)) auto`,
                          minWidth: `${220 + Math.max(topicosMedidaFinais.length, 1) * 130}px`,
                        }}
                      >
                        <input value={m.tamanho} onChange={(e) => setMedidas((prev) => prev.map((it, i) => (i === idx ? { ...it, tamanho: e.target.value.toUpperCase() } : it)))} placeholder="Tamanho" className={inputDelicado} />
                        {topicosMedidaFinais.map((topico) => (
                          <input
                            key={`mobile-${topico}-${idx}`}
                            value={getValorTopico(m, topico)}
                            onChange={(e) => setValorTopico(idx, topico, e.target.value)}
                            placeholder={topico}
                            className={inputDelicado}
                          />
                        ))}
                        <button type="button" onClick={() => setMedidas((prev) => prev.filter((_, i) => i !== idx))} className="rounded-lg border border-red-200 bg-red-100 px-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/20">
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {avisoRascunhoCarregado && (
              <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-sm text-neutral-700 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-200">
                <p className="min-w-0 text-xs sm:text-sm">
                  <span className="font-semibold">Rascunho carregado</span>
                  {" · "}
                  Salvo em{" "}
                  {new Date(avisoRascunhoCarregado.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  {avisoRascunhoCarregado.origem === "local"
                    ? " (só neste aparelho — use «Salvar rascunho» para enviar à conta)."
                    : " (na sua conta)."}
                </p>
                <button
                  type="button"
                  onClick={() => void descartarRascunhoGuardado()}
                  className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 sm:text-sm"
                >
                  Descartar rascunho
                </button>
              </div>
            )}

            {msgRascunho && (
              <div
                className={
                  msgRascunho.tipo === "sucesso"
                    ? "rounded-lg border border-emerald-300 bg-emerald-100 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY, "rounded-lg p-3 text-sm")
                }
                role="status"
              >
                {msgRascunho.text}
              </div>
            )}

            {tabAtiva === "info-basica" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Informações básicas</h2>
                <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-100 p-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200">
                  <p className="font-medium">Antes de salvar</p>
                  <p className="mt-1 text-neutral-600 dark:text-neutral-300">
                    É obrigatório escolher <strong>pelo menos uma cor ou um tamanho</strong>. Use as abas acima (no celular, deslize para a direita) e abra{" "}
                    <strong>Variações</strong> para marcar as opções.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTabAtiva("variacoes");
                      window.setTimeout(() => tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                    }}
                    className="mt-3 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800 sm:w-auto"
                  >
                    Ir para variações →
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">
                      SKU Pai (será gerado automaticamente)
                    </label>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 py-2">
                      O SKU do produto pai será gerado ao salvar com as iniciais do fornecedor (ex: Djulios → DJU001000).
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Nome do Produto *</label>
                    <input
                      type="text"
                      value={nomeProduto}
                      onChange={(e) => setNomeProduto(e.target.value)}
                      onBlur={() => setNomeProduto(toTitleCase(nomeProduto))}
                      placeholder="Ex: Camisa Social Manga Longa Gola Padre"
                      maxLength={500}
                      className={inputBase}
                      required
                    />
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">{nomeProduto.length}/500</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Categoria *</label>
                      <input
                        type="text"
                        value={categoria}
                        onChange={(e) => setCategoria(e.target.value)}
                        onBlur={() => setCategoria(toTitleCase(categoria))}
                        placeholder="Ex.: Camisa social"
                        className={inputBase}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Marca</label>
                      <input
                        type="text"
                        value={marca}
                        onChange={(e) => setMarca(e.target.value)}
                        onBlur={() => setMarca(toTitleCase(marca))}
                        placeholder="Marca do produto"
                        className={inputBase}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Modelo</label>
                    <input
                      type="text"
                      value={modelo}
                      onChange={(e) => setModelo(e.target.value)}
                      onBlur={() => setModelo(toTitleCase(modelo))}
                      placeholder="Ex.: Gola padre manga curta"
                      className={inputBase}
                    />
                  </div>
                </div>
              </div>
            )}

            {tabAtiva === "variacoes" && (
              <div className="rounded-xl border border-[#e5e9ef] bg-[var(--card)] p-5 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.24)] sm:p-5.5 dark:border-[#343c4a] dark:shadow-none space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Variações</h2>
                  <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
                    {combinacoes.length} combinações
                  </span>
                </div>

                <div className="space-y-3.5">
                  <div className="rounded-lg border border-neutral-200 bg-neutral-100 p-3 dark:border-neutral-700 dark:bg-neutral-900/40">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[12px] font-medium text-neutral-700 dark:text-neutral-300">Cores</p>
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400">{coresFinais.length} selecionada(s)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CORES_PREDEFINIDAS.map((cor) => {
                        const ativa = coresSelecionadas.has(cor);
                        return (
                          <button
                            key={cor}
                            type="button"
                            onClick={() => toggleCor(cor)}
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                              ativa
                                ? "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                                : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900/50 dark:text-neutral-200"
                            }`}
                          >
                            {cor}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2">
                      <VarianteExtrasTagInput
                        value={corCustom}
                        onChange={setCorCustom}
                        normalize="title"
                        placeholder="Adicionar cor personalizada (Enter)"
                        aria-label="Cores extras ou personalizadas"
                        inputClassName="max-w-xl"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-neutral-200 bg-neutral-100 p-3 dark:border-neutral-700 dark:bg-neutral-900/40">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[12px] font-medium text-neutral-700 dark:text-neutral-300">Tamanhos</p>
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400">{tamanhosFinais.length} selecionado(s)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TAMANHOS_PREDEFINIDOS.map((tam) => {
                        const ativo = tamanhosSelecionados.has(tam);
                        return (
                          <button
                            key={tam}
                            type="button"
                            onClick={() => toggleTamanho(tam)}
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                              ativo
                                ? "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                                : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900/50 dark:text-neutral-200"
                            }`}
                          >
                            {tam}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2">
                      <VarianteExtrasTagInput
                        value={tamanhoCustom}
                        onChange={setTamanhoCustom}
                        normalize="upper"
                        placeholder="Adicionar tamanho personalizado (Enter)"
                        aria-label="Tamanhos extras ou personalizados"
                        inputClassName="max-w-xl"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tabAtiva === "lista-variacoes" && (
              <div className="min-w-0 rounded-xl border border-[#e6eaf0] bg-white shadow-[0_8px_24px_-20px_rgba(15,23,42,0.2)] dark:border-neutral-700 dark:bg-[var(--card)]">
                <div className="border-b border-[#ebeff4] bg-[#fcfcfd] px-4 py-3.5 dark:border-neutral-700 dark:bg-neutral-900/60 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">Lista de variações</h2>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        Deslize a tabela na horizontal se precisar de mais espaço. Foto por cor grava em{" "}
                        <strong className="text-neutral-700 dark:text-neutral-300">imagem_url</strong> em todas as variantes dessa cor. Os SKUs das variantes são
                        gerados ao salvar o produto.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {combinacoes.length} variante{combinacoes.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setTabAtiva("variacoes");
                          window.setTimeout(() => tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                        }}
                        className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      >
                        Ajustar cores / tamanhos
                      </button>
                    </div>
                  </div>
                </div>

                {combinacoes.length === 0 ? (
                  <div className="px-4 py-12 text-center sm:px-6">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Selecione cores e tamanhos em <strong>Variações</strong> para ver a lista aqui.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900/30">
                      <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-2">Prévia das variações geradas automaticamente (SKU + cor + tamanho)</p>
                      <div className="max-h-44 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                        <table className="w-full text-xs">
                          <thead className="bg-neutral-100 dark:bg-neutral-900">
                            <tr>
                              <th className="px-2 py-1.5 text-left">SKU</th>
                              <th className="px-2 py-1.5 text-left">Cor</th>
                              <th className="px-2 py-1.5 text-left">Tamanho</th>
                              <th className="px-2 py-1.5 text-left">Estoque</th>
                              <th className="px-2 py-1.5 text-left">Custo</th>
                              <th className="px-2 py-1.5 text-left">Peso kg</th>
                              <th className="px-2 py-1.5 text-left">Imagem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {variantesGeradas.map((v) => (
                              <tr key={v.sku} className="border-t border-neutral-100 dark:border-neutral-800">
                                <td className="px-2 py-1.5 font-mono">{v.sku}</td>
                                <td className="px-2 py-1.5">{v.cor}</td>
                                <td className="px-2 py-1.5">{v.tamanho}</td>
                                <td className="px-2 py-1.5">{v.estoque ?? "—"}</td>
                                <td className="px-2 py-1.5">{v.custo ?? "—"}</td>
                                <td className="px-2 py-1.5">{v.peso ?? "—"}</td>
                                <td className="px-2 py-1.5 truncate max-w-[14rem]">{v.imagem || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="border-b border-neutral-200 bg-neutral-100 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900/50 sm:px-5">
                      <p className="mb-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200">Preencher em massa</p>
                      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="min-w-0 sm:max-w-[11rem] sm:flex-1">
                          <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                            Preço (R$) <span className="text-neutral-900 dark:text-neutral-100">*</span>
                          </label>
                          <div className="flex overflow-hidden rounded border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800">
                            <span className="shrink-0 border-r border-neutral-200 px-2 py-2 text-xs text-neutral-500 dark:border-neutral-600">
                              R$
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={massaCusto}
                              onChange={(e) => setMassaCusto(e.target.value)}
                              placeholder="0,00"
                              className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2 text-sm outline-none focus:ring-0"
                            />
                          </div>
                        </div>
                        <div className="min-w-0 sm:max-w-[9rem] sm:flex-1">
                          <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                            Estoque <span className="text-neutral-900 dark:text-neutral-100">*</span>
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={massaEstoque}
                            onChange={(e) => setMassaEstoque(e.target.value)}
                            placeholder="0"
                            className={`${inputDelicado} w-full py-1.5 tabular-nums`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={aplicarMassaTodos}
                          className="col-span-2 min-h-[40px] rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 shadow-sm transition hover:bg-neutral-100 active:opacity-95 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800 sm:col-span-1 sm:min-h-0 sm:px-3.5 sm:py-1.5"
                        >
                          Aplicar a todos
                        </button>
                      </div>
                      {avisoFoto && (
                        <p className={cn("mt-2 text-xs", AMBER_PREMIUM_TEXT_SOFT)} role="status">
                          {avisoFoto}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 px-4 py-3 md:hidden">
                      {combinacoes.map((c, idx) => {
                        const k = chaveEstoqueVariante(c.cor, c.tamanho);
                        const ck = c.cor.trim().toLowerCase();
                        const url = fotoUrlPorCor[ck] ?? "";
                        const sku = skuAutomatico(c.cor, c.tamanho, idx);
                        return (
                          <div key={`mobile-${k}`} className="rounded-lg border border-[#e8ecf2] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/40">
                            <div className="flex items-start gap-2.5">
                              <label className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800">
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                  className="sr-only"
                                  onChange={(e) => aoEscolherArquivoFotoCor(c.cor, e)}
                                />
                                {url ? (
                                  <img src={url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                    <circle cx="12" cy="13" r="3" />
                                  </svg>
                                )}
                              </label>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">{c.cor || "Sem cor"} · {c.tamanho || "Sem tamanho"}</p>
                                <p className="mt-0.5 truncate font-mono text-[10px] text-neutral-500">{sku}</p>
                              </div>
                            </div>
                            <div className="mt-2 space-y-2">
                              <div>
                                <label className="mb-1 block text-[11px] text-neutral-500">Preço</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={custoMatriz[k] ?? ""}
                                  onChange={(e) => setCustoMatriz((p) => ({ ...p, [k]: e.target.value }))}
                                  className={inputDelicado}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] text-neutral-500">Estoque</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={estoqueMatriz[k] ?? ""}
                                  onChange={(e) => setEstoqueMatriz((p) => ({ ...p, [k]: e.target.value }))}
                                  className={inputDelicado}
                                />
                              </div>
                              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 dark:border-neutral-600 dark:text-neutral-300">
                                + Adicionar foto
                                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => aoEscolherArquivoFotoCor(c.cor, e)} />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="dropcore-scroll-x -mx-4 hidden max-h-[min(52dvh,24rem)] min-w-0 overflow-y-auto border-t border-neutral-100 dark:border-neutral-800 sm:mx-0 sm:max-h-[min(60vh,28rem)] md:block">
                      <table className="w-full min-w-[30rem] border-collapse text-xs md:min-w-[44rem] md:text-sm">
                        <thead className="sticky top-0 z-20 shadow-sm">
                          <tr className="border-b border-neutral-200 bg-neutral-100 text-left text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                            <th className="min-w-[11.25rem] px-2 py-2 pl-4 md:w-[12.5rem] md:min-w-[12rem] md:px-3 md:py-3 md:pl-4">Cor / foto</th>
                            <th className="whitespace-nowrap px-2 py-2 md:px-3 md:py-3">Tamanho</th>
                            <th className="min-w-[7.5rem] px-2 py-2 md:min-w-[9rem] md:px-3 md:py-3">
                              Preço (R$) <span className="text-neutral-900 dark:text-neutral-100">*</span>
                            </th>
                            <th className="min-w-[5.25rem] px-2 py-2 pr-4 md:min-w-[7rem] md:px-3 md:py-3 md:pr-4">
                              Estoque <span className="text-neutral-900 dark:text-neutral-100">*</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {coresFinais.length > 0 && tamanhosFinais.length > 0
                            ? coresFinais.flatMap((cor, corIndex) =>
                                tamanhosOrdenados.map((tam, idx) => {
                                  const k = chaveEstoqueVariante(cor, tam);
                                  const ck = cor.trim().toLowerCase();
                                  const url = fotoUrlPorCor[ck] ?? "";
                                  const urlHttp = url.startsWith("http://") || url.startsWith("https://") ? url : "";
                                  const separadorCor = idx === 0 && corIndex > 0;
                                  return (
                                    <tr
                                      key={k}
                                      className={`border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900/30 ${separadorCor ? "border-t-2 border-t-neutral-200 dark:border-t-neutral-700" : ""}`}
                                    >
                                      <td
                                        className={`align-top border-r border-neutral-100 px-1.5 py-1.5 pl-2 dark:border-neutral-800 max-md:min-w-0 md:px-3 md:py-2 md:pl-4 ${
                                          idx === 0
                                            ? "bg-neutral-100 dark:bg-neutral-900/50"
                                            : "align-middle bg-white py-1 dark:bg-neutral-900/25"
                                        }`}
                                      >
                                        {idx === 0 ? (
                                          <div className="flex min-w-0 w-full max-w-full flex-row items-start gap-1.5 md:max-w-[15.5rem] md:gap-2">
                                            <div className="flex shrink-0 flex-col items-start gap-0.5">
                                              <label className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-neutral-300 bg-white hover:border-neutral-500 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:border-neutral-400 md:h-12 md:w-12">
                                                <input
                                                  id={`foto-cor-${ck}`}
                                                  type="file"
                                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                                  className="sr-only"
                                                  onChange={(e) => aoEscolherArquivoFotoCor(cor, e)}
                                                />
                                                {url ? (
                                                  <img src={url} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400 md:h-[22px] md:w-[22px]">
                                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                                    <circle cx="12" cy="13" r="3" />
                                                  </svg>
                                                )}
                                              </label>
                                              {url ? (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setFotoUrlPorCor((p) => {
                                                      const n = { ...p };
                                                      delete n[ck];
                                                      return n;
                                                    })
                                                  }
                                                  className="shrink-0 rounded border border-neutral-200 px-1 py-0.5 text-[9px] font-medium text-neutral-500 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800 md:text-[10px]"
                                                >
                                                  Limpar
                                                </button>
                                              ) : null}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <input
                                                type="url"
                                                value={urlHttp}
                                                onChange={(e) => {
                                                  const v = e.target.value.trim();
                                                  setFotoUrlPorCor((prev) => {
                                                    const n = { ...prev };
                                                    if (!v) {
                                                      delete n[ck];
                                                      return n;
                                                    }
                                                    if (v.startsWith("http://") || v.startsWith("https://")) n[ck] = v;
                                                    return n;
                                                  });
                                                }}
                                                placeholder="https://... (opcional)"
                                                className={`${inputBase} w-full py-1 text-[11px] md:py-1.5 md:text-xs`}
                                              />
                                              <p className="mt-0.5 truncate text-[11px] font-semibold leading-tight text-neutral-900 dark:text-neutral-100 md:text-xs">
                                                {cor}
                                              </p>
                                            </div>
                                          </div>
                                        ) : (
                                          <label
                                            htmlFor={`foto-cor-${ck}`}
                                            className="flex max-w-full cursor-pointer items-center gap-1 rounded-md py-0.5 md:max-w-[11rem] md:gap-1.5"
                                          >
                                            {url ? (
                                              <img src={url} alt="" className="h-7 w-7 shrink-0 rounded border border-neutral-200 object-cover dark:border-neutral-600 md:h-8 md:w-8" />
                                            ) : (
                                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-dashed border-neutral-200 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 md:h-8 md:w-8">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
                                                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                                  <circle cx="12" cy="13" r="3" />
                                                </svg>
                                              </span>
                                            )}
                                            <span className="min-w-0 truncate text-[10px] font-medium text-neutral-600 dark:text-neutral-300 md:text-[11px]">{cor}</span>
                                          </label>
                                        )}
                                      </td>
                                      <td className="px-1 py-1.5 text-center text-[11px] font-medium text-neutral-800 dark:text-neutral-200 md:px-3 md:py-2 md:text-left md:text-sm">
                                        {tam}
                                      </td>
                                      <td className="px-1 py-1 md:px-3 md:py-2">
                                        <div className="flex w-full min-w-0 overflow-hidden rounded border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800 md:max-w-[10rem]">
                                          <span className="shrink-0 border-r border-neutral-200 px-1 py-1 text-[9px] text-neutral-500 dark:border-neutral-600 md:px-2 md:py-1.5 md:text-xs">
                                            R$
                                          </span>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={custoMatriz[k] ?? ""}
                                            onChange={(e) => setCustoMatriz((p) => ({ ...p, [k]: e.target.value }))}
                                            className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-[11px] outline-none md:px-2 md:py-1.5 md:text-sm"
                                          />
                                        </div>
                                      </td>
                                      <td className="px-1 py-1 pr-2 md:px-3 md:py-2 md:pr-4">
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          value={estoqueMatriz[k] ?? ""}
                                          onChange={(e) => setEstoqueMatriz((p) => ({ ...p, [k]: e.target.value }))}
                                          className={`${inputBase} w-full min-w-0 max-w-[7rem] py-1 tabular-nums md:max-w-[6.5rem] md:py-2`}
                                        />
                                      </td>
                                    </tr>
                                  );
                                })
                              )
                            : null}
                          {tamanhosFinais.length > 0 && coresFinais.length === 0
                            ? tamanhosOrdenados.map((tam) => {
                                const k = tam.toUpperCase();
                                return (
                                  <tr key={k} className="border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900/30">
                                    <td className="px-1.5 py-2 pl-2 text-xs text-neutral-400 dark:text-neutral-500 md:px-3 md:py-3 md:pl-4 md:text-sm">
                                      —
                                    </td>
                                    <td className="px-1 py-2 text-center text-[11px] font-medium text-neutral-800 dark:text-neutral-200 md:px-3 md:py-2.5 md:text-left md:text-sm">
                                      {tam}
                                    </td>
                                    <td className="px-1 py-2 md:px-3">
                                      <div className="flex w-full min-w-0 overflow-hidden rounded border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800 md:max-w-[10rem]">
                                        <span className="shrink-0 border-r border-neutral-200 px-1.5 py-1 text-[10px] text-neutral-500 dark:border-neutral-600 md:px-2 md:py-1.5 md:text-xs">
                                          R$
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={custoPorTamanho[k] ?? ""}
                                          onChange={(e) => setCustoPorTamanho((p) => ({ ...p, [k]: e.target.value }))}
                                          className="min-w-0 flex-1 border-0 bg-transparent px-1.5 py-1 text-[11px] outline-none md:px-2 md:py-1.5 md:text-sm"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-1 py-2 pr-2 md:px-3 md:pr-4">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={estoquePorTamanho[k] ?? ""}
                                        onChange={(e) => setEstoquePorTamanho((p) => ({ ...p, [k]: e.target.value }))}
                                        className={`${inputBase} w-full min-w-0 max-w-[7rem] py-1.5 tabular-nums md:max-w-[6.5rem] md:py-2`}
                                      />
                                    </td>
                                  </tr>
                                );
                              })
                            : null}
                          {coresFinais.length > 0 && tamanhosFinais.length === 0
                            ? coresFinais.map((cor) => {
                                const k = cor.trim().toLowerCase();
                                return (
                                  <tr key={k} className="border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900/30">
                                    <td className="px-1.5 py-2 pl-2 align-top md:px-3 md:py-3 md:pl-4">
                                      {(() => {
                                        const ck = cor.trim().toLowerCase();
                                        const url = fotoUrlPorCor[ck] ?? "";
                                        const urlHttp = url.startsWith("http://") || url.startsWith("https://") ? url : "";
                                        return (
                                          <div className="flex w-full max-w-full flex-col gap-2 md:w-[11.25rem]">
                                            <div className="flex items-start gap-2">
                                              <label className="relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800">
                                                <input
                                                  id={`foto-cor-${ck}`}
                                                  type="file"
                                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                                  className="sr-only"
                                                  onChange={(e) => aoEscolherArquivoFotoCor(cor, e)}
                                                />
                                                {url ? (
                                                  <img src={url} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
                                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                                    <circle cx="12" cy="13" r="3" />
                                                  </svg>
                                                )}
                                              </label>
                                              {url ? (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setFotoUrlPorCor((p) => {
                                                      const n = { ...p };
                                                      delete n[ck];
                                                      return n;
                                                    })
                                                  }
                                                  className="shrink-0 rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
                                                >
                                                  Limpar
                                                </button>
                                              ) : null}
                                            </div>
                                            <input
                                              type="url"
                                              value={urlHttp}
                                              onChange={(e) => {
                                                const v = e.target.value.trim();
                                                setFotoUrlPorCor((prev) => {
                                                  const n = { ...prev };
                                                  if (!v) {
                                                    delete n[ck];
                                                    return n;
                                                  }
                                                  if (v.startsWith("http://") || v.startsWith("https://")) n[ck] = v;
                                                  return n;
                                                });
                                              }}
                                              placeholder="https://..."
                                              className={`${inputBase} w-full py-1.5 text-xs`}
                                            />
                                            <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">{cor}</span>
                                          </div>
                                        );
                                      })()}
                                    </td>
                                    <td className="px-1 py-2 text-center text-[11px] text-neutral-400 dark:text-neutral-500 md:px-3 md:py-2.5 md:text-left md:text-sm">
                                      —
                                    </td>
                                    <td className="px-1 py-2 md:px-3">
                                      <div className="flex w-full min-w-0 overflow-hidden rounded border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800 md:max-w-[10rem]">
                                        <span className="shrink-0 border-r border-neutral-200 px-1.5 py-1 text-[10px] text-neutral-500 dark:border-neutral-600 md:px-2 md:py-1.5 md:text-xs">
                                          R$
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={custoPorCor[k] ?? ""}
                                          onChange={(e) => setCustoPorCor((p) => ({ ...p, [k]: e.target.value }))}
                                          className="min-w-0 flex-1 border-0 bg-transparent px-1.5 py-1 text-[11px] outline-none md:px-2 md:py-1.5 md:text-sm"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-1 py-2 pr-2 md:px-3 md:pr-4">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={estoquePorCor[k] ?? ""}
                                        onChange={(e) => setEstoquePorCor((p) => ({ ...p, [k]: e.target.value }))}
                                        className={`${inputBase} w-full min-w-0 max-w-[7rem] py-1.5 tabular-nums md:max-w-[6.5rem] md:py-2`}
                                      />
                                    </td>
                                  </tr>
                                );
                              })
                            : null}
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-4 border-t border-neutral-200 bg-neutral-100 p-4 dark:border-neutral-700 dark:bg-neutral-900/40 sm:p-5">
                      <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Outros dados (iguais para todas)</p>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data de lançamento</label>
                          <input
                            type="date"
                            value={dataLancamento}
                            onChange={(e) => setDataLancamento(e.target.value)}
                            className={`${inputBase} w-full py-2`}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Peso (kg)</label>
                          <input
                            type="text"
                            value={peso}
                            onChange={(e) => setPeso(e.target.value)}
                            placeholder="ex.: 0,25"
                            className={`${inputBase} w-full py-2`}
                          />
                        </div>
                        <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                          <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">Dimensões do pacote (cm)</p>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-500">Compr.</label>
                              <input type="text" value={comp} onChange={(e) => setComp(e.target.value)} placeholder="—" className={`${inputBase} w-full py-2`} />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-500">Larg.</label>
                              <input type="text" value={largura} onChange={(e) => setLargura(e.target.value)} placeholder="—" className={`${inputBase} w-full py-2`} />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-500">Alt.</label>
                              <input type="text" value={altura} onChange={(e) => setAltura(e.target.value)} placeholder="—" className={`${inputBase} w-full py-2`} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {tabAtiva === "qualidade" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-5 sm:p-5.5 space-y-3.5">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Qualidade do produto</h2>
                <div className="space-y-2.5">
                  {[
                    { label: "Não desbota?", value: naoDesbota, setter: setNaoDesbota },
                    { label: "Encolhe após lavagem?", value: encolhe, setter: setEncolhe },
                    { label: "Costura reforçada?", value: costuraReforcada, setter: setCosturaReforcada },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/40">
                      <p className="text-[12px] text-neutral-700 dark:text-neutral-300">{item.label}</p>
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => item.setter(true)} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${item.value === true ? "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200" : "border-neutral-200 bg-white text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>Sim</button>
                        <button type="button" onClick={() => item.setter(false)} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${item.value === false ? "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200" : "border-neutral-200 bg-white text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>Não</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">Observações de qualidade</label>
                  <textarea value={obsQualidade} onChange={(e) => setObsQualidade(e.target.value)} rows={3} className={`${inputDelicado} resize-none`} placeholder="Descreva pontos de acabamento e qualidade para o seller." />
                </div>
              </div>
            )}

            {tabAtiva === "midia" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-5 sm:p-5.5 space-y-4">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Mídia</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Imagem principal (obrigatória)</label>
                    <input type="url" value={midiaPrincipal} onChange={(e) => setMidiaPrincipal(e.target.value)} placeholder="https://..." className={inputDelicado} required />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Imagem frente</label>
                    <input type="url" value={midiaFrente} onChange={(e) => setMidiaFrente(e.target.value)} placeholder="https://..." className={inputDelicado} />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Imagem costas</label>
                    <input type="url" value={midiaCostas} onChange={(e) => setMidiaCostas(e.target.value)} placeholder="https://..." className={inputDelicado} />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Detalhe do tecido</label>
                    <input type="url" value={midiaDetalhe} onChange={(e) => setMidiaDetalhe(e.target.value)} placeholder="https://..." className={inputDelicado} />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Lifestyle (opcional)</label>
                    <input type="url" value={midiaLifestyle} onChange={(e) => setMidiaLifestyle(e.target.value)} placeholder="https://..." className={inputDelicado} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Link do Vídeo</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={linkVideo}
                      onChange={(e) => setLinkVideo(e.target.value)}
                      placeholder="URL do vídeo"
                      className={`${inputDelicado} flex-1`}
                    />
                    <button type="button" className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                      Visitar
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Link geral de fotos (legado)</label>
                  <input type="url" value={linkFotos} onChange={(e) => setLinkFotos(e.target.value)} placeholder="https://drive.google.com/..." className={inputDelicado} />
                </div>
              </div>
            )}

            {tabAtiva === "dados-guiados" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Dados guiados para anúncio</h2>
                <div>
                  <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">Diferencial principal *</label>
                  <textarea value={diferencial} onChange={(e) => setDiferencial(e.target.value)} rows={2} className={`${inputDelicado} resize-none`} required />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">Indicação de uso *</label>
                  <textarea value={indicacao} onChange={(e) => setIndicacao(e.target.value)} rows={2} className={`${inputDelicado} resize-none`} required />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">Observações para o seller</label>
                  <textarea value={observacoesSeller} onChange={(e) => setObservacoesSeller(e.target.value)} rows={2} className={`${inputDelicado} resize-none`} />
                </div>
              </div>
            )}

            {tabAtiva === "logistica" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-5 sm:p-5.5 space-y-4">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Fiscal e despacho</h2>
                <div className="space-y-2">
                  <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Modelo rápido (um clique)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS_FISCAL_DESPACHO.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => aplicarPresetFiscal(p)}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    NCM, CEST e CFOP são referências comuns para vestuário nacional — confira sempre com a sua contabilidade. O local de saída fica no bloco «Despacho / CD padrão» abaixo.
                  </p>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">NCM</label>
                    <input value={ncm} onChange={(e) => setNcm(e.target.value)} placeholder="Ex.: 6109.10.00" className={inputDelicado} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">CEST</label>
                    <input value={cest} onChange={(e) => setCest(e.target.value)} placeholder="Ex.: 28.038.00" className={inputDelicado} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">Origem do produto</label>
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {ATALHOS_ORIGEM_PRODUTO.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setOrigemProduto(a.valor)}
                          className={btnPillFiscalExtra}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                    <input value={origemProduto} onChange={(e) => setOrigemProduto(e.target.value)} placeholder="Ex.: Nacional" className={inputDelicado} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">CFOP</label>
                    <input value={cfop} onChange={(e) => setCfop(e.target.value)} placeholder="Ex.: 5102" className={inputDelicado} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">Unidade comercial</label>
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {ATALHOS_UNIDADE_COMERCIAL.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setUnidadeComercial(a.valor)}
                          className={btnPillFiscalExtra}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                    <input value={unidadeComercial} onChange={(e) => setUnidadeComercial(e.target.value)} placeholder="Ex.: UN" className={inputDelicado} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">Prazo de despacho / SLA</label>
                    <select value={slaEnvio} onChange={(e) => setSlaEnvio(e.target.value as "24h" | "48h" | "72h" | "")} className={inputDelicado}>
                      <option value="">Selecione</option>
                      <option value="24h">24h</option>
                      <option value="48h">48h</option>
                      <option value="72h">72h</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3 border-t border-neutral-200/80 pt-4 dark:border-neutral-700/60">
                  <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Despacho / CD padrão (opcional)</p>
                  <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                    Aqui fica o local de <strong className="text-neutral-800 dark:text-neutral-200">expedição</strong> deste produto (CD ou endereço de retirada). Se no{" "}
                    <Link href="/fornecedor/cadastro" className="font-medium text-neutral-900 underline-offset-2 hover:underline dark:text-neutral-100">
                      cadastro
                    </Link>{" "}
                    você já informou um <strong className="text-neutral-800 dark:text-neutral-200">despacho / CD padrão</strong>, pode reutilizar com um clique. Com{" "}
                    <strong className="text-neutral-800 dark:text-neutral-200">8 dígitos no CEP</strong> (ou 7 se faltar o zero no início), logradouro, bairro, cidade e UF preenchem automaticamente (ViaCEP).
                  </p>
                  <label className="flex cursor-pointer select-none items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={cdUsarDespachoCadastro}
                      onChange={(e) => setCdUsarDespachoCadastro(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-emerald-600 dark:border-neutral-600"
                    />
                    <span className="text-sm leading-snug text-neutral-800 dark:text-neutral-200">
                      Usar o endereço de despacho do meu cadastro (despacho / CD padrão)
                    </span>
                  </label>
                  {cdUsarDespachoCadastro && !perfilExpedicaoPreenchido && (
                    <p className={cn("text-[11px] leading-snug", AMBER_PREMIUM_TEXT_BODY)}>
                      Não há despacho cadastrado ainda. Preencha o bloco «Despacho / CD padrão» em{" "}
                      <Link href="/fornecedor/cadastro" className="font-medium underline-offset-2 hover:underline">
                        Cadastro
                      </Link>{" "}
                      ou informe o endereço abaixo (desmarque a opção acima).
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">CEP</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        disabled={cdUsarDespachoCadastro}
                        value={cdCep}
                        onChange={(e) => {
                          setCdUsarDespachoCadastro(false);
                          setCdCep(e.target.value.replace(/\D/g, "").slice(0, 8));
                        }}
                        placeholder="00000000"
                        className={`${inputDelicado} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                      {!cdUsarDespachoCadastro && (
                        <p className="mt-1 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                          {buscandoCepCd ? "A consultar CEP…" : "Com 8 dígitos (ou 7 se faltar o zero no início), preenche logradouro, bairro, cidade e UF (ViaCEP)."}
                        </p>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">Logradouro</label>
                      <input
                        type="text"
                        disabled={cdUsarDespachoCadastro}
                        value={cdLogradouro}
                        onChange={(e) => {
                          setCdUsarDespachoCadastro(false);
                          setCdLogradouro(upperBr(e.target.value));
                        }}
                        placeholder="RUA / AVENIDA"
                        className={`${inputDelicado} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">Número</label>
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={cdUsarDespachoCadastro}
                          onClick={() => {
                            setCdUsarDespachoCadastro(false);
                            setCdNumero("S/N");
                          }}
                          className={btnAtalhoNumeroCd}
                        >
                          S/N
                        </button>
                        <button
                          type="button"
                          disabled={cdUsarDespachoCadastro}
                          onClick={() => {
                            setCdUsarDespachoCadastro(false);
                            setCdNumero("SEM NUMERO");
                          }}
                          className={btnAtalhoNumeroCd}
                        >
                          Sem número
                        </button>
                      </div>
                      <input
                        type="text"
                        disabled={cdUsarDespachoCadastro}
                        value={cdNumero}
                        onChange={(e) => {
                          setCdUsarDespachoCadastro(false);
                          setCdNumero(upperBr(e.target.value));
                        }}
                        placeholder="Ex.: 123, S/N"
                        className={`${inputDelicado} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                      <p className="mt-1 text-[10px] leading-snug text-neutral-500 dark:text-neutral-400">
                        Sem número na fachada? Use os atalhos ou digite.
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">Complemento</label>
                      <input
                        type="text"
                        disabled={cdUsarDespachoCadastro}
                        value={cdComplemento}
                        onChange={(e) => {
                          setCdUsarDespachoCadastro(false);
                          setCdComplemento(upperBr(e.target.value));
                        }}
                        placeholder="SALA, BLOCO, ETC. (OPCIONAL)"
                        className={`${inputDelicado} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">Bairro</label>
                      <input
                        type="text"
                        disabled={cdUsarDespachoCadastro}
                        value={cdBairro}
                        onChange={(e) => {
                          setCdUsarDespachoCadastro(false);
                          setCdBairro(upperBr(e.target.value));
                        }}
                        placeholder="BAIRRO"
                        className={`${inputDelicado} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">Cidade</label>
                      <input
                        type="text"
                        disabled={cdUsarDespachoCadastro}
                        value={cdCidade}
                        onChange={(e) => {
                          setCdUsarDespachoCadastro(false);
                          setCdCidade(upperBr(e.target.value));
                        }}
                        placeholder="CIDADE"
                        className={`${inputDelicado} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-neutral-600 dark:text-neutral-400">UF</label>
                      <input
                        type="text"
                        disabled={cdUsarDespachoCadastro}
                        value={cdUf}
                        onChange={(e) => {
                          setCdUsarDespachoCadastro(false);
                          setCdUf(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2));
                        }}
                        placeholder="SP"
                        className={`${inputDelicado} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                    </div>
                  </div>
                  {cdLinhaFormatada ? (
                    <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">Resumo gravado no rascunho:</span> {cdLinhaFormatada}
                    </p>
                  ) : null}
                </div>
              </div>
            )}

            {/* Navegação entre passos — «Seguir» não envia; «Salvar produto» submete */}
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
              <p className="mb-4 text-xs leading-relaxed text-[var(--muted)] sm:text-[13px]">
                <strong className="text-[var(--foreground)]">Lembrete:</strong> «Seguir» e as abas só organizam a tela.{" "}
                <strong className="text-[var(--foreground)]">«Salvar rascunho»</strong> grava o anúncio na sua conta (e copia neste aparelho); em{" "}
                <Link href="/fornecedor/produtos" className="font-medium text-neutral-900 underline-offset-2 hover:underline dark:text-neutral-100">
                  Meus produtos
                </Link>{" "}
                aparece o atalho <strong className="text-[var(--foreground)]">Continuar rascunho</strong> junto de «+ Criar produto».{" "}
                <strong className="text-[var(--foreground)]">Só «Salvar produto»</strong> envia o catálogo ao servidor.
              </p>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <p className="order-2 text-center text-xs text-[var(--muted)] sm:order-1 sm:text-left">
                    <span className="font-medium text-[var(--foreground)]">Passo {indiceTab + 1}</span> de {TABS.length}
                    <span className="text-[var(--muted)]"> · {TABS[indiceTab]?.label}</span>
                  </p>
                  <div className="order-1 flex w-full gap-2 sm:order-2 sm:w-auto sm:justify-end">
                    <button type="button" onClick={() => irParaTab(-1)} disabled={indiceTab <= 0} className={btnPassoSec}>
                      ← Anterior
                    </button>
                    <button type="button" onClick={() => irParaTab(1)} disabled={indiceTab >= TABS.length - 1} className={btnSeguir}>
                      Seguir →
                    </button>
                  </div>
                </div>

                <div className="h-px bg-neutral-200/90 dark:bg-neutral-800" aria-hidden />

                <div className="hidden md:flex md:justify-end md:gap-2.5">
                  <button
                    type="button"
                    onClick={() => void salvarRascunho()}
                    disabled={formLoading || rascunhoSalvando}
                    className={`${btnRascunho} min-w-[10rem]`}
                  >
                    <span className="truncate">{rascunhoSalvando ? "Salvando..." : "Salvar rascunho"}</span>
                  </button>
                  <button type="submit" disabled={formLoading} className={`${btnSalvarProduto} min-w-[10rem]`}>
                    {formLoading ? "Salvando..." : modoEdicao ? "Salvar alterações" : "Salvar produto"}
                  </button>
                </div>

              </div>
            </div>
          </form>
        </div>

        {/* Abas: no mobile scroll horizontal no topo; no desktop coluna à direita */}
        <aside className="order-1 w-full shrink-0 md:order-2 md:w-52">
          <nav
            ref={tabsNavRef}
            className="flex flex-row gap-0 overflow-x-auto rounded-xl border border-[#e6eaf0] bg-[var(--card)] shadow-[0_8px_18px_-20px_rgba(15,23,42,0.4)] md:sticky md:top-28 md:flex-col md:overflow-visible dark:border-neutral-700"
            aria-label="Seções do formulário"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTabAtiva(tab.id)}
                className={`shrink-0 whitespace-nowrap px-3.5 py-2 text-left text-[13px] transition md:block md:w-full ${
                  tabAtiva === tab.id
                    ? "border-b-2 border-neutral-300 bg-neutral-100 font-medium text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 md:border-b-0 md:border-l-2"
                    : "border-b-2 border-transparent text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 md:border-b-0 md:border-l-2 md:border-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-[#e5e7eb] bg-white/95 px-4 py-2.5 shadow-[0_-6px_18px_-14px_rgba(15,23,42,0.35)] backdrop-blur md:hidden dark:border-neutral-700 dark:bg-[#0f141b]/95">
        <div className="dropcore-shell-4xl flex w-full gap-2">
          <button
            type="button"
            onClick={() => void salvarRascunho()}
            disabled={formLoading || rascunhoSalvando}
            className={`${btnRascunho} min-h-[38px] flex-1`}
          >
            {rascunhoSalvando ? "Salvando..." : "Salvar rascunho"}
          </button>
          <button type="submit" form="form-criar-variantes" disabled={formLoading} className={`${btnSalvarProduto} min-h-[38px] flex-1`}>
            {formLoading ? "Salvando..." : modoEdicao ? "Salvar alterações" : "Salvar produto"}
          </button>
        </div>
      </div>
      {pickerCampo && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/30" onClick={() => setPickerCampo(null)} />
          <div className="absolute left-1/2 top-1/2 w-[min(calc(100%-1.5rem),24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white px-4 pb-3 pt-3 shadow-[0_24px_48px_-24px_rgba(15,23,42,0.55)] dark:border-neutral-700 dark:bg-neutral-900">
            <div className="mb-2 h-1 w-12 rounded-full bg-neutral-300 dark:bg-neutral-700 mx-auto" />
            <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {pickerCampo === "caimento" && "Caimento"}
              {pickerCampo === "elasticidade" && "Elasticidade"}
              {pickerCampo === "transparencia" && "Transparência"}
              {pickerCampo === "clima" && "Clima ideal"}
              {pickerCampo === "posicionamento" && "Posicionamento"}
            </p>
            <div className="space-y-1.5">
              {(pickerCampo === "caimento" ? caimentoOptions : pickerCampo === "elasticidade" ? elasticidadeOptions : pickerCampo === "transparencia" ? transparenciaOptions : pickerCampo === "clima" ? climaOptions : posicionamentoOptions).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    if (pickerCampo === "caimento") setCaimento(o.value as "slim" | "regular" | "oversized");
                    if (pickerCampo === "elasticidade") setElasticidade(o.value as "baixa" | "media" | "alta");
                    if (pickerCampo === "transparencia") setTransparencia(o.value as "nao" | "leve" | "alta");
                    if (pickerCampo === "clima") setClima(o.value as "calor" | "frio" | "ambos");
                    if (pickerCampo === "posicionamento") setPosicionamento(o.value as "basico" | "intermediario" | "premium");
                    setPickerCampo(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-3 py-2.5 text-left text-sm text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {modalTopicosMedida && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-3">
          <button type="button" className="absolute inset-0 bg-black/30" onClick={() => setModalTopicosMedida(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_24px_48px_-24px_rgba(15,23,42,0.55)] dark:border-neutral-700 dark:bg-neutral-900">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Tópicos de medida</p>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">Selecione os tópicos que deseja usar na tabela.</p>
            <p className="mt-2 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[10px] leading-relaxed text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-400">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">Gancho (calça): </span>
              medida da cintura até o entrepernas na frente — a profundidade do gancho da costura. Em camisas, “manga” costuma ser a largura/abertura; use{" "}
              <span className="font-medium">Comprimento da manga</span> para o comprimento.
            </p>
            <div className="mt-3 flex max-h-52 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-[#edf1f5] bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900/40">
              {MEDIDAS_PREDEFINIDAS.map((topico) => (
                <button
                  key={`modal-${topico}`}
                  type="button"
                  onClick={() =>
                    setTopicosMedidaSelecionados((prev) => {
                      const next = new Set(prev);
                      if (next.has(topico)) next.delete(topico);
                      else next.add(topico);
                      return next;
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    topicosMedidaSelecionados.has(topico)
                      ? "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                      : "border-neutral-200 bg-white text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  }`}
                >
                  {topico}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <VarianteExtrasTagInput
                value={topicosMedidaCustom}
                onChange={setTopicosMedidaCustom}
                normalize="title"
                placeholder="Adicionar tópico personalizado e pressionar Enter (ex.: Tornozelo)"
                aria-label="Tópicos de medida personalizados"
                inputClassName="max-w-full"
              />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setModalTopicosMedida(false)}
                className="rounded-lg bg-[#2563eb] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
      <FornecedorNav active="produtos" />
      <NotificationToasts />
    </div>
  );
}
