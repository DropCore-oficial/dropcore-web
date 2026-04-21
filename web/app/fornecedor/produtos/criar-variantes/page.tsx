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

type ModoEstoque = "matriz" | "por_tamanho" | "por_cor";

type TabId = "info-basica" | "info-variantes" | "lista-variantes" | "midia" | "info-impostos";

const TABS: { id: TabId; label: string }[] = [
  { id: "info-basica", label: "Info. Básica" },
  { id: "info-variantes", label: "Informações de Variantes" },
  { id: "lista-variantes", label: "Info. de Variantes" },
  { id: "midia", label: "Mídia" },
  { id: "info-impostos", label: "Info. de impostos" },
];

const inputBase = "w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500";

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
  const [precoVarejo, setPrecoVarejo] = useState("");
  const [custoCompra, setCustoCompra] = useState("");
  const [estoqueInicial, setEstoqueInicial] = useState("");
  /** Quando há tamanhos (modo «por tamanho»): mesmo número para todas as cores daquele tamanho. Chave = tamanho em maiúsculas. */
  const [estoquePorTamanho, setEstoquePorTamanho] = useState<Record<string, string>>({});
  /** Cor × tamanho: uma quantidade por célula (modo «matriz»). Chave = `corLower|tamUpper`. */
  const [estoqueMatriz, setEstoqueMatriz] = useState<Record<string, string>>({});
  /** Mesmo estoque em todos os tamanhos daquela cor (modo «por cor»). Chave = cor em minúsculas. */
  const [estoquePorCor, setEstoquePorCor] = useState<Record<string, string>>({});
  const [modoEstoque, setModoEstoque] = useState<ModoEstoque>("matriz");
  const [peso, setPeso] = useState("");
  const [helpVariantesOpen, setHelpVariantesOpen] = useState<null | "precoVarejo" | "custoCompra">(null);
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

  function parseQty(s: string): number | null {
    const raw = s.trim();
    if (!raw) return null;
    const n = parseFloat(raw.replace(",", "."));
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
  }

  /** Pré-visualização do estoque que cada linha terá ao salvar (alinhada à API). */
  function estoquePreviewParaLinha(cor: string, tamanho: string): number | null {
    const hasC = cor.trim().length > 0;
    const hasT = tamanho.trim().length > 0;
    if (coresFinais.length > 0 && tamanhosFinais.length > 0) {
      if (modoEstoque === "matriz") {
        const k = chaveEstoqueVariante(cor, tamanho);
        return parseQty(estoqueMatriz[k] ?? "");
      }
      if (modoEstoque === "por_cor") {
        return parseQty(estoquePorCor[cor.trim().toLowerCase()] ?? "");
      }
      return parseQty(estoquePorTamanho[tamanho.trim().toUpperCase()] ?? "");
    }
    if (hasC && !hasT) return parseQty(estoqueInicial);
    if (!hasC && hasT) return parseQty(estoquePorTamanho[tamanho.trim().toUpperCase()] ?? "");
    return parseQty(estoqueInicial);
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
        if (modoEstoque === "matriz") {
          const por: Record<string, number> = {};
          for (const cor of cores) {
            for (const tam of tamanhos) {
              const k = chaveEstoqueVariante(cor, tam);
              const q = parseQty(estoqueMatriz[k] ?? "");
              por[k] = q ?? 0;
            }
          }
          body.estoque_por_variante = por;
        } else if (modoEstoque === "por_cor") {
          const por: Record<string, number> = {};
          for (const cor of cores) {
            const k = cor.trim().toLowerCase();
            const q = parseQty(estoquePorCor[k] ?? "");
            por[k] = q ?? 0;
          }
          body.estoque_por_cor = por;
        } else {
          const por: Record<string, number> = {};
          for (const tam of tamanhos) {
            const k = tam.toUpperCase();
            const q = parseQty(estoquePorTamanho[k] ?? "");
            if (q != null) por[k] = q;
          }
          body.estoque_por_tamanho = por;
        }
      } else if (tamanhos.length > 0) {
        const por: Record<string, number> = {};
        for (const tam of tamanhos) {
          const k = tam.toUpperCase();
          const q = parseQty(estoquePorTamanho[k] ?? "");
          if (q != null) por[k] = q;
        }
        body.estoque_por_tamanho = por;
      } else {
        const q = parseQty(estoqueInicial);
        if (q != null) body.estoque_atual = q;
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
          <button
            type="submit"
            form="form-criar-variantes"
            disabled={formLoading}
            className="relative z-10 shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            Salvar
          </button>
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
              <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
                <div className="border-b border-[var(--card-border)] bg-gradient-to-r from-emerald-50/80 to-transparent px-4 py-4 dark:from-emerald-950/25 dark:to-transparent sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Lista de variantes</h2>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        Pré-visualização do que será criado — SKUs gerados ao salvar.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                        {combinacoes.length} variante{combinacoes.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setTabAtiva("info-variantes");
                          window.setTimeout(() => tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
                        }}
                        className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
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
                    <div className="hidden md:block">
                      <div className="max-h-[min(28rem,55vh)] overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 z-10 bg-neutral-100/95 dark:bg-neutral-900/95 backdrop-blur-sm">
                            <tr className="border-b border-neutral-200 text-left text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
                              <th className="px-4 py-3 font-medium">#</th>
                              <th className="px-4 py-3 font-medium">Cor</th>
                              <th className="px-4 py-3 font-medium">Tamanho</th>
                              <th className="px-4 py-3 font-medium text-right">Estq.</th>
                              <th className="px-4 py-3 font-medium">SKU</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {combinacoes.map((c, i) => {
                              const eq = estoquePreviewParaLinha(c.cor, c.tamanho);
                              return (
                                <tr key={i} className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40">
                                  <td className="px-4 py-2.5 tabular-nums text-neutral-400 dark:text-neutral-500">{i + 1}</td>
                                  <td className="px-4 py-2.5 font-medium text-neutral-800 dark:text-neutral-200">{c.cor || "—"}</td>
                                  <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">{c.tamanho || "—"}</td>
                                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                                    {eq != null ? eq : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-neutral-400 dark:text-neutral-500">Automático ao salvar</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto p-3 md:hidden">
                      {combinacoes.map((c, i) => {
                        const eq = estoquePreviewParaLinha(c.cor, c.tamanho);
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900/80"
                          >
                            <span className="text-xs text-neutral-400 tabular-nums">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                {[c.cor, c.tamanho].filter(Boolean).join(" · ") || "—"}
                              </p>
                              <p className="text-[11px] text-neutral-400">
                                Estq. {eq != null ? eq : "—"} · SKU automático
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {combinacoes.length > 0 && (
                  <div className="space-y-4 border-t border-[var(--card-border)] bg-neutral-50/70 p-4 dark:bg-neutral-900/40 sm:p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Editar em massa</h3>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Preço, custo, peso e dimensões valem para todas as variantes.{" "}
                        {tamanhosFinais.length > 0 && coresFinais.length > 0 ? (
                          <>
                            Defina o <strong>estoque</strong> por combinação <strong>cor × tamanho</strong>, só por{" "}
                            <strong>tamanho</strong> ou só por <strong>cor</strong> — escolha abaixo.
                          </>
                        ) : tamanhosFinais.length > 0 ? (
                          <>O estoque é por <strong>tamanho</strong> (cada numeração).</>
                        ) : (
                          <>O estoque inicial aplica-se a cada variante de cor.</>
                        )}
                      </p>
                    </div>
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
                          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Preço varejo (R$)</span>
                          <HelpBubble
                            open={helpVariantesOpen === "precoVarejo"}
                            onOpen={() => setHelpVariantesOpen("precoVarejo")}
                            onClose={() => setHelpVariantesOpen(null)}
                            ariaLabel="Ajuda: preço varejo"
                          >
                            Preço de referência de venda ao público (preço de loja). Aparece no catálogo e ajuda a entender a margem face ao custo.
                          </HelpBubble>
                        </div>
                        <input
                          type="text"
                          value={precoVarejo}
                          onChange={(e) => setPrecoVarejo(e.target.value)}
                          placeholder="0,00"
                          className={`${inputBase} w-full py-2`}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Custo de compra (R$)</span>
                          <HelpBubble
                            open={helpVariantesOpen === "custoCompra"}
                            onOpen={() => setHelpVariantesOpen("custoCompra")}
                            onClose={() => setHelpVariantesOpen(null)}
                            ariaLabel="Ajuda: custo de compra"
                          >
                            Quanto você paga para fabricar ou adquirir cada unidade (seu custo), antes de margens e taxas da plataforma.
                          </HelpBubble>
                        </div>
                        <input
                          type="text"
                          value={custoCompra}
                          onChange={(e) => setCustoCompra(e.target.value)}
                          placeholder="0,00"
                          className={`${inputBase} w-full py-2`}
                        />
                      </div>
                      {tamanhosFinais.length > 0 && coresFinais.length > 0 ? (
                        <div className="min-w-0 sm:col-span-2 lg:col-span-3 space-y-3">
                          <div>
                            <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">Estoque inicial</p>
                            <div className="flex flex-wrap gap-2" role="group" aria-label="Modo de estoque">
                              {(
                                [
                                  ["matriz", "Cor × tamanho (matriz)"],
                                  ["por_tamanho", "Só por tamanho"],
                                  ["por_cor", "Só por cor"],
                                ] as const
                              ).map(([id, label]) => (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => setModoEstoque(id)}
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                    modoEstoque === id
                                      ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600"
                                      : "border-[var(--card-border)] bg-[var(--background)] text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                              {modoEstoque === "matriz" && (
                                <>
                                  Uma quantidade por <strong>célula</strong> (cada SKU cor + numeração). Ideal quando o stock difere por cor e tamanho.
                                </>
                              )}
                              {modoEstoque === "por_tamanho" && (
                                <>
                                  Um número por <strong>tamanho</strong> — repete em <strong>todas</strong> as cores daquele tamanho (comportamento anterior).
                                </>
                              )}
                              {modoEstoque === "por_cor" && (
                                <>
                                  Um número por <strong>cor</strong> — o mesmo em <strong>todos</strong> os tamanhos dessa cor.
                                </>
                              )}
                            </p>
                          </div>
                          {modoEstoque === "matriz" && (
                            <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
                              <table className="w-full min-w-[16rem] border-collapse text-xs">
                                <thead>
                                  <tr className="border-b border-[var(--card-border)] bg-neutral-100/80 dark:bg-neutral-800/50">
                                    <th className="sticky left-0 z-[1] border-r border-[var(--card-border)] bg-neutral-100/95 px-2 py-2 text-left font-medium text-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-200">
                                      Cor
                                    </th>
                                    {tamanhosOrdenados.map((tam) => (
                                      <th key={tam} className="px-2 py-2 text-center font-medium text-neutral-700 dark:text-neutral-300">
                                        {tam}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {coresFinais.map((cor) => (
                                    <tr key={cor} className="border-b border-neutral-100 dark:border-neutral-800">
                                      <td className="sticky left-0 z-[1] border-r border-[var(--card-border)] bg-[var(--card)] px-2 py-1.5 font-medium text-neutral-800 dark:text-neutral-100">
                                        {cor}
                                      </td>
                                      {tamanhosOrdenados.map((tam) => {
                                        const key = chaveEstoqueVariante(cor, tam);
                                        return (
                                          <td key={key} className="p-1">
                                            <input
                                              type="text"
                                              inputMode="numeric"
                                              value={estoqueMatriz[key] ?? ""}
                                              onChange={(e) =>
                                                setEstoqueMatriz((prev) => ({ ...prev, [key]: e.target.value }))
                                              }
                                              placeholder="0"
                                              className={`${inputBase} w-full min-w-[3.25rem] py-1.5 tabular-nums text-center text-xs`}
                                              aria-label={`Estoque ${cor} ${tam}`}
                                            />
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {modoEstoque === "por_tamanho" && (
                            <div>
                              <p className="mb-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                                Cada tamanho abaixo aplica-se a todas as cores nesse tamanho.
                              </p>
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                                {tamanhosOrdenados.map((tam) => {
                                  const k = tam.toUpperCase();
                                  return (
                                    <div key={k}>
                                      <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">{tam}</label>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={estoquePorTamanho[k] ?? ""}
                                        onChange={(e) =>
                                          setEstoquePorTamanho((prev) => ({ ...prev, [k]: e.target.value }))
                                        }
                                        placeholder="0"
                                        className={`${inputBase} w-full py-2 tabular-nums`}
                                        aria-label={`Estoque tamanho ${tam}`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {modoEstoque === "por_cor" && (
                            <div>
                              <p className="mb-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                                Cada cor abaixo repete o mesmo estoque em todos os tamanhos.
                              </p>
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                                {coresFinais.map((cor) => {
                                  const k = cor.trim().toLowerCase();
                                  return (
                                    <div key={cor}>
                                      <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">{cor}</label>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={estoquePorCor[k] ?? ""}
                                        onChange={(e) =>
                                          setEstoquePorCor((prev) => ({ ...prev, [k]: e.target.value }))
                                        }
                                        placeholder="0"
                                        className={`${inputBase} w-full py-2 tabular-nums`}
                                        aria-label={`Estoque cor ${cor}`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : tamanhosFinais.length > 0 ? (
                        <div className="min-w-0 sm:col-span-2 lg:col-span-3">
                          <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">Estoque inicial por tamanho</p>
                          <p className="mb-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                            Cada numeração tem a sua quantidade (sem combinação com cor).
                          </p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                            {tamanhosOrdenados.map((tam) => {
                              const k = tam.toUpperCase();
                              return (
                                <div key={k}>
                                  <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">{tam}</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={estoquePorTamanho[k] ?? ""}
                                    onChange={(e) =>
                                      setEstoquePorTamanho((prev) => ({ ...prev, [k]: e.target.value }))
                                    }
                                    placeholder="0"
                                    className={`${inputBase} w-full py-2 tabular-nums`}
                                    aria-label={`Estoque tamanho ${tam}`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Estoque inicial (por variante)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={estoqueInicial}
                            onChange={(e) => setEstoqueInicial(e.target.value)}
                            placeholder="0"
                            className={`${inputBase} w-full py-2 tabular-nums`}
                          />
                          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                            Cada cor listada acima recebe esta quantidade.
                          </p>
                        </div>
                      )}
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
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Info. de impostos</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">Em breve.</p>
              </div>
            )}

            {/* Navegação entre passos — «Seguir» não envia; «Salvar» submete o formulário */}
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
              <p className="mb-4 text-xs leading-relaxed text-[var(--muted)]">
                <strong className="text-[var(--foreground)]">Lembrete:</strong> «Seguir» e as abas só organizam o ecrã.{" "}
                <strong className="text-[var(--foreground)]">Só «Salvar»</strong> envia o produto ao servidor.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-[var(--muted)]">
                  Passo {indiceTab + 1} de {TABS.length} · {TABS[indiceTab]?.label}
                </div>
                <div className="flex flex-wrap items-stretch gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => irParaTab(-1)}
                    disabled={indiceTab <= 0}
                    className="min-h-[44px] rounded-lg border border-[var(--card-border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => irParaTab(1)}
                    disabled={indiceTab >= TABS.length - 1}
                    className="min-h-[44px] rounded-lg bg-neutral-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
                  >
                    Seguir →
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="min-h-[44px] rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                  >
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
