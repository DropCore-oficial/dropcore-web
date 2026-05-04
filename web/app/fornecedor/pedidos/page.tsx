"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { IconClipboard } from "@/components/seller/Icons";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { cn } from "@/lib/utils";

const FORN_PEDIDO_STATUS_ENVIADO = cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY);

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
          <div className="h-10 w-10 animate-spin rounded-xl border-2 border-[var(--card-border)] border-t-neutral-500 dark:border-t-neutral-400" />
          <p className="text-sm font-medium text-[var(--muted)]">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="dropcore-shell-4xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0 space-y-1">
              <Link
                href="/fornecedor/dashboard"
                className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Voltar
              </Link>
              <p className="text-sm font-medium uppercase leading-snug tracking-wide text-emerald-700/90 dark:text-emerald-400/90">Operação</p>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Pedidos para atender</h1>
              <p className="text-sm leading-snug text-[var(--muted)]">Lista enviada pelos sellers para postagem e acompanhamento.</p>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end sm:pt-0.5">
              <div className="flex w-full flex-wrap gap-2 sm:justify-end">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="min-h-10 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--foreground)] sm:min-w-[12rem] sm:flex-none"
                >
                  <option value="">Todos</option>
                  <option value="enviado">Aguardando postagem</option>
                  <option value="aguardando_repasse">Postados</option>
                  <option value="entregue">Entregues</option>
                  <option value="devolvido">Devolvidos</option>
                  <option value="cancelado">Cancelados</option>
                </select>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="min-h-10 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {loading ? "Carregando..." : "Atualizar"}
                </button>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {avisoLote && (
          <AmberPremiumCallout title="Aviso" className="items-start rounded-2xl px-4 py-3 text-sm">
            {avisoLote}
          </AmberPremiumCallout>
        )}

        {idsComEtiquetaOficial.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 dark:bg-emerald-950/20">
            <p className="min-w-[200px] flex-1 text-sm text-neutral-700 dark:text-neutral-300">
              Selecione pedidos com <strong className="font-medium">etiqueta oficial</strong> (PDF do marketplace) e gere{" "}
              <strong className="font-medium">um único PDF</strong> para imprimir tudo de uma vez.
            </p>
            <button
              type="button"
              onClick={imprimirEtiquetasOficiaisEmLote}
              disabled={imprimindoLote || selecionadosComEtiqueta.length === 0}
              className="whitespace-nowrap rounded-xl border border-emerald-600/40 bg-emerald-600/15 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-600/25 disabled:pointer-events-none disabled:opacity-50 dark:bg-emerald-500/20 dark:text-emerald-300"
            >
              {imprimindoLote
                ? "Gerando PDF..."
                : `Imprimir etiquetas oficiais (${selecionadosComEtiqueta.length})`}
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
          {pedidos.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
                <IconClipboard className="h-7 w-7" />
              </div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Nenhum pedido encontrado</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">Os pedidos aparecem aqui quando forem enviados para você atender.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)] bg-[var(--muted)]/10 text-left text-xs text-[var(--muted)]">
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
                    <tr key={p.id} className="border-b border-[var(--card-border)]/60 transition-colors hover:bg-[var(--muted)]/8">
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
                          <span className="font-medium text-[var(--foreground)]">{p.nome_produto ?? "—"}</span>
                          <span className="text-[12px] text-[var(--muted)] mt-0.5">
                            {p.cor ? `Cor: ${p.cor}` : "Cor: —"} · {p.tamanho ? `Tamanho: ${p.tamanho}` : "Tamanho: —"}
                            {p.categoria ? ` · ${p.categoria}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{BRL.format(p.valor_fornecedor ?? 0)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            p.status === "enviado"
                              ? FORN_PEDIDO_STATUS_ENVIADO
                            : p.status === "aguardando_repasse"
                              ? "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                            : p.status === "entregue"
                              ? "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "border-[var(--card-border)] bg-neutral-100 text-[var(--muted)] dark:bg-neutral-800"
                          }`}
                        >
                          {statusLabel[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.status === "enviado" && (
                            <button
                              type="button"
                              onClick={() => router.push(`/fornecedor/pedidos/${p.id}/etiqueta`)}
                              className="rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-2.5 py-1.5 text-[10px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                              title="Imprimir etiqueta de separação para a embalagem"
                            >
                              Imprimir etiqueta
                            </button>
                          )}
                          {p.status === "enviado" && (
                            <button
                              type="button"
                              onClick={() => void marcarPostado(p.id)}
                              disabled={postandoId !== null}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {postandoId === p.id ? "Marcando..." : "Marcar como postado"}
                            </button>
                          )}
                          {p.status === "aguardando_repasse" && (
                            <button
                              type="button"
                              onClick={() => void marcarPostado(p.id)}
                              disabled={postandoId !== null}
                              title="Use se o extrato do seller ainda mostrar «Aguardando envio» após postagem."
                              className="rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-2.5 py-1.5 text-[10px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
                            >
                              {postandoId === p.id ? "Sincronizando..." : "Sincronizar extrato seller"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
      <FornecedorNav active="pedidos" />
    </div>
  );
}
