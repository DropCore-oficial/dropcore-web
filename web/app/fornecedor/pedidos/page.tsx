"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";

type Pedido = {
  id: string;
  seller_id: string;
  seller_nome: string;
  nome_produto: string | null;
  cor?: string | null;
  tamanho?: string | null;
  categoria?: string | null;
  valor_fornecedor: number;
  status: string;
  criado_em: string;
  tem_etiqueta_oficial?: boolean;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const statusLabel: Record<string, string> = {
  enviado: "Aguardando postagem",
  aguardando_repasse: "Postado",
  entregue: "Entregue",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  erro_saldo: "Erro saldo",
};

export default function FornecedorPedidosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [postandoId, setPostandoId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [imprimindoLote, setImprimindoLote] = useState(false);
  const [avisoLote, setAvisoLote] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/fornecedor/pedidos?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Erro ao carregar pedidos.");
      }
      const json = await res.json();
      setPedidos(json.items ?? []);
      setSelectedIds(new Set());
      setAvisoLote(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function marcarPostado(id: string) {
    setPostandoId(id);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/fornecedor/pedidos/${id}/marcar-postado`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro.");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setPostandoId(null);
    }
  }

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/fornecedor/login");
  }

  const idsComEtiquetaOficial = pedidos.filter((p) => p.tem_etiqueta_oficial).map((p) => p.id);
  const selecionadosComEtiqueta = [...selectedIds].filter((id) =>
    pedidos.some((p) => p.id === id && p.tem_etiqueta_oficial)
  );
  const todosMarcadosComEtiqueta =
    idsComEtiquetaOficial.length > 0 &&
    idsComEtiquetaOficial.every((id) => selectedIds.has(id));
  const algumMarcadoComEtiqueta = idsComEtiquetaOficial.some((id) => selectedIds.has(id));

  function toggleSelecionar(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelecionarTodosComEtiqueta() {
    setSelectedIds(() =>
      todosMarcadosComEtiqueta ? new Set() : new Set(idsComEtiquetaOficial)
    );
  }

  async function imprimirEtiquetasOficiaisEmLote() {
    if (selecionadosComEtiqueta.length === 0) {
      setError("Selecione pelo menos um pedido que tenha etiqueta oficial (marketplace).");
      return;
    }
    setImprimindoLote(true);
    setError(null);
    setAvisoLote(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/fornecedor/login");
        return;
      }
      const res = await fetch("/api/fornecedor/pedidos/etiquetas-combinadas", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selecionadosComEtiqueta }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string })?.error ?? "Erro ao gerar PDF combinado.");
      }
      const avisoHdr = res.headers.get("X-Dropcore-Etiquetas-Aviso");
      if (avisoHdr) {
        try {
          const parsed = JSON.parse(decodeURIComponent(avisoHdr)) as { omitidos?: string[] };
          if (parsed.omitidos?.length) {
            setAvisoLote(
              `Alguns pedidos foram omitidos do PDF (sem etiqueta ou download falhou): ${parsed.omitidos.slice(0, 8).join(", ")}${parsed.omitidos.length > 8 ? "..." : ""}.`
            );
          }
        } catch {
          /* ignore */
        }
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) setError("Permita pop-ups para abrir o PDF ou use o botão de baixar no navegador.");
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao imprimir em lote.");
    } finally {
      setImprimindoLote(false);
    }
  }

  if (loading && pedidos.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--background)] app-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl border-2 border-neutral-200 dark:border-neutral-700 border-t-emerald-500 dark:border-t-emerald-500 animate-spin" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="w-full max-w-4xl mx-auto dropcore-px-content py-5 space-y-6">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Pedidos para atender</h1>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {avisoLote && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            {avisoLote}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
          >
            <option value="">Todos</option>
            <option value="enviado">Aguardando postagem</option>
            <option value="aguardando_repasse">Postados</option>
            <option value="entregue">Entregues</option>
            <option value="devolvido">Devolvidos</option>
            <option value="cancelado">Cancelados</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>

        {idsComEtiquetaOficial.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-950/20 px-4 py-3">
            <p className="text-sm text-neutral-700 dark:text-neutral-300 flex-1 min-w-[200px]">
              Selecione pedidos com <strong className="font-medium">etiqueta oficial</strong> (PDF do marketplace) e gere{" "}
              <strong className="font-medium">um único PDF</strong> para imprimir tudo de uma vez.
            </p>
            <button
              type="button"
              onClick={imprimirEtiquetasOficiaisEmLote}
              disabled={imprimindoLote || selecionadosComEtiqueta.length === 0}
              className="rounded-lg border border-emerald-600/40 bg-emerald-600/15 dark:bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-600/25 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
            >
              {imprimindoLote
                ? "Gerando PDF..."
                : `Imprimir etiquetas oficiais (${selecionadosComEtiqueta.length})`}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
          {pedidos.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-[var(--muted)] text-sm">Nenhum pedido encontrado.</p>
              <p className="text-[var(--muted)] text-xs mt-1">Os pedidos aparecem aqui quando forem enviados para você atender.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)] text-left text-[var(--muted)]">
                    <th className="w-10 px-2 py-3 font-medium align-middle">
                      <input
                        type="checkbox"
                        ref={(el) => {
                          if (el) el.indeterminate = algumMarcadoComEtiqueta && !todosMarcadosComEtiqueta;
                        }}
                        checked={todosMarcadosComEtiqueta}
                        onChange={toggleSelecionarTodosComEtiqueta}
                        disabled={idsComEtiquetaOficial.length === 0}
                        className="rounded border-neutral-300 dark:border-neutral-600"
                        title="Selecionar todos com etiqueta oficial"
                        aria-label="Selecionar todos com etiqueta oficial"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Seller</th>
                    <th className="px-4 py-3 font-medium">Produto</th>
                    <th className="px-4 py-3 font-medium text-right">Valor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--card-border)] hover:bg-[var(--card)]/80">
                      <td className="w-10 px-2 py-3 align-middle">
                        {p.tem_etiqueta_oficial ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelecionar(p.id)}
                            className="rounded border-neutral-300 dark:border-neutral-600"
                            title="Incluir na impressão em lote (etiqueta oficial)"
                            aria-label={`Selecionar pedido ${p.id} para etiqueta oficial`}
                          />
                        ) : (
                          <span className="text-[var(--muted)] text-xs block text-center" title="Sem PDF oficial ainda">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">{formatDate(p.criado_em)}</td>
                      <td className="px-4 py-3">{p.seller_nome}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">{p.nome_produto ?? "—"}</span>
                          <span className="text-[12px] text-[var(--muted)] mt-0.5">
                            {p.cor ? `Cor: ${p.cor}` : "Cor: —"} · {p.tamanho ? `Tamanho: ${p.tamanho}` : "Tamanho: —"}
                            {p.categoria ? ` · ${p.categoria}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{BRL.format(p.valor_fornecedor ?? 0)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            p.status === "enviado" ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
                            : p.status === "aguardando_repasse" ? "bg-sky-100 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300"
                            : p.status === "entregue" ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                            : "bg-neutral-100 dark:bg-neutral-800 text-[var(--muted)]"
                          }`}
                        >
                          {statusLabel[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.status === "enviado" && (
                          <button
                            type="button"
                            onClick={() => router.push(`/fornecedor/pedidos/${p.id}/etiqueta`)}
                            className="rounded-lg border border-neutral-200 dark:border-neutral-600 bg-[var(--card)] px-2.5 py-1.5 text-[10px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            title="Imprimir etiqueta de separação para a embalagem"
                          >
                            Imprimir etiqueta
                          </button>
                        )}
                        {p.status === "enviado" && (
                          <button
                            onClick={() => marcarPostado(p.id)}
                            disabled={postandoId !== null}
                            className="rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {postandoId === p.id ? "Marcando..." : "Marcar como postado"}
                          </button>
                        )}
                        {p.status === "aguardando_repasse" && (
                          <button
                            type="button"
                            onClick={() => marcarPostado(p.id)}
                            disabled={postandoId !== null}
                            title="Use se o extrato do seller ainda mostrar «Aguardando envio» após postagem."
                            className="rounded-lg border border-neutral-200 dark:border-neutral-600 bg-[var(--card)] px-2.5 py-1.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                          >
                            {postandoId === p.id ? "Sincronizando..." : "Sincronizar extrato seller"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
      <FornecedorNav active="pedidos" />
    </div>
  );
}
