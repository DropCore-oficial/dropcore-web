"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toTitleCase } from "@/lib/formatText";
import { CORES_PREDEFINIDAS } from "@/lib/fornecedorVariantesUi";

const inputClass = "w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export default function CriarUnicoPage() {
  const router = useRouter();
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [addNome, setAddNome] = useState("");
  const [addCor, setAddCor] = useState("");
  const [addTamanho, setAddTamanho] = useState("");
  const [addSku, setAddSku] = useState("");
  const [addLinkFotos, setAddLinkFotos] = useState("");
  const [addDescricao, setAddDescricao] = useState("");
  const [addComp, setAddComp] = useState("");
  const [addLarg, setAddLarg] = useState("");
  const [addAlt, setAddAlt] = useState("");
  const [addPeso, setAddPeso] = useState("");
  const [addCusto, setAddCusto] = useState("");
  const [addEstoque, setAddEstoque] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const res = await fetch("/api/fornecedor/produtos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nome_produto: addNome.trim(),
          cor: addCor.trim() || null,
          tamanho: addTamanho.trim() || null,
          sku: addSku.trim() || undefined,
          link_fotos: addLinkFotos.trim() || null,
          descricao: addDescricao.trim() || null,
          comprimento_cm: addComp.trim() || undefined,
          largura_cm: addLarg.trim() || undefined,
          altura_cm: addAlt.trim() || undefined,
          peso_kg: addPeso.trim() || undefined,
          custo_base: addCusto.trim() || undefined,
          estoque_atual: addEstoque.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao adicionar.");
      router.push("/fornecedor/produtos");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao adicionar.");
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4 mb-6">
          <DropCoreLogo variant="horizontal" href="/fornecedor/dashboard" />
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/fornecedor/produtos"
            className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Voltar</span>
          </Link>
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Adicionar produto</h1>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Nome do produto *</label>
              <input
                type="text"
                value={addNome}
                onChange={(e) => setAddNome(e.target.value)}
                onBlur={() => setAddNome(toTitleCase(addNome))}
                placeholder="Ex: Camiseta Básica"
                className={inputClass}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Cor</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CORES_PREDEFINIDAS.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      onClick={() => setAddCor(addCor === cor ? "" : cor)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                        addCor === cor
                          ? "border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                          : "border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      }`}
                    >
                      {cor}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={addCor}
                  onChange={(e) => setAddCor(e.target.value)}
                  onBlur={() => setAddCor(toTitleCase(addCor))}
                  placeholder="Ou digite outra cor"
                  className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1.5">Tamanho</label>
                <input
                  type="text"
                  value={addTamanho}
                  onChange={(e) => setAddTamanho(e.target.value)}
                  onBlur={() => setAddTamanho(toTitleCase(addTamanho))}
                  placeholder="Ex: M"
                  className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1.5">Descrição</label>
              <textarea
                value={addDescricao}
                onChange={(e) => setAddDescricao(e.target.value)}
                onBlur={() => setAddDescricao(toTitleCase(addDescricao))}
                placeholder="Descrição do produto para anúncios"
                rows={3}
                className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-neutral-600 mb-1.5">Comp (cm)</label>
                <input type="text" value={addComp} onChange={(e) => setAddComp(e.target.value)} placeholder="—" className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1.5">Larg (cm)</label>
                <input type="text" value={addLarg} onChange={(e) => setAddLarg(e.target.value)} placeholder="—" className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1.5">Alt (cm)</label>
                <input type="text" value={addAlt} onChange={(e) => setAddAlt(e.target.value)} placeholder="—" className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1.5">Peso (kg)</label>
              <input type="text" inputMode="decimal" value={addPeso} onChange={(e) => setAddPeso(e.target.value)} placeholder="—" className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-600 mb-1.5">Preço / Custo fornecedor (R$)</label>
                <input type="text" inputMode="decimal" value={addCusto} onChange={(e) => setAddCusto(e.target.value)} placeholder="0" className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1.5">Estoque</label>
                <input type="text" inputMode="numeric" value={addEstoque} onChange={(e) => setAddEstoque(e.target.value)} placeholder="0" className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1.5">SKU (opcional)</label>
              <input type="text" value={addSku} onChange={(e) => setAddSku(e.target.value)} placeholder="Deixe vazio para gerar automaticamente" className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1.5">Link das fotos</label>
              <input type="url" value={addLinkFotos} onChange={(e) => setAddLinkFotos(e.target.value)} placeholder="https://drive.google.com/... ou link do Dropbox, etc." className="w-full rounded-lg bg-white border border-neutral-300 text-neutral-900 placeholder-neutral-400 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              <p className="text-[11px] text-neutral-500 mt-1">Cole o link onde estão as fotos do produto</p>
            </div>

            {formError && <p className="text-sm text-red-500">{formError}</p>}

            <div className="flex gap-2 pt-2">
              <Link href="/fornecedor/produtos" className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100 text-center">
                Cancelar
              </Link>
              <button type="submit" disabled={formLoading} className="flex-1 rounded-lg bg-blue-600 text-white font-semibold px-4 py-2.5 text-sm hover:bg-blue-700 disabled:opacity-60">
                {formLoading ? "Salvando..." : "Adicionar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
