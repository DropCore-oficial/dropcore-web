"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { FornecedorNav } from "../../FornecedorNav";
import { NotificationToasts } from "@/components/NotificationToasts";
import { toTitleCase } from "@/lib/formatText";
import { CORES_PREDEFINIDAS, TAMANHOS_PREDEFINIDOS } from "@/lib/fornecedorVariantesUi";
import { chaveEstoqueVariante } from "@/lib/estoqueVarianteKeys";

/** Ordem estável para listar tamanhos (PP… depois extras). */
function ordenarTamanhosLista(tams: string[]): string[] {
  const ordem = new Map(TAMANHOS_PREDEFINIDOS.map((t, i) => [t.toUpperCase(), i]));
  return [...tams].sort((a, b) => {
    const ia = ordem.get(a.toUpperCase()) ?? 999;
    const ib = ordem.get(b.toUpperCase()) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}
import { HelpBubble } from "@/components/HelpBubble";
import { VarianteExtrasTagInput } from "@/components/VarianteExtrasTagInput";

type TabId = "info-basica" | "info-variantes" | "lista-variantes" | "midia" | "info-impostos";

const TABS: { id: TabId; label: string }[] = [
  { id: "info-basica", label: "Info. Básica" },
  { id: "info-variantes", label: "Informações de Variantes" },
  { id: "lista-variantes", label: "Info. de Variantes" },
  { id: "midia", label: "Mídia" },
  { id: "info-impostos", label: "Info. de impostos" },
];

const inputBase = "w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500";

/** Alinhado ao resto do formulário (ex.: py-2.5 dos inputs e CTAs sky/azul). */
const btnRascunho =
  "inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 sm:px-4 sm:py-2.5";
const btnPassoSec =
  "inline-flex flex-1 items-center justify-center rounded-lg border border-neutral-300 bg-[var(--card)] px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-600 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-800 sm:flex-none sm:min-w-[8.5rem] sm:px-4 sm:py-2.5";
const btnSeguir =
  "inline-flex flex-1 items-center justify-center rounded-lg border border-blue-600 bg-blue-50/70 px-3 py-2 text-sm font-semibold text-blue-800 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-500 dark:bg-blue-950/25 dark:text-blue-200 dark:hover:bg-blue-950/40 sm:flex-none sm:min-w-[8.5rem] sm:px-4 sm:py-2.5";
const btnSalvarProduto =
  "inline-flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-55 dark:shadow-none sm:flex-none sm:px-5 sm:py-2.5";

/** Limite por ficheiro na lista de variações (data URL no JSON). */
const MAX_FOTO_COR_BYTES = 900 * 1024;

const LS_RASCUNHO_CRIAR_VARIANTES = "dropcore:fornecedor:criar-variantes:rascunho:v1";

type RascunhoCriarVariantesV1 = {
  v: 1;
  savedAt: string;
  tabAtiva: TabId;
  nomeProduto: string;
  descricao: string;
  marca: string;
  coresSelecionadas: string[];
  corCustom: string;
  tamanhosSelecionados: string[];
  tamanhoCustom: string;
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
};

export default function CriarVariantesPage() {
  const router = useRouter();
  const tabsNavRef = useRef<HTMLDivElement | null>(null);
  const [tabAtiva, setTabAtiva] = useState<TabId>("info-basica");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Info. Básica
  const [nomeProduto, setNomeProduto] = useState("");

  // Informações de Variantes
  const [descricao, setDescricao] = useState("");
  const [marca, setMarca] = useState("");
  const [coresSelecionadas, setCoresSelecionadas] = useState<Set<string>>(new Set());
  const [corCustom, setCorCustom] = useState("");
  const [tamanhosSelecionados, setTamanhosSelecionados] = useState<Set<string>>(new Set());
  const [tamanhoCustom, setTamanhoCustom] = useState("");

  // Info. de Variantes (bulk)
  const [dataLancamento, setDataLancamento] = useState("");
  /** Único custo em R$ por unidade — grava em `custo_base` (catálogo, seller e pedidos). */
  const [custoCompra, setCustoCompra] = useState("");
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
  const [bannerRascunho, setBannerRascunho] = useState<RascunhoCriarVariantesV1 | null>(null);
  const [msgRascunho, setMsgRascunho] = useState<string | null>(null);
  const [peso, setPeso] = useState("");
  const [helpVariantesOpen, setHelpVariantesOpen] = useState<null | "custoUnidade">(null);
  const [comp, setComp] = useState("");
  const [largura, setLargura] = useState("");
  const [altura, setAltura] = useState("");

  // Mídia
  const [linkFotos, setLinkFotos] = useState("");
  const [linkVideo, setLinkVideo] = useState("");

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

  function aoEscolherFicheiroFotoCor(cor: string, e: React.ChangeEvent<HTMLInputElement>) {
    setAvisoFoto(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvisoFoto("Use JPEG, PNG, WebP ou GIF.");
      return;
    }
    if (file.size > MAX_FOTO_COR_BYTES) {
      setAvisoFoto("Ficheiro demasiado grande (máx. ~900 KB). Coloque uma URL pública ou comprima a imagem.");
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
    return {
      v: 1,
      savedAt: new Date().toISOString(),
      tabAtiva,
      nomeProduto,
      descricao,
      marca,
      coresSelecionadas: [...coresSelecionadas],
      corCustom,
      tamanhosSelecionados: [...tamanhosSelecionados],
      tamanhoCustom,
      dataLancamento,
      custoCompra,
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
    };
  }

  function aplicarPayloadRascunho(p: RascunhoCriarVariantesV1) {
    const tabIds = new Set(TABS.map((t) => t.id));
    setTabAtiva(tabIds.has(p.tabAtiva) ? p.tabAtiva : "info-basica");
    setNomeProduto(p.nomeProduto ?? "");
    setDescricao(p.descricao ?? "");
    setMarca(p.marca ?? "");
    setCoresSelecionadas(new Set(p.coresSelecionadas ?? []));
    setCorCustom(p.corCustom ?? "");
    setTamanhosSelecionados(new Set(p.tamanhosSelecionados ?? []));
    setTamanhoCustom(p.tamanhoCustom ?? "");
    setDataLancamento(p.dataLancamento ?? "");
    setCustoCompra(p.custoCompra ?? "");
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
  }

  function salvarRascunho() {
    const payload = construirRascunho();
    const gravar = (data: RascunhoCriarVariantesV1) => {
      localStorage.setItem(LS_RASCUNHO_CRIAR_VARIANTES, JSON.stringify(data));
    };
    try {
      gravar(payload);
      setBannerRascunho(null);
      setMsgRascunho("Rascunho guardado neste dispositivo. Ao voltar a esta página, podes continuar de onde paraste.");
    } catch (e) {
      const isQuota =
        (e instanceof Error && e.name === "QuotaExceededError") ||
        (typeof e === "object" && e !== null && (e as { code?: number }).code === 22);
      if (isQuota) {
        const fotoSóHttp: Record<string, string> = {};
        for (const [k, v] of Object.entries(payload.fotoUrlPorCor ?? {})) {
          if (typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"))) fotoSóHttp[k] = v;
        }
        try {
          gravar({ ...payload, fotoUrlPorCor: fotoSóHttp });
          setMsgRascunho(
            "Rascunho guardado sem fotos carregadas do disco (limite do navegador). As URLs de imagem foram mantidas."
          );
        } catch {
          setMsgRascunho("Não foi possível guardar o rascunho (armazenamento cheio).");
        }
      } else {
        setMsgRascunho("Não foi possível guardar o rascunho.");
      }
    }
    window.setTimeout(() => setMsgRascunho(null), 9000);
  }

  function continuarDeRascunho(p: RascunhoCriarVariantesV1) {
    aplicarPayloadRascunho(p);
    setBannerRascunho(null);
    try {
      localStorage.setItem(
        LS_RASCUNHO_CRIAR_VARIANTES,
        JSON.stringify({ ...p, savedAt: new Date().toISOString() })
      );
    } catch {
      /* ignore */
    }
    setMsgRascunho(
      "Rascunho recuperado. Revisa os dados; usa «Salvar rascunho» de novo se alterares muito o anúncio. «Salvar produto» envia ao servidor."
    );
    window.setTimeout(() => setMsgRascunho(null), 10000);
    window.setTimeout(() => tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
  }

  function descartarRascunhoGuardado() {
    try {
      localStorage.removeItem(LS_RASCUNHO_CRIAR_VARIANTES);
    } catch {
      /* ignore */
    }
    setBannerRascunho(null);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_RASCUNHO_CRIAR_VARIANTES);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || (parsed as RascunhoCriarVariantesV1).v !== 1) return;
      setBannerRascunho(parsed as RascunhoCriarVariantesV1);
    } catch {
      /* ignore */
    }
  }, []);

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
        "Falta escolher variante: marque pelo menos uma cor ou um tamanho na aba «Informações de Variantes» (deslize as abas no telemóvel se não as vir todas)."
      );
      setTabAtiva("info-variantes");
      window.setTimeout(() => {
        tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
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
      const body: Record<string, unknown> = {
        nome_produto: nomeProduto.trim(),
        cores,
        tamanhos,
        link_fotos: linkFotos.trim() || null,
        descricao: descricao.trim() || null,
        marca: marca.trim() || null,
        comprimento_cm: comp.trim() ? parseFloat(comp.replace(",", ".")) : undefined,
        largura_cm: largura.trim() ? parseFloat(largura.replace(",", ".")) : undefined,
        altura_cm: altura.trim() ? parseFloat(altura.replace(",", ".")) : undefined,
        peso_kg: peso.trim() ? parseFloat(peso.replace(",", ".")) : undefined,
        custo_base: custoCompra.trim() ? parseFloat(custoCompra.replace(",", ".")) : undefined,
        data_lancamento: dataLancamento || null,
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

      const fallbackCustoNum = custoCompra.trim() ? parseFloat(custoCompra.replace(",", ".")) : NaN;
      const fallbackCusto = Number.isFinite(fallbackCustoNum) ? Math.round(fallbackCustoNum * 100) / 100 : null;
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
      try {
        localStorage.removeItem(LS_RASCUNHO_CRIAR_VARIANTES);
      } catch {
        /* ignore */
      }
      router.push("/fornecedor/produtos");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao criar variantes.");
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div className="min-h-screen min-w-0 bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      {/*
        Barra do formulário: sticky só no mobile (abaixo do MobileAppBar).
        No desktop, fixed + sticky empilhados costumam causar “travamento”/cliques estranhos no topo — aqui fica estática; use «Salvar» no fim do formulário.
      */}
      <div className="sticky top-[calc(3rem+env(safe-area-inset-top,0px))] z-20 border-b border-[var(--card-border)] bg-[var(--card)] shadow-sm md:static md:top-auto md:z-auto md:shadow-none">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
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
              Criar variantes
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <button type="button" onClick={salvarRascunho} disabled={formLoading} className={`${btnRascunho} max-w-[9.5rem] truncate px-2.5 text-[11px] sm:max-w-none sm:px-4 sm:text-sm`}>
              Salvar rascunho
            </button>
            <button
              type="submit"
              form="form-criar-variantes"
              disabled={formLoading}
              className="relative z-10 inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-55 sm:px-4 sm:text-sm sm:py-2.5"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-w-0 max-w-5xl flex-col gap-4 overflow-x-hidden px-4 py-4 sm:px-6 md:flex-row md:gap-6">
        {/* Conteúdo principal */}
        <div className="min-w-0 flex-1 order-2 md:order-1">
          <form id="form-criar-variantes" onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
                {formError}
              </div>
            )}

            {bannerRascunho && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100">
                <p className="font-medium">Rascunho encontrado neste dispositivo</p>
                <p className="mt-1 text-xs text-blue-800/90 dark:text-blue-200/90">
                  Guardado em {new Date(bannerRascunho.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. Podes
                  continuar o anúncio ou descartar.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => continuarDeRascunho(bannerRascunho)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Continuar rascunho
                  </button>
                  <button
                    type="button"
                    onClick={descartarRascunhoGuardado}
                    className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {msgRascunho && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                {msgRascunho}
              </div>
            )}

            {tabAtiva === "info-basica" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Informação Básica</h2>
                <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
                  <p className="font-medium">Antes de salvar</p>
                  <p className="mt-1 text-sky-800/90 dark:text-sky-200/90">
                    É obrigatório escolher <strong>pelo menos uma cor ou um tamanho</strong>. Use as abas acima (no telemóvel, deslize para a direita) e abra{" "}
                    <strong>Informações de Variantes</strong> para marcar as opções.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTabAtiva("info-variantes");
                      window.setTimeout(() => tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                    }}
                    className="mt-3 w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 sm:w-auto"
                  >
                    Ir para cores e tamanhos →
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
                </div>
              </div>
            )}

            {tabAtiva === "info-variantes" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6 space-y-6">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Informações de Variantes</h2>

                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Descrição</label>
                  <textarea
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    onBlur={() => setDescricao(toTitleCase(descricao))}
                    placeholder="Descrição do produto para anúncios"
                    rows={4}
                    maxLength={1000}
                    className={`${inputBase} resize-none`}
                  />
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">{descricao.length}/1000</p>
                </div>

                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Marca</label>
                  <input
                    type="text"
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                    onBlur={() => setMarca(toTitleCase(marca))}
                    placeholder="Marca do produto"
                    maxLength={100}
                    className={inputBase}
                  />
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">{marca.length}/100</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs text-neutral-600 dark:text-neutral-400">Variantes</label>
                    <span className="text-xs text-blue-600 dark:text-blue-400">+ Adicionar Variantes</span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Cor</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">
                        Para <strong>personalizar um nome de lista</strong> (ex.: Verde → Verde militar), clique no nome da cor — ele vai para o campo abaixo para você editar.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {CORES_PREDEFINIDAS.map((cor) => (
                          <div
                            key={cor}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                          >
                            <input
                              id={`criar-pref-cor-${cor}`}
                              type="checkbox"
                              checked={coresSelecionadas.has(cor)}
                              onChange={() => toggleCor(cor)}
                              className="rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                moverCorParaCampoExtras(cor);
                              }}
                              className="text-sm text-neutral-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2 cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
                              title="Levar ao campo abaixo para editar o nome"
                            >
                              {cor}
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <VarianteExtrasTagInput
                          value={corCustom}
                          onChange={setCorCustom}
                          normalize="title"
                          placeholder="Ex.: Azul Royal"
                          aria-label="Cores extras ou personalizadas"
                          inputClassName="max-w-xl"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Tamanho</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2">
                        Clique no rótulo do tamanho para levar ao campo e personalizar.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {TAMANHOS_PREDEFINIDOS.map((tam) => (
                          <div
                            key={tam}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                          >
                            <input
                              id={`criar-pref-tam-${tam}`}
                              type="checkbox"
                              checked={tamanhosSelecionados.has(tam)}
                              onChange={() => toggleTamanho(tam)}
                              className="rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                moverTamanhoParaCampoExtras(tam);
                              }}
                              className="text-sm text-neutral-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted underline-offset-2 cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
                              title="Levar ao campo abaixo para editar"
                            >
                              {tam}
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <VarianteExtrasTagInput
                          value={tamanhoCustom}
                          onChange={setTamanhoCustom}
                          normalize="upper"
                          placeholder="Ex.: 42"
                          aria-label="Tamanhos extras ou personalizados"
                          inputClassName="max-w-xl"
                        />
                      </div>
                    </div>
                  </div>

                  {combinacoes.length > 0 && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">
                      Lista de Variantes ({combinacoes.length})
                    </p>
                  )}
                </div>
              </div>
            )}

            {tabAtiva === "lista-variantes" && (
              <div className="min-w-0 rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-[var(--card)]">
                <div className="border-b border-neutral-200 bg-[#fafafa] px-4 py-4 dark:border-neutral-700 dark:bg-neutral-900/60 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Lista de variações</h2>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        Deslize a tabela na horizontal se precisar de mais espaço. Foto por cor grava em{" "}
                        <strong className="text-neutral-700 dark:text-neutral-300">imagem_url</strong> em todas as variantes dessa cor. Os SKUs das variantes são
                        gerados ao salvar o produto.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {combinacoes.length} variante{combinacoes.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setTabAtiva("info-variantes");
                          window.setTimeout(() => tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                        }}
                        className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      >
                        Ajustar cores / tamanhos
                      </button>
                    </div>
                  </div>
                </div>

                {combinacoes.length === 0 ? (
                  <div className="px-4 py-12 text-center sm:px-6">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Selecione cores e tamanhos em <strong>Informações de Variantes</strong> para ver a lista aqui.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="border-b border-neutral-200 bg-[#fafafa] px-4 py-4 dark:border-neutral-700 dark:bg-neutral-900/50 sm:px-5">
                      <p className="mb-3 text-xs font-semibold text-neutral-800 dark:text-neutral-200">Preencher em massa</p>
                      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="min-w-0 sm:max-w-[11rem] sm:flex-1">
                          <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                            Preço (R$) <span className="text-blue-600 dark:text-blue-400">*</span>
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
                            Estoque <span className="text-blue-600 dark:text-blue-400">*</span>
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={massaEstoque}
                            onChange={(e) => setMassaEstoque(e.target.value)}
                            placeholder="0"
                            className={`${inputBase} w-full py-2 tabular-nums`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={aplicarMassaTodos}
                          className="col-span-2 min-h-[44px] rounded-lg border border-blue-600 bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:border-blue-700 hover:bg-blue-700 active:opacity-95 sm:col-span-1 sm:min-h-0 sm:py-2"
                        >
                          Aplicar a todos
                        </button>
                      </div>
                      {avisoFoto && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" role="status">
                          {avisoFoto}
                        </p>
                      )}
                    </div>

                    <div className="dropcore-scroll-x -mx-4 max-h-[min(52dvh,24rem)] min-w-0 overflow-y-auto border-t border-neutral-100 dark:border-neutral-800 sm:mx-0 sm:max-h-[min(60vh,28rem)]">
                      <table className="w-full min-w-[30rem] border-collapse text-xs md:min-w-[44rem] md:text-sm">
                        <thead className="sticky top-0 z-20 shadow-sm">
                          <tr className="border-b border-neutral-200 bg-[#fafafa] text-left text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                            <th className="min-w-[11.25rem] px-2 py-2 pl-4 md:w-[12.5rem] md:min-w-[12rem] md:px-3 md:py-3 md:pl-4">Cor / foto</th>
                            <th className="whitespace-nowrap px-2 py-2 md:px-3 md:py-3">Tamanho</th>
                            <th className="min-w-[7.5rem] px-2 py-2 md:min-w-[9rem] md:px-3 md:py-3">
                              Preço (R$) <span className="text-blue-600 dark:text-blue-400">*</span>
                            </th>
                            <th className="min-w-[5.25rem] px-2 py-2 pr-4 md:min-w-[7rem] md:px-3 md:py-3 md:pr-4">
                              Estoque <span className="text-blue-600 dark:text-blue-400">*</span>
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
                                            ? "bg-neutral-50/95 dark:bg-neutral-900/50"
                                            : "align-middle bg-white py-1 dark:bg-neutral-900/25"
                                        }`}
                                      >
                                        {idx === 0 ? (
                                          <div className="flex min-w-0 w-full max-w-full flex-row items-start gap-1.5 md:max-w-[15.5rem] md:gap-2">
                                            <div className="flex shrink-0 flex-col items-start gap-0.5">
                                              <label className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-neutral-300 bg-white hover:border-blue-500 hover:bg-blue-50/40 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:border-blue-500 md:h-12 md:w-12">
                                                <input
                                                  id={`foto-cor-${ck}`}
                                                  type="file"
                                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                                  className="sr-only"
                                                  onChange={(e) => aoEscolherFicheiroFotoCor(cor, e)}
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
                                                placeholder="https://… (opcional)"
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
                                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-dashed border-neutral-200 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 md:h-8 md:w-8">
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
                                              <label className="relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800">
                                                <input
                                                  id={`foto-cor-${ck}`}
                                                  type="file"
                                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                                  className="sr-only"
                                                  onChange={(e) => aoEscolherFicheiroFotoCor(cor, e)}
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
                                              placeholder="https://…"
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

                    <div className="space-y-4 border-t border-neutral-200 bg-[#fafafa] p-4 dark:border-neutral-700 dark:bg-neutral-900/40 sm:p-5">
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
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Custo de referência (R$)</span>
                            <HelpBubble
                              open={helpVariantesOpen === "custoUnidade"}
                              onOpen={() => setHelpVariantesOpen("custoUnidade")}
                              onClose={() => setHelpVariantesOpen(null)}
                              ariaLabel="Ajuda: custo de referência"
                            >
                              Valor usado nas células de <strong>preço</strong> vazias e no envio à API como fallback.
                            </HelpBubble>
                          </div>
                          <input
                            type="text"
                            value={custoCompra}
                            onChange={(e) => setCustoCompra(e.target.value)}
                            placeholder="ex.: 30,00"
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
            {tabAtiva === "midia" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6 space-y-6">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Mídia</h2>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Imagens do Anúncio</label>
                  <input
                    type="url"
                    value={linkFotos}
                    onChange={(e) => setLinkFotos(e.target.value)}
                    placeholder="https://drive.google.com/... ou link do Dropbox"
                    className={inputBase}
                  />
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">+ Adicionar Imagens — Apenas JPG, JPEG, PNG com no máx. 2MB</p>
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Link do Vídeo</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={linkVideo}
                      onChange={(e) => setLinkVideo(e.target.value)}
                      placeholder="URL do vídeo"
                      className={`${inputBase} flex-1`}
                    />
                    <button type="button" className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800">
                      Visitar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tabAtiva === "info-impostos" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Info. de impostos e despacho</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  Neste assistente ainda <strong className="text-neutral-800 dark:text-neutral-200">não</strong> pões NCM, origem, CEST nem o CD de saída — isso fica noutros sítios do painel (já funcionam).
                </p>
                <ul className="text-sm text-neutral-600 dark:text-neutral-400 list-disc pl-5 space-y-2 leading-relaxed">
                  <li>
                    <strong className="text-neutral-800 dark:text-neutral-200">CD / de onde sai o envio (padrão da empresa):</strong>{" "}
                    <Link href="/fornecedor/cadastro" className="text-blue-600 dark:text-blue-400 font-medium underline-offset-2 hover:underline">
                      Cadastro
                    </Link>
                    , campo «Despacho / CD padrão». Para uma variante diferente do padrão: em{" "}
                    <Link href="/fornecedor/produtos" className="text-blue-600 dark:text-blue-400 font-medium underline-offset-2 hover:underline">
                      Produtos
                    </Link>{" "}
                    edita o SKU e usa «Despacho / CD desta variante».
                  </li>
                  <li>
                    <strong className="text-neutral-800 dark:text-neutral-200">Dados fiscais (NCM, origem, CEST, CFOP, pesos):</strong> depois de criares o produto, abre o grupo em{" "}
                    <Link href="/fornecedor/produtos" className="text-blue-600 dark:text-blue-400 font-medium underline-offset-2 hover:underline">
                      Produtos
                    </Link>{" "}
                    → <strong className="text-neutral-800 dark:text-neutral-200">Editar</strong> → separador <strong className="text-neutral-800 dark:text-neutral-200">Info. de impostos</strong> (formulário completo).
                  </li>
                </ul>
              </div>
            )}

            {/* Navegação entre passos — «Seguir» não envia; «Salvar produto» submete */}
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
              <p className="mb-4 text-xs leading-relaxed text-[var(--muted)] sm:text-[13px]">
                <strong className="text-[var(--foreground)]">Lembrete:</strong> «Seguir» e as abas só organizam o ecrã.{" "}
                <strong className="text-[var(--foreground)]">«Salvar rascunho»</strong> guarda o anúncio neste aparelho (local) para continuares mais tarde.{" "}
                <strong className="text-[var(--foreground)]">Só «Salvar produto»</strong> envia ao servidor.
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

                <div className="flex gap-2 sm:justify-end sm:gap-2.5">
                  <button type="button" onClick={salvarRascunho} disabled={formLoading} className={`${btnRascunho} min-w-0 flex-1 sm:flex-none`}>
                    <span className="truncate">Salvar rascunho</span>
                  </button>
                  <button type="submit" disabled={formLoading} className={btnSalvarProduto}>
                    {formLoading ? "Salvando…" : "Salvar produto"}
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
            className="flex flex-row gap-0 overflow-x-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm md:sticky md:top-28 md:flex-col md:overflow-visible"
            aria-label="Secções do formulário"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTabAtiva(tab.id)}
                className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-left text-sm transition md:block md:w-full ${
                  tabAtiva === tab.id
                    ? "border-b-2 border-blue-600 bg-blue-50 font-medium text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300 md:border-b-0 md:border-l-2"
                    : "border-b-2 border-transparent text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 md:border-b-0 md:border-l-2 md:border-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>
      </div>
      <FornecedorNav active="produtos" />
      <NotificationToasts />
    </div>
  );
}
