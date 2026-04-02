"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DashboardHeader } from "@/components/DashboardHeader";
import { toTitleCase } from "@/lib/formatText";

type Alteracao = {
  id: string;
  sku_id: string;
  fornecedor_id: string;
  org_id: string;
  dados_propostos: Record<string, unknown>;
  status: string;
  motivo_rejeicao: string | null;
  analisado_em: string | null;
  criado_em: string;
  sku: { id: string; sku: string; nome_produto: string | null; cor: string | null; tamanho: string | null; custo_base: number | null; custo_dropcore: number | null; estoque_atual: number | null } | null;
  fornecedor_nome: string;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR") + " " + new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const LABEL: Record<string, string> = {
  nome_produto: "Nome",
  cor: "Cor",
  tamanho: "Tamanho",
  descricao: "Descrição",
  peso_kg: "Peso (kg)",
  peso_liquido_kg: "Peso líquido (kg)",
  peso_bruto_kg: "Peso bruto (kg)",
  estoque_atual: "Estoque atual",
  estoque_minimo: "Est. mínimo",
  custo_base: "Custo fornecedor",
  custo_dropcore: "Custo DropCore",
  categoria: "Categoria",
  dimensoes_pacote: "Dimensões pacote",
  comprimento_cm: "Comp (cm)",
  largura_cm: "Larg (cm)",
  altura_cm: "Alt (cm)",
  link_fotos: "Link fotos",
  imagem_url: "Foto URL",
  ncm: "NCM",
  origem: "Origem",
  cest: "CEST",
  cfop: "CFOP",
};

function formatValor(k: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (k === "custo_base" || k === "custo_dropcore" || k === "peso_kg") {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isFinite(n) && (k === "custo_base" || k === "custo_dropcore")) return BRL.format(n);
    return String(v);
  }
  return String(v);
}

export default function AdminAlteracoesProdutosPage() {
  const router = useRouter();
  const [list, setList] = useState<Alteracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejeitarId, setRejeitarId] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/org/alteracoes-pendentes", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar");
      setList(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function aprovar(id: string) {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/org/alteracoes-pendentes/${id}/aprovar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao aprovar");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao aprovar");
    } finally {
      setActingId(null);
    }
  }

  async function rejeitar(id: string) {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/org/alteracoes-pendentes/${id}/rejeitar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ motivo: motivoRejeicao || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao rejeitar");
      setRejeitarId(null);
      setMotivoRejeicao("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao rejeitar");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <DashboardHeader href="/dashboard" onRefresh={load} onLogout={() => router.push("/login")} />
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <h1 className="text-xl font-semibold mb-2">Alterações de produtos em análise</h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          Os fornecedores enviam alterações que ficam em análise. Aprove ou rejeite para aplicar ou descartar as mudanças.
        </p>

        <button
          type="button"
          onClick={() => router.push("/admin/empresas")}
          className="mb-6 text-sm text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-2"
        >
          ← Voltar às Empresas
        </button>

        {error && (
          <div className="mb-6 p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading && <div className="text-sm text-[var(--muted)]">Carregando…</div>}

        {!loading && list.length === 0 && (
          <div className="p-8 rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-center text-[var(--muted)]">
            Nenhuma alteração pendente.
          </div>
        )}

        {!loading && list.length > 0 && (
          <div className="space-y-4">
            {list.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[var(--foreground)]">
                      {a.sku?.nome_produto ?? "—"} · {a.sku?.sku ?? "—"}
                    </div>
                    <div className="text-sm text-[var(--muted)] mt-1">
                      Fornecedor: {a.fornecedor_nome} · {formatDate(a.criado_em)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => aprovar(a.id)}
                      disabled={actingId === a.id}
                      className="rounded-lg bg-green-600 text-white font-medium px-4 py-2 text-sm hover:bg-green-700 disabled:opacity-60"
                    >
                      {actingId === a.id ? "…" : "Aprovar"}
                    </button>
                    {rejeitarId !== a.id ? (
                      <button
                        type="button"
                        onClick={() => setRejeitarId(a.id)}
                        disabled={actingId === a.id}
                        className="rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
                      >
                        Rejeitar
                      </button>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Motivo (opcional)"
                          value={motivoRejeicao}
                          onChange={(e) => setMotivoRejeicao(e.target.value)}
                          onBlur={() => setMotivoRejeicao(toTitleCase(motivoRejeicao))}
                          className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm w-48"
                        />
                        <button
                          type="button"
                          onClick={() => rejeitar(a.id)}
                          disabled={actingId === a.id}
                          className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm hover:bg-red-700 disabled:opacity-60"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRejeitarId(null); setMotivoRejeicao(""); }}
                          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-[var(--card-border)] pt-4">
                  {(() => {
                    const { tabela_medidas: tm, ...rest } = a.dados_propostos as Record<string, unknown> & { tabela_medidas?: { tipo_produto?: string; medidas?: Record<string, Record<string, number>> } };
                    const entries = Object.entries(rest);
                    return (
                      <>
                        {entries.length > 0 && (
                          <div className="text-xs font-medium text-[var(--muted)] mb-2">Campos alterados (atual → proposto):</div>
                        )}
                        {entries.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm mb-4">
                            {entries.map(([k, v]) => {
                              const skuVal = a.sku && (k in a.sku) ? (a.sku as Record<string, unknown>)[k] : undefined;
                              const atual = formatValor(k, skuVal ?? null);
                              const proposto = formatValor(k, v);
                              return (
                                <div key={k} className="flex flex-col">
                                  <span className="text-[var(--muted)]">{LABEL[k] ?? k}</span>
                                  <span className="font-medium">
                                    {atual} → {proposto}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {tm != null && typeof tm === "object" && tm.medidas != null && typeof tm.medidas === "object" && (() => {
                            const medidasObj = (tm as { medidas: Record<string, Record<string, number>> }).medidas;
                            const firstRow = Object.values(medidasObj)[0];
                            const colKeys = firstRow ? Object.keys(firstRow) : [];
                            return (
                              <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                                <div className="text-xs font-medium text-[var(--muted)] mb-2">Tabela de medidas (proposta)</div>
                                <p className="text-xs text-[var(--muted)] mb-2">Tipo: {(tm as { tipo_produto?: string }).tipo_produto ?? "genérico"}</p>
                                <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-[var(--card)] border-b border-[var(--card-border)]">
                                        <th className="px-2 py-1.5 text-left font-medium text-[var(--muted)]">Tamanho</th>
                                        {colKeys.map((col) => (
                                          <th key={col} className="px-2 py-1.5 text-left font-medium text-[var(--muted)] capitalize">{col.replace(/_/g, " ")} (cm)</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {Object.entries(medidasObj).map(([tam, row]) => (
                                        <tr key={tam} className="border-b border-[var(--card-border)]/60">
                                          <td className="px-2 py-1.5 font-medium">{tam}</td>
                                          {colKeys.map((col) => (
                                            <td key={col} className="px-2 py-1.5">{row && Number.isFinite(row[col]) ? row[col] : "—"}</td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
