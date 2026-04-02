"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toTitleCase } from "@/lib/formatText";

const CORES_PREDEFINIDAS = [
  "Preto", "Branco", "Vermelho", "Verde", "Cinza", "Marrom", "Rosa", "Laranja",
  "Vinho Tinto", "Branco Leitoso", "Azul Escuro", "Roxo", "Azul", "Amarelo", "Bege"
];

const TAMANHOS_PREDEFINIDOS = [
  "PP", "P", "M", "G", "GG", "L", "XL", "XXL", "XXXL", "Único"
];

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
  const [estoqueInicial, setEstoqueInicial] = useState("0");
  const [peso, setPeso] = useState("");
  const [comp, setComp] = useState("");
  const [largura, setLargura] = useState("");
  const [altura, setAltura] = useState("");

  // Mídia
  const [linkFotos, setLinkFotos] = useState("");
  const [linkVideo, setLinkVideo] = useState("");

  const coresFinais = useMemo(() => {
    const set = new Set(coresSelecionadas);
    if (corCustom.trim()) set.add(toTitleCase(corCustom.trim()));
    return Array.from(set);
  }, [coresSelecionadas, corCustom]);

  const tamanhosFinais = useMemo(() => {
    const set = new Set(tamanhosSelecionados);
    if (tamanhoCustom.trim()) set.add(toTitleCase(tamanhoCustom.trim()));
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!nomeProduto.trim()) {
      setFormError("Nome do produto é obrigatório.");
      return;
    }
    if (combinacoes.length === 0) {
      setFormError("Informe pelo menos uma cor ou um tamanho.");
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
        estoque_atual: estoqueInicial.trim() ? parseFloat(estoqueInicial.replace(",", ".")) : undefined,
        peso_kg: peso.trim() ? parseFloat(peso.replace(",", ".")) : undefined,
        custo_base: custoCompra.trim() ? parseFloat(custoCompra.replace(",", ".")) : undefined,
        data_lancamento: dataLancamento || null,
      };
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <div className="bg-[var(--card)] border-b border-[var(--card-border)] sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <DropCoreLogo variant="horizontal" href="/fornecedor/dashboard" className="shrink-0" />
            <ThemeToggle className="shrink-0" />
            <Link
              href="/fornecedor/produtos"
              className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="text-sm">Voltar</span>
            </Link>
            <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              Produtos do Armazém / Criar variantes
            </h1>
          </div>
          <button
            type="submit"
            form="form-criar-variantes"
            disabled={formLoading}
            className="shrink-0 rounded-lg bg-blue-600 text-white font-semibold px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-60 transition"
          >
            Salvar
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex gap-6">
        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0">
          <form id="form-criar-variantes" onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
                {formError}
              </div>
            )}

            {tabAtiva === "info-basica" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm p-6">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Informação Básica</h2>
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
                      <div className="flex flex-wrap gap-2">
                        {CORES_PREDEFINIDAS.map((cor) => (
                          <label
                            key={cor}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={coresSelecionadas.has(cor)}
                              onChange={() => toggleCor(cor)}
                              className="rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-neutral-900 dark:text-neutral-100">{cor}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2">
                        <input
                          type="text"
                          value={corCustom}
                          onChange={(e) => setCorCustom(e.target.value)}
                          onBlur={() => setCorCustom(toTitleCase(corCustom))}
                          placeholder="Ou escreva a cor se não encontrar"
                          className={`${inputBase} max-w-xs py-2`}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Tamanho</p>
                      <div className="flex flex-wrap gap-2">
                        {TAMANHOS_PREDEFINIDOS.map((tam) => (
                          <label
                            key={tam}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={tamanhosSelecionados.has(tam)}
                              onChange={() => toggleTamanho(tam)}
                              className="rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-neutral-900 dark:text-neutral-100">{tam}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2">
                        <input
                          type="text"
                          value={tamanhoCustom}
                          onChange={(e) => setTamanhoCustom(e.target.value)}
                          onBlur={() => setTamanhoCustom(toTitleCase(tamanhoCustom))}
                          placeholder="Ou escreva o tamanho se não encontrar"
                          className={`${inputBase} max-w-xs py-2`}
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
              <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/50 flex items-center justify-between">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Preencher em massa</span>
                  <span className="text-xs text-neutral-600 dark:text-neutral-400">+ Adicionar Opções</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 text-left border-b border-neutral-100 dark:border-neutral-700">
                        <th className="px-4 py-2.5 font-medium w-24">Cor</th>
                        <th className="px-4 py-2.5 font-medium w-20">Tamanho</th>
                        <th className="px-4 py-2.5 font-medium w-48">SKU</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {combinacoes.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                            Selecione cores e tamanhos na aba &quot;Informações de Variantes&quot; para ver a lista.
                          </td>
                        </tr>
                      ) : (
                        combinacoes.map((c, i) => (
                          <tr key={i} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50">
                            <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">{c.cor || "—"}</td>
                            <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">{c.tamanho || "—"}</td>
                            <td className="px-4 py-2.5 text-neutral-400 dark:text-neutral-500 text-xs">Será gerado automaticamente</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {combinacoes.length > 0 && (
                  <div className="px-4 py-4 border-t border-neutral-100 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/50 space-y-3">
                    <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Editar em Massa</p>
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">Data de Lançamento</label>
                        <input
                          type="date"
                          value={dataLancamento}
                          onChange={(e) => setDataLancamento(e.target.value)}
                          className={`${inputBase} py-1.5`}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">Preço varejo (R$)</label>
                        <input type="text" value={precoVarejo} onChange={(e) => setPrecoVarejo(e.target.value)} placeholder="0,00" className={`${inputBase} w-24 py-1.5`} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">Custo de Compra (R$)</label>
                        <input type="text" value={custoCompra} onChange={(e) => setCustoCompra(e.target.value)} placeholder="0,00" className={`${inputBase} w-24 py-1.5`} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">Estoque Inicial</label>
                        <input type="text" value={estoqueInicial} onChange={(e) => setEstoqueInicial(e.target.value)} placeholder="eg:999" className={`${inputBase} w-24 py-1.5`} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">Peso (g)</label>
                        <input type="text" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="eg:999" className={`${inputBase} w-24 py-1.5`} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">Comp (cm)</label>
                        <input type="text" value={comp} onChange={(e) => setComp(e.target.value)} placeholder="—" className={`${inputBase} w-20 py-1.5`} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">Largura (cm)</label>
                        <input type="text" value={largura} onChange={(e) => setLargura(e.target.value)} placeholder="—" className={`${inputBase} w-20 py-1.5`} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">Altura (cm)</label>
                        <input type="text" value={altura} onChange={(e) => setAltura(e.target.value)} placeholder="—" className={`${inputBase} w-20 py-1.5`} />
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
          </form>
        </div>

        {/* Menu lateral direito */}
        <aside className="w-52 shrink-0">
          <nav className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] shadow-sm overflow-hidden sticky top-24">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTabAtiva(tab.id)}
                className={`block w-full text-left px-4 py-2.5 text-sm transition ${
                  tabAtiva === tab.id
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium border-l-2 border-blue-600 dark:border-blue-500"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}
