"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { FornecedorNav } from "../FornecedorNav";
import { FotoVariacaoCell } from "@/components/FotoVariacaoCell";
import { toTitleCase } from "@/lib/formatText";

type Produto = {
  id: string;
  sku: string;
  nome_produto: string;
  cor: string | null;
  tamanho: string | null;
  status: string;
  estoque_atual: number | null;
  estoque_minimo: number | null;
  custo_base: number | null;
  custo_dropcore: number | null;
  peso_kg: number | null;
  link_fotos: string | null;
  imagem_url: string | null;
  descricao: string | null;
  comprimento_cm: number | null;
  largura_cm: number | null;
  altura_cm: number | null;
  criado_em: string;
};

/** Agrupa SKUs por produto (paiKey: XXX001000 = pai, XXX001001+ = filhos; XXX = iniciais do fornecedor) */
function paiKey(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}000`;
}

function getLinkFotos(produto: Produto, todos: Produto[]): string | null {
  if (produto.link_fotos) return produto.link_fotos;
  const pk = paiKey(produto.sku);
  if (produto.sku === pk) return null;
  const pai = todos.find((p) => p.sku === pk);
  return pai?.link_fotos ?? null;
}

type GrupoProduto = { paiKey: string; pai: Produto | null; filhos: Produto[] };

function isEstoqueBaixo(p: Produto): boolean {
  const min = p.estoque_minimo;
  const atual = p.estoque_atual;
  return min != null && atual != null && Number(atual) < Number(min);
}

export default function FornecedorProdutosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtroEstoqueBaixo = searchParams.get("estoqueBaixo") === "1";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [modal, setModal] = useState<"none" | "edit">("none");
  const [editando, setEditando] = useState<Produto | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit form
  const [editNome, setEditNome] = useState("");
  const [editCor, setEditCor] = useState("");
  const [editTamanho, setEditTamanho] = useState("");
  const [editLinkFotos, setEditLinkFotos] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editComp, setEditComp] = useState("");
  const [editLarg, setEditLarg] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [editPeso, setEditPeso] = useState("");
  const [editEstoque, setEditEstoque] = useState("");
  const [editCusto, setEditCusto] = useState("");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [alteracoesStatus, setAlteracoesStatus] = useState<{
    pendentes: string[];
    por_sku: Record<string, { status: "aprovado" | "rejeitado"; motivo_rejeicao?: string; analisado_em: string }>;
  }>({ pendentes: [], por_sku: {} });

  function toggleExpandido(key: string) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const res = await fetch("/api/fornecedor/produtos", { headers, cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          await supabaseBrowser.auth.signOut();
          router.replace("/fornecedor/login");
          return;
        }
        const j = await res.json();
        throw new Error(j?.error ?? "Erro ao carregar produtos.");
      }
      const data = await res.json();
      setProdutos(data ?? []);
      const statusRes = await fetch("/api/fornecedor/alteracoes-status", { headers, cache: "no-store" });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setAlteracoesStatus({
          pendentes: statusData.pendentes ?? [],
          por_sku: statusData.por_sku ?? {},
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  const produtosParaGrupos = useMemo(() => {
    if (!filtroEstoqueBaixo) return produtos;
    return produtos.filter(isEstoqueBaixo);
  }, [produtos, filtroEstoqueBaixo]);

  const grupos = useMemo((): GrupoProduto[] => {
    const map = new Map<string, { pai: Produto | null; filhos: Produto[] }>();
    for (const p of produtosParaGrupos) {
      const key = paiKey(p.sku);
      if (!map.has(key)) map.set(key, { pai: null, filhos: [] });
      const g = map.get(key)!;
      if (p.sku.endsWith("000") && p.sku === key) g.pai = p;
      else g.filhos.push(p);
    }
    return Array.from(map.entries())
      .map(([paiKey, g]) => ({
        paiKey,
        pai: g.pai,
        filhos: g.filhos.sort((a, b) => a.sku.localeCompare(b.sku)),
      }))
      .sort((a, b) => a.paiKey.localeCompare(b.paiKey));
  }, [produtosParaGrupos]);

  function statusAlteracaoGrupo(g: GrupoProduto): "pendente" | "aprovado" | "rejeitado" | null {
    const ids = [...(g.pai ? [g.pai.id] : []), ...g.filhos.map((f) => f.id)];
    const temPendente = ids.some((id) => alteracoesStatus.pendentes.includes(id));
    if (temPendente) return "pendente";
    let ultimo: { status: "aprovado" | "rejeitado"; motivo_rejeicao?: string; analisado_em: string } | null = null;
    for (const id of ids) {
      const r = alteracoesStatus.por_sku[id];
      if (r && (!ultimo || (r.analisado_em && r.analisado_em > ultimo.analisado_em))) ultimo = r;
    }
    return ultimo?.status ?? null;
  }

  function motivoRejeicaoGrupo(g: GrupoProduto): string | null {
    const ids = [...(g.pai ? [g.pai.id] : []), ...g.filhos.map((f) => f.id)];
    let ultimo: { motivo_rejeicao?: string; analisado_em: string } | null = null;
    for (const id of ids) {
      const r = alteracoesStatus.por_sku[id];
      if (r?.status === "rejeitado" && (!ultimo || (r.analisado_em && r.analisado_em > ultimo.analisado_em)))
        ultimo = r;
    }
    return ultimo?.motivo_rejeicao ?? null;
  }

  useEffect(() => {
    load();
  }, []);


  function openEdit(p: Produto) {
    setEditando(p);
    setEditNome(p.nome_produto ?? "");
    setEditCor(p.cor ?? "");
    setEditTamanho(p.tamanho ?? "");
    setEditLinkFotos(p.link_fotos ?? "");
    setEditDescricao(p.descricao ?? "");
    setEditComp(p.comprimento_cm != null ? String(p.comprimento_cm) : "");
    setEditLarg(p.largura_cm != null ? String(p.largura_cm) : "");
    setEditAlt(p.altura_cm != null ? String(p.altura_cm) : "");
    setEditPeso(p.peso_kg != null ? String(p.peso_kg) : "");
    setEditEstoque(p.estoque_atual != null ? String(p.estoque_atual) : "");
    setEditCusto(p.custo_base != null ? String(p.custo_base) : "");
    setModal("edit");
    setFormError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setFormError(null);
    setFormLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada.");
      const res = await fetch(`/api/fornecedor/produtos/${editando.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nome_produto: editNome.trim(),
          cor: editCor.trim() || null,
          tamanho: editTamanho.trim() || null,
          link_fotos: editLinkFotos.trim() || null,
          descricao: editDescricao.trim() || null,
          comprimento_cm: editComp.trim() || undefined,
          largura_cm: editLarg.trim() || undefined,
          altura_cm: editAlt.trim() || undefined,
          peso_kg: editPeso.trim() || undefined,
          custo_base: editCusto.trim() || undefined,
          estoque_atual: editEstoque.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar.");
      setModal("none");
      setEditando(null);
      setSuccessMessage(j?.mensagem ?? "Enviado para análise. O admin verá em Alterações de produtos.");
      setTimeout(() => setSuccessMessage(null), 4000);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setFormLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl border-2 border-neutral-200 dark:border-neutral-700 border-t-emerald-500 dark:border-t-emerald-500 animate-spin" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Carregando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-0 md:pt-14 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="w-full max-w-4xl mx-auto dropcore-px-content py-5 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/fornecedor/dashboard"
            className="flex items-center gap-2.5 min-w-0 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Voltar</span>
          </Link>
          <h1 className="text-lg font-semibold truncate text-neutral-900 dark:text-neutral-100">Meus produtos</h1>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300">
            {error}
            <button onClick={load} className="ml-2 underline">Tentar novamente</button>
          </div>
        )}

        {successMessage && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm text-emerald-800 dark:text-emerald-300">
            {successMessage}
          </div>
        )}

        {/* Filtro estoque baixo */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={filtroEstoqueBaixo}
              onChange={(e) => router.push(e.target.checked ? "/fornecedor/produtos?estoqueBaixo=1" : "/fornecedor/produtos")}
              className="rounded border-[var(--card-border)]"
            />
            Só estoque baixo
          </label>
        </div>

        {/* Add button */}
        <div className="flex justify-end gap-2">
          <div className="relative group">
            <button
              className="rounded-lg bg-blue-600 text-white font-semibold px-4 py-2.5 text-sm hover:bg-blue-700 transition flex items-center gap-1.5"
            >
              + Criar produto
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className="absolute right-0 top-full mt-1 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition z-10 min-w-[200px]">
              <Link
                href="/fornecedor/produtos/criar-unico"
                className="block w-full text-left px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Criar único produto
              </Link>
              <Link
                href="/fornecedor/produtos/criar-variantes"
                className="block w-full text-left px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Criar variantes (cor/tamanho)
              </Link>
            </div>
          </div>
        </div>

        {/* Lista — estilo UpSeller: tabela com variantes */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Produtos do armazém</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Gerencie seus produtos e links de fotos</p>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {grupos.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                  {filtroEstoqueBaixo ? "Nenhum produto com estoque abaixo do mínimo." : "Nenhum produto cadastrado."}
                </p>
                <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">Crie um produto único ou com variantes para começar.</p>
              </div>
            ) : (
              grupos.map((g) => {
                const representante = g.pai ?? g.filhos[0];
                const exp = expandido.has(g.paiKey);
                const linhas = [...(g.pai ? [g.pai] : []), ...g.filhos];
                const todosInativos = linhas.every((p) => (p.status || "").toLowerCase() !== "ativo");
                return (
                  <div key={g.paiKey} className="bg-white dark:bg-transparent">
                    {/* Cabeçalho do produto — clicável para expandir */}
                    <div
                      className="flex items-center gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer"
                      onClick={() => toggleExpandido(g.paiKey)}
                    >
                      <button
                        type="button"
                        className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400 p-0.5 -ml-1"
                        aria-label={exp ? "Recolher" : "Expandir"}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={`transition ${exp ? "rotate-90" : ""}`}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </button>
                      <div className="w-12 h-12 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center shrink-0 overflow-hidden">
                        {getLinkFotos(representante!, produtos) ? (
                          <a
                            href={getLinkFotos(representante!, produtos)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 text-lg hover:bg-neutral-300 dark:hover:bg-neutral-600"
                          >
                            📷
                          </a>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500 text-lg">—</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate flex items-center gap-2 flex-wrap">
                          {representante?.nome_produto}
                          {todosInativos && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                              Inativo
                            </span>
                          )}
                          {statusAlteracaoGrupo(g) === "pendente" && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300" title="Alteração aguardando aprovação do admin">
                              Em análise
                            </span>
                          )}
                          {statusAlteracaoGrupo(g) === "aprovado" && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300">
                              Aprovado
                            </span>
                          )}
                          {statusAlteracaoGrupo(g) === "rejeitado" && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300" title={motivoRejeicaoGrupo(g) ? `Motivo: ${motivoRejeicaoGrupo(g)}` : undefined}>
                              Recusado
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          <span className="font-mono text-neutral-600 dark:text-neutral-500">{g.paiKey}</span>
                          {linhas.length > 0 && (
                            <span> · Variantes ({linhas.length})</span>
                          )}
                        </p>
                      </div>
                      <Link
                        href={`/fornecedor/produtos/editar/${encodeURIComponent(g.paiKey)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Editar variantes
                      </Link>
                    </div>

                    {/* Tabela de variantes — estilo UpSeller */}
                    {exp && linhas.length > 0 && (
                      <div className="border-t border-neutral-100 dark:border-neutral-800 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 text-left">
                              <th className="px-4 py-2 font-medium w-16">Foto</th>
                              <th className="px-4 py-2 font-medium w-24">Cor</th>
                              <th className="px-4 py-2 font-medium w-20">Tamanho</th>
                              <th className="px-4 py-2 font-medium w-24">SKU</th>
                              <th className="px-4 py-2 font-medium w-20 text-right">Estoque</th>
                              <th className="px-4 py-2 font-medium">Link fotos</th>
                              <th className="px-4 py-2 font-medium w-24 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {linhas.map((row) => {
                              const lf = getLinkFotos(row, produtos) || row.link_fotos;
                              return (
                                <tr key={row.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50">
                                  <td className="px-4 py-2.5">
                                    <FotoVariacaoCell
                                      skuId={row.id}
                                      imagemUrl={row.imagem_url ?? null}
                                      onUpdate={async (url) => {
                                        setProdutos((prev) =>
                                          prev.map((p) => (p.id === row.id ? { ...p, imagem_url: url } : p))
                                        );
                                        const mesmaCor = linhas.filter((p) => (p.cor ?? "") === (row.cor ?? ""));
                                        const primeiroDaCor = mesmaCor.sort((a, b) => a.sku.localeCompare(b.sku))[0];
                                        if (primeiroDaCor?.id === row.id && url) {
                                          const sibs = mesmaCor.filter((p) => p.id !== row.id);
                                          if (sibs.length > 0) {
                                            const { data } = await supabaseBrowser.auth.getSession();
                                            const token = data.session?.access_token;
                                            if (token) {
                                              await Promise.all(
                                                sibs.map((p) =>
                                                  fetch(`/api/fornecedor/produtos/${p.id}`, {
                                                    method: "PATCH",
                                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                                    body: JSON.stringify({ imagem_url: url }),
                                                  })
                                                )
                                              );
                                              setProdutos((prev) =>
                                                prev.map((p) => (sibs.some((s) => s.id === p.id) ? { ...p, imagem_url: url } : p))
                                              );
                                            }
                                          }
                                        }
                                      }}
                                      getToken={async () => {
                                        const { data } = await supabaseBrowser.auth.getSession();
                                        return data.session?.access_token ?? null;
                                      }}
                                    />
                                  </td>
                                  <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">{row.cor || "—"}</td>
                                  <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">{row.tamanho || "—"}</td>
                                  <td className="px-4 py-2.5 font-mono text-neutral-600 dark:text-neutral-500 text-xs">{row.sku}</td>
                                  <td className="px-4 py-2.5 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                                    {row.estoque_atual != null ? row.estoque_atual : "—"}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {lf ? (
                                      <a
                                        href={lf}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs truncate max-w-[180px] block"
                                      >
                                        Ver fotos
                                      </a>
                                    ) : (
                                      <span className="text-neutral-400 dark:text-neutral-500 text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); openEdit(row); }}
                                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-xs"
                                    >
                                      Editar
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/fornecedor/dashboard" className="hover:text-neutral-600 dark:hover:text-neutral-300">Dashboard</Link>
          {" · "}
          <Link href="/" className="hover:text-neutral-600 dark:hover:text-neutral-300">Voltar ao DropCore</Link>
        </p>
      </div>

      {/* Modal Edit */}
      {modal === "edit" && editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !formLoading && setModal("none")}>
          <div className="w-full max-w-md rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Editar produto · {editando.sku}</h3>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Nome do produto *</label>
                <input
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  onBlur={() => setEditNome(toTitleCase(editNome))}
                  placeholder="Ex: Camiseta Básica"
                  className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Cor</label>
                  <input
                    type="text"
                    value={editCor}
                    onChange={(e) => setEditCor(e.target.value)}
                    onBlur={() => setEditCor(toTitleCase(editCor))}
                    placeholder="Ex: Preto"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Tamanho</label>
                  <input
                    type="text"
                    value={editTamanho}
                    onChange={(e) => setEditTamanho(e.target.value)}
                    onBlur={() => setEditTamanho(editTamanho.trim().toUpperCase())}
                    placeholder="Ex: M"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Descrição</label>
                <textarea
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  onBlur={() => setEditDescricao(toTitleCase(editDescricao))}
                  placeholder="Descrição do produto"
                  rows={2}
                  className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Comp (cm)</label>
                  <input
                    type="text"
                    value={editComp}
                    onChange={(e) => setEditComp(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Larg (cm)</label>
                  <input
                    type="text"
                    value={editLarg}
                    onChange={(e) => setEditLarg(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Alt (cm)</label>
                  <input
                    type="text"
                    value={editAlt}
                    onChange={(e) => setEditAlt(e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Peso (kg)</label>
                <input type="text" inputMode="decimal" value={editPeso} onChange={(e) => setEditPeso(e.target.value)} placeholder="—" className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Preço / Custo (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editCusto}
                    onChange={(e) => setEditCusto(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Estoque</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editEstoque}
                    onChange={(e) => setEditEstoque(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1.5">Link das fotos (esta variante)</label>
                <input
                  type="url"
                  value={editLinkFotos}
                  onChange={(e) => setEditLinkFotos(e.target.value)}
                  placeholder="https://drive.google.com/... ou link do Dropbox, etc."
                  className="w-full rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">Cada variante pode ter seu próprio link de fotos</p>
              </div>
              {formError && <p className="text-sm text-red-400">{formError}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !formLoading && setModal("none")}
                  className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 rounded-lg bg-blue-600 text-white font-semibold px-4 py-2.5 text-sm hover:bg-blue-700 disabled:opacity-60"
                >
                  {formLoading ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <FornecedorNav active="produtos" />
    </div>
  );
}
