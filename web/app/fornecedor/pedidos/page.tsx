"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { IconClipboard } from "@/components/seller/Icons";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { cn } from "@/lib/utils";

// Padrão compacto de toolbar/badge — mesmo teste de web/app/admin/pedidos/page.tsx
// (ver skill dropcore-layout, seções "Botão de ação compacto" e "Badge de status").
const btnSecondaryCompactClass =
  "rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10";
const btnPrimaryCompactClass =
  "rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60";

// Status = informação, não ação: sem borda, fundo suave + bolinha (bg-current) em vez de
// pílula com contorno.
const STATUS_PILL: Record<string, string> = {
  bloqueado: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  pendente_estoque: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  enviado: cn(AMBER_PREMIUM_TEXT_PRIMARY, "bg-[#fffbeb] dark:bg-amber-950/50"),
  aguardando_repasse: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  entregue: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  devolvido: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  erro_saldo: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

type PedidoItem = {
  sku: string;
  quantidade: number;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  categoria: string | null;
  linha_despacho: string | null;
};

type Pedido = {
  id: string;
  seller_id: string;
  seller_nome: string;
  nome_produto: string | null;
  cor?: string | null;
  tamanho?: string | null;
  categoria?: string | null;
  linha_despacho?: string | null;
  metodo_envio?: string | null;
  tracking_codigo?: string | null;
  marketplace_numero?: string | null;
  comprador_nome?: string | null;
  comprador_cidade?: string | null;
  comprador_uf?: string | null;
  comprador_fone?: string | null;
  itens: PedidoItem[];
  valor_fornecedor: number;
  status: string;
  motivo_bloqueio?: string | null;
  criado_em: string;
  tem_etiqueta_oficial?: boolean;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const statusLabel: Record<string, string> = {
  pendente_estoque: "Aguardando estoque",
  bloqueado: "Bloqueado",
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
  const destaqueId = searchParams.get("destaque");
  const pedidoCardRefs = useRef<Record<string, HTMLElement | null>>({});

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

  useEffect(() => {
    if (destaqueId && pedidos.length > 0 && !loading) {
      pedidoCardRefs.current[destaqueId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [destaqueId, pedidos, loading]);

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

  const [lembrandoId, setLembrandoId] = useState<string | null>(null);
  const [lembrarMsg, setLembrarMsg] = useState<Record<string, { tipo: "ok" | "erro"; texto: string } | undefined>>({});

  async function lembrarSeller(id: string) {
    setLembrandoId(id);
    setLembrarMsg((prev) => ({ ...prev, [id]: undefined }));
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/fornecedor/pedidos/${id}/lembrar-etiqueta`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao avisar o seller.");
      setLembrarMsg((prev) => ({ ...prev, [id]: { tipo: "ok", texto: "Seller avisado agora." } }));
    } catch (e: unknown) {
      setLembrarMsg((prev) => ({
        ...prev,
        [id]: { tipo: "erro", texto: e instanceof Error ? e.message : "Erro inesperado." },
      }));
    } finally {
      setLembrandoId(null);
    }
  }

  const [reportandoId, setReportandoId] = useState<string | null>(null);

  async function reportarEtiquetaErrada(id: string) {
    if (!window.confirm("Confirma que a etiqueta desse pedido está errada? Isso remove a etiqueta e avisa o seller de novo.")) {
      return;
    }
    setReportandoId(id);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/fornecedor/pedidos/${id}/reportar-etiqueta-errada`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao reportar etiqueta.");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao reportar etiqueta.");
    } finally {
      setReportandoId(null);
    }
  }

  const idsEnviados = pedidos.filter((p) => p.status === "enviado").map((p) => p.id);
  const selecionadosParaSeparacao = [...selectedIds].filter((id) => idsEnviados.includes(id));
  const pedidosSelecionadosParaSeparacao = pedidos.filter((p) => selecionadosParaSeparacao.includes(p.id));

  function imprimirListaSeparacaoEmLote() {
    if (selecionadosParaSeparacao.length === 0) {
      setError("Selecione pelo menos um pedido aguardando postagem.");
      return;
    }
    setError(null);
    window.print();
  }

  const todosMarcadosEnviados = idsEnviados.length > 0 && idsEnviados.every((id) => selectedIds.has(id));
  const algumMarcadoEnviados = idsEnviados.some((id) => selectedIds.has(id));

  function toggleSelecionarTodosEnviados() {
    setSelectedIds(() => (todosMarcadosEnviados ? new Set() : new Set(idsEnviados)));
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
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          body * { visibility: hidden; }
          .print-lista-separacao, .print-lista-separacao * { visibility: visible; }
          .print-lista-separacao {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
          }
        }
      `}</style>

      {/* Só existe pra impressão em lote — escondido na tela normal, visível só no print (ver <style> acima). */}
      <div className="print-lista-separacao hidden">
        {pedidosSelecionadosParaSeparacao.map((p, idx) => (
          <div
            key={p.id}
            className="bg-white text-black"
            style={{ pageBreakAfter: idx === pedidosSelecionadosParaSeparacao.length - 1 ? "auto" : "always" }}
          >
            <div style={{ width: "80mm", margin: "0 auto", padding: "6px 8px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>LISTA DE SEPARAÇÃO</div>
              <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                <div><b>Pedido:</b> {p.marketplace_numero || p.id}</div>
                <div><b>Seller:</b> {p.seller_nome}</div>
                <div><b>Data:</b> {formatDate(p.criado_em)}</div>
                {p.comprador_nome && (
                  <div><b>Cliente:</b> {p.comprador_nome}{p.comprador_cidade ? ` · ${p.comprador_cidade}` : ""}{p.comprador_uf ? `/${p.comprador_uf}` : ""}</div>
                )}
              </div>
              <div style={{ height: 8 }} />
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>ITENS</div>
              <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                {p.itens.map((it, itIdx) => (
                  <div
                    key={`${p.id}-${it.sku}-${itIdx}`}
                    style={{
                      marginBottom: 8,
                      paddingBottom: 8,
                      borderBottom: itIdx === p.itens.length - 1 ? "none" : "1px dashed #ccc",
                    }}
                  >
                    <div><b>Produto:</b> {it.nome_produto ?? p.nome_produto ?? "—"}</div>
                    <div>{it.cor ? `Cor: ${it.cor}` : "Cor: —"} · {it.tamanho ? `Tamanho: ${it.tamanho}` : "Tamanho: —"}</div>
                    <div><b>Qtd:</b> {it.quantidade}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
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
              <p className="max-w-xl text-sm leading-snug text-[var(--muted)]">Lista enviada pelos sellers para postagem e acompanhamento.</p>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end sm:pt-0.5">
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-max sm:flex-nowrap sm:justify-end">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="min-h-[1.875rem] flex-1 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] sm:w-36 sm:flex-none"
                >
                  <option value="">Todos</option>
                  <option value="pendente_estoque">Aguardando estoque</option>
                  <option value="bloqueado">Bloqueado</option>
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
                  className={cn(btnSecondaryCompactClass, "flex-1 sm:flex-none")}
                >
                  {loading ? "Carregando..." : "Atualizar"}
                </button>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className={cn(DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-2xl px-4 py-3 text-sm")}>
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
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Selecione pedidos com <strong className="font-medium">etiqueta oficial</strong> (PDF do marketplace) e gere{" "}
                <strong className="font-medium">um único PDF</strong> para imprimir tudo de uma vez.
              </p>
              <label className="flex w-fit items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (el) el.indeterminate = algumMarcadoComEtiqueta && !todosMarcadosComEtiqueta;
                  }}
                  checked={todosMarcadosComEtiqueta}
                  onChange={toggleSelecionarTodosComEtiqueta}
                  className="rounded border-neutral-300 dark:border-neutral-600"
                />
                Selecionar todos com etiqueta oficial
              </label>
            </div>
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

        {idsEnviados.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Selecione pedidos <strong className="font-medium">aguardando postagem</strong> (com ou sem etiqueta
                oficial) e imprima a <strong className="font-medium">lista de separação</strong> de todos de uma vez —
                útil pra já preparar a embalagem enquanto a etiqueta não chega.
              </p>
              <label className="flex w-fit items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (el) el.indeterminate = algumMarcadoEnviados && !todosMarcadosEnviados;
                  }}
                  checked={todosMarcadosEnviados}
                  onChange={toggleSelecionarTodosEnviados}
                  className="rounded border-neutral-300 dark:border-neutral-600"
                />
                Selecionar todos aguardando postagem
              </label>
            </div>
            <button
              type="button"
              onClick={imprimirListaSeparacaoEmLote}
              disabled={selecionadosParaSeparacao.length === 0}
              className={cn(btnSecondaryCompactClass, "whitespace-nowrap !px-4 !py-2.5 !text-sm")}
            >
              {`Imprimir lista de separação (${selecionadosParaSeparacao.length})`}
            </button>
          </div>
        )}

        {pedidos.length === 0 ? (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
              <IconClipboard className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Nenhum pedido encontrado</p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">Os pedidos aparecem aqui quando forem enviados para você atender.</p>
          </div>
        ) : (
          <>
            {/* Cards em todas as larguras — padrão de web/app/seller/pedidos/page.tsx (article + dt/dd) */}
            <div className="space-y-3">
              {pedidos.map((p) => (
                <article
                  key={p.id}
                  ref={(el) => { pedidoCardRefs.current[p.id] = el; }}
                  className={cn(
                    "rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 transition-shadow",
                    destaqueId === p.id ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-[var(--background)]" : ""
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--foreground)]">{p.nome_produto ?? "Pedido"}</p>
                      <p className="mt-1 text-sm text-neutral-500">{formatDate(p.criado_em)}</p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                        STATUS_PILL[p.status] ?? "bg-neutral-100 text-[var(--muted)] dark:bg-neutral-800"
                      )}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                      {statusLabel[p.status] ?? p.status}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-neutral-500">Seller</dt>
                      <dd className="font-medium">{p.seller_nome}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Custo total</dt>
                      <dd className="font-medium">{BRL.format(p.valor_fornecedor ?? 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Cor / Tamanho</dt>
                      <dd>{p.cor ?? "—"} · {p.tamanho ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Categoria</dt>
                      <dd>{p.categoria ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Onde despachar</dt>
                      <dd>{p.linha_despacho ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Como despachar</dt>
                      <dd>{p.metodo_envio ?? "—"}</dd>
                    </div>
                    {p.tracking_codigo ? (
                      <div>
                        <dt className="text-neutral-500">Rastreio</dt>
                        <dd className="font-mono text-xs">{p.tracking_codigo}</dd>
                      </div>
                    ) : null}
                    {p.marketplace_numero ? (
                      <div>
                        <dt className="text-neutral-500">Pedido marketplace</dt>
                        <dd className="font-mono text-xs sm:text-sm">{p.marketplace_numero}</dd>
                      </div>
                    ) : null}
                    {[p.comprador_nome, p.comprador_cidade, p.comprador_uf].some(Boolean) ? (
                      <div className="col-span-2">
                        <dt className="text-neutral-500">Destino</dt>
                        <dd>{[p.comprador_cidade, p.comprador_uf].filter(Boolean).join(" / ") || "—"}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {p.itens.length > 1 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {p.itens.map((item, idx) => (
                        <li
                          key={`${p.id}-${item.sku}-${idx}`}
                          className="rounded-lg bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          {item.sku} × {item.quantidade}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {p.status === "bloqueado" && p.motivo_bloqueio ? (
                    <p className={cn("mt-3 text-sm", DANGER_PREMIUM_TEXT_PRIMARY)}>{p.motivo_bloqueio}</p>
                  ) : null}

                  {p.status === "enviado" && !p.tem_etiqueta_oficial && (
                    <div
                      role="status"
                      className="relative mt-3 overflow-hidden rounded-xl border border-[var(--danger)]/55 bg-transparent shadow-sm shadow-red-500/10 dark:border-red-400/55 dark:bg-transparent dark:shadow-none"
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-[var(--danger)] to-red-600 opacity-95 dark:from-red-400 dark:to-red-500 dark:opacity-100"
                      />
                      <div className="pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 dark:border-red-400/55 dark:bg-transparent">
                              <svg
                                className="h-5 w-5 text-[var(--danger)] dark:text-red-300"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <p className="text-base font-bold leading-snug tracking-tight text-[var(--danger)] dark:text-red-300">
                                Sem etiqueta
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                                A Olist ainda não gerou a etiqueta real desse pedido — depende do
                                seller (só ele acessa a Olist). Não é um problema seu.
                              </p>
                            </div>
                          </div>
                          <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
                            <button
                              type="button"
                              onClick={() => void lembrarSeller(p.id)}
                              disabled={lembrandoId === p.id}
                              className="w-full shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors bg-[var(--danger)] hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:hover:opacity-100 dark:shadow-sm dark:shadow-red-950/50 dark:ring-1 dark:ring-inset dark:ring-white/20 sm:w-auto"
                            >
                              {lembrandoId === p.id ? "Avisando..." : "Lembrar seller"}
                            </button>
                            {(() => {
                              const msg = lembrarMsg[p.id];
                              if (!msg) return null;
                              return (
                                <span
                                  className={
                                    msg.tipo === "ok"
                                      ? "text-[11px] text-emerald-600 dark:text-emerald-400"
                                      : "text-[11px] text-[var(--danger)]"
                                  }
                                >
                                  {msg.texto}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {p.status === "enviado" && (
                    <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelecionar(p.id)}
                        className="rounded border-neutral-300 dark:border-neutral-600"
                        aria-label={`Selecionar pedido ${p.id} para impressão em lote`}
                      />
                      Incluir no lote (etiqueta oficial e/ou lista de separação)
                    </label>
                  )}

                  {p.status === "enviado" && (
                    <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end">
                      {p.status === "enviado" && p.tem_etiqueta_oficial && (
                        <button
                          type="button"
                          onClick={() => router.push(`/fornecedor/pedidos/${p.id}/etiqueta`)}
                          className={cn(btnSecondaryCompactClass, "w-full sm:w-auto")}
                          title="Abrir etiqueta oficial pra impressão"
                        >
                          Imprimir etiqueta
                        </button>
                      )}
                      {p.status === "enviado" && p.tem_etiqueta_oficial && (
                        <button
                          type="button"
                          onClick={() => void reportarEtiquetaErrada(p.id)}
                          disabled={reportandoId === p.id}
                          className="w-full rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-[var(--danger)] underline decoration-dotted underline-offset-2 hover:opacity-80 sm:w-auto"
                          title="A etiqueta não é do pedido certo (endereço/produto não bate)"
                        >
                          {reportandoId === p.id ? "Reportando..." : "Etiqueta errada?"}
                        </button>
                      )}
                      {p.status === "enviado" && (
                        <button
                          type="button"
                          onClick={() => void marcarPostado(p.id)}
                          disabled={postandoId !== null || !p.tem_etiqueta_oficial}
                          title={
                            p.tem_etiqueta_oficial
                              ? undefined
                              : "Sem a etiqueta real não dá pra postar o pacote — peça pro seller buscar o link primeiro."
                          }
                          className={cn(
                            p.tem_etiqueta_oficial
                              ? btnPrimaryCompactClass
                              : "rounded-md bg-neutral-200 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-500 cursor-not-allowed dark:bg-neutral-800 dark:text-neutral-500",
                            "w-full sm:w-auto"
                          )}
                        >
                          {postandoId === p.id ? "Marcando..." : "Marcar como postado"}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

      </div>
      <FornecedorNav active="pedidos" />
    </div>
  );
}
