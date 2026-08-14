"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { PedidoCardSkeleton } from "@/components/ui/Skeleton";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import {
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SHELL,
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import {
  MSG_SKU_NAO_HABILITADO_PLANO_STARTER,
  MAX_SKUS_HABILITADOS_STARTER,
  isSellerPlanoPro,
  paiKeySkuHabilitacao,
} from "@/lib/sellerSkuHabilitado";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import {
  SELLER_SALDO_CRITICO_ACCENT_BAR,
  SELLER_SALDO_CRITICO_BODY,
  SELLER_SALDO_CRITICO_CARD_SURFACE,
  SELLER_SALDO_CRITICO_ICON_STROKE,
  SELLER_SALDO_CRITICO_ICON_WRAP,
  SELLER_SALDO_CRITICO_INNER_PAD,
  SELLER_SALDO_CRITICO_TITLE,
} from "@/lib/dangerSellerSaldoCriticoUi";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { cn } from "@/lib/utils";

// Padrão compacto de toolbar — mesmo teste de web/app/fornecedor/pedidos/page.tsx
// (ver skill dropcore-layout, seção "Botão de ação compacto").
const btnSecondaryCompactClass =
  "rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10";

/** Números de página com reticências pra não estourar a barra quando há muitas páginas. */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

type PedidoItem = { sku: string; quantidade: number; nome_produto: string | null };

type Pedido = {
  id: string;
  nome_produto: string | null;
  valor_total: number;
  preco_venda: number | null;
  status: string;
  motivo_bloqueio: string | null;
  criado_em: string;
  referencia_externa: string | null;
  tracking_codigo: string | null;
  metodo_envio: string | null;
  marketplace_numero: string | null;
  comprador_nome: string | null;
  comprador_cidade: string | null;
  comprador_uf: string | null;
  comprador_fone: string | null;
  itens: PedidoItem[];
  tem_etiqueta: boolean;
  etiqueta_tentativas: number;
  is_reserva?: boolean;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Título do card sem repetir o nome do produto uma vez por item — usa o nome deduplicado
 * dos itens (não o `nome_produto` do pedido, que às vezes já vem concatenado do Olist).
 * Mesmo padrão de web/app/fornecedor/pedidos/page.tsx (`tituloPedido`).
 */
function tituloPedido(p: Pedido): string {
  const itens = p.itens ?? [];
  const nomesUnicos = [...new Set(itens.map((it) => (it.nome_produto ?? "").trim()).filter(Boolean))];
  if (nomesUnicos.length === 0) {
    const skuList = itens.map((i) => i.sku).filter(Boolean).join(", ");
    return p.nome_produto?.trim() || skuList || "Pedido";
  }
  if (nomesUnicos.length === 1) {
    return itens.length > 1 ? `${nomesUnicos[0]} · ${itens.length} itens` : nomesUnicos[0];
  }
  const outros = nomesUnicos.length - 1;
  return `${nomesUnicos[0]} + ${outros} outro${outros > 1 ? "s" : ""}`;
}

const statusLabel: Record<string, string> = {
  pendente_estoque: "Aguardando estoque",
  bloqueado: "Bloqueado",
  enviado: "Aguardando postagem",
  aguardando_repasse: "Postado",
  entregue: "Entregue",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  erro_saldo: "Erro de saldo",
  aguardando_pagamento: "Aguardando pagamento",
};

// Status = informação, não ação: sem borda, fundo suave + bolinha (bg-current) em vez de
// pílula com contorno (mesmo padrão de web/app/fornecedor/pedidos/page.tsx).
const STATUS_PILL: Record<string, string> = {
  bloqueado: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  pendente_estoque: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  enviado: cn(AMBER_PREMIUM_TEXT_PRIMARY, "bg-[#fffbeb] dark:bg-amber-950/50"),
  aguardando_repasse: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  entregue: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  devolvido: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  erro_saldo: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  aguardando_pagamento: cn(AMBER_PREMIUM_TEXT_PRIMARY, "bg-[#fffbeb] dark:bg-amber-950/50"),
};

export default function SellerPedidosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const destaqueId = searchParams.get("destaque");
  const pedidoRefs = useRef<Record<string, HTMLElement | null>>({});
  const [etiquetaLinkInputs, setEtiquetaLinkInputs] = useState<Record<string, string>>({});
  const [etiquetaLinkSaving, setEtiquetaLinkSaving] = useState<Record<string, boolean>>({});
  const [etiquetaLinkError, setEtiquetaLinkError] = useState<Record<string, string>>({});
  const [etiquetaModo, setEtiquetaModo] = useState<Record<string, "link" | "arquivo">>({});
  const [etiquetaFileInputs, setEtiquetaFileInputs] = useState<Record<string, File | null>>({});
  const [etiquetaModalPedidoId, setEtiquetaModalPedidoId] = useState<string | null>(null);
  const [bloqueioModalPedidoId, setBloqueioModalPedidoId] = useState<string | null>(null);
  const [planoCapacidade, setPlanoCapacidade] = useState<{
    plano: string | null;
    habilitados_count: number;
    habilitados_max: number | null;
  } | null>(null);

  async function salvarEtiquetaLink(pedidoId: string) {
    const url = (etiquetaLinkInputs[pedidoId] ?? "").trim();
    setEtiquetaLinkError((prev) => ({ ...prev, [pedidoId]: "" }));
    if (!/^https:\/\/.+/i.test(url)) {
      setEtiquetaLinkError((prev) => ({ ...prev, [pedidoId]: "Cole um link válido (https://...)." }));
      return;
    }
    setEtiquetaLinkSaving((prev) => ({ ...prev, [pedidoId]: true }));
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch(`/api/seller/pedidos/${pedidoId}/etiqueta-link`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao salvar link.");
      await load();
      setEtiquetaModalPedidoId(null);
    } catch (e: unknown) {
      setEtiquetaLinkError((prev) => ({
        ...prev,
        [pedidoId]: e instanceof Error ? e.message : "Erro inesperado.",
      }));
    } finally {
      setEtiquetaLinkSaving((prev) => ({ ...prev, [pedidoId]: false }));
    }
  }

  async function enviarEtiquetaArquivo(pedidoId: string) {
    const file = etiquetaFileInputs[pedidoId];
    setEtiquetaLinkError((prev) => ({ ...prev, [pedidoId]: "" }));
    if (!file) {
      setEtiquetaLinkError((prev) => ({ ...prev, [pedidoId]: "Selecione o arquivo PDF da etiqueta." }));
      return;
    }
    setEtiquetaLinkSaving((prev) => ({ ...prev, [pedidoId]: true }));
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/seller/pedidos/${pedidoId}/etiqueta-link`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao enviar o arquivo.");
      await load();
      setEtiquetaModalPedidoId(null);
    } catch (e: unknown) {
      setEtiquetaLinkError((prev) => ({
        ...prev,
        [pedidoId]: e instanceof Error ? e.message : "Erro inesperado.",
      }));
    } finally {
      setEtiquetaLinkSaving((prev) => ({ ...prev, [pedidoId]: false }));
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      // Com destaque (link de notificação), busca uma janela maior em vez de só a
      // página atual — o pedido notificado pode não estar entre os `pageSize` mais
      // recentes (mesmo padrão de web/app/fornecedor/pedidos/page.tsx).
      params.set("page", destaqueId ? "1" : String(page));
      params.set("limit", destaqueId ? "300" : String(pageSize));
      const res = await fetch(`/api/seller/pedidos?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Erro ao carregar pedidos.");
      }
      const json = await res.json();
      setPedidos(json.items ?? []);
      setTotalPedidos(typeof json.total === "number" ? json.total : (json.items ?? []).length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page, pageSize]);

  // Só usado pra decidir o destino do botão "Resolver" no card de pedido bloqueado
  // por teto do plano Start (produto específico vs. /seller/plano).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch("/api/seller/catalogo/habilitados", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setPlanoCapacidade({
            plano: json.plano ?? null,
            habilitados_count: typeof json.habilitados_count === "number" ? json.habilitados_count : 0,
            habilitados_max:
              json.habilitados_max === null || json.habilitados_max === undefined
                ? null
                : Number(json.habilitados_max),
          });
        }
      } catch {
        // silencioso — só afeta o destino do "Resolver", não bloqueia a tela
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function bloqueioResolverInfo(p: Pedido): { href: string; limiteAtingido: boolean } {
    const porTetoPlano = p.motivo_bloqueio === MSG_SKU_NAO_HABILITADO_PLANO_STARTER;
    const limiteAtingido =
      porTetoPlano &&
      planoCapacidade != null &&
      !isSellerPlanoPro(planoCapacidade.plano) &&
      planoCapacidade.habilitados_count >= (planoCapacidade.habilitados_max ?? MAX_SKUS_HABILITADOS_STARTER);
    const href = porTetoPlano
      ? limiteAtingido
        ? "/seller/plano"
        : `/seller/produtos?abrir=${encodeURIComponent(paiKeySkuHabilitacao(p.itens[0]?.sku))}`
      : "/seller/produtos";
    return { href, limiteAtingido };
  }

  useEffect(() => {
    if (destaqueId && pedidos.length > 0 && !loading) {
      const el = pedidoRefs.current[destaqueId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [destaqueId, pedidos, loading]);

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pb-5">
      <SellerNav active="pedidos" wide />
      <main className="dropcore-shell-6xl mx-auto px-4 pt-20 pb-5 sm:px-6 sm:pt-24 md:pb-7">
        <SellerPageHeader
          surface="hero"
          title="Seus pedidos"
          subtitle={
            <>
              Pedidos importados da Olist e do ERP.{" "}
              <span className="font-medium text-[var(--foreground)]">O extrato financeiro continua no Dashboard.</span>
            </>
          }
        />

        {error ? (
          <AmberPremiumCallout className="mb-4" title="Erro">
            {error}
          </AmberPremiumCallout>
        ) : null}

        <div className="mb-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="relative flex-1 sm:flex-none sm:shrink-0">
              <div
                aria-hidden
                className="pointer-events-none flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
              >
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
                {statusFilter ? statusLabel[statusFilter] ?? statusFilter : "Todos"}
                <svg className="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
              <select
                aria-label="Filtrar por status"
                value={statusFilter}
                onChange={(e) => {
                  setPage(1);
                  setStatusFilter(e.target.value);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                <option value="">Todos</option>
                <option value="pendente_estoque">Aguardando estoque</option>
                <option value="bloqueado">Bloqueado</option>
                <option value="enviado">Aguardando postagem</option>
                <option value="aguardando_repasse">Postados</option>
                <option value="entregue">Entregues</option>
                <option value="erro_saldo">Erro de saldo</option>
                <option value="aguardando_pagamento">Aguardando pagamento</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={cn(btnSecondaryCompactClass, "flex-1 sm:flex-none sm:shrink-0")}
            >
              {loading ? "Carregando..." : "Atualizar Pedidos"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <PedidoCardSkeleton key={i} fields={4} />
            ))}
          </div>
        ) : pedidos.length === 0 ? (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Nenhum pedido encontrado</p>
            <p className="mt-2 text-sm text-neutral-500">
              Após sincronizar a Olist em Integrações ERP, os pedidos aparecem aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pedidos.map((p) => {
              const comprador = [p.comprador_nome, p.comprador_cidade, p.comprador_uf].filter(Boolean).join(" · ");

              return (
                <article
                  key={p.id}
                  ref={(el) => { pedidoRefs.current[p.id] = el; }}
                  className={cn(
                    "rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 transition-shadow",
                    destaqueId === p.id ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-[var(--background)]" : ""
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--foreground)]">{tituloPedido(p)}</p>
                      <p className="mt-1 text-sm text-neutral-500">{formatDate(p.criado_em)}</p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                        STATUS_PILL[p.status] ?? "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      )}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                      {statusLabel[p.status] ?? p.status}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-neutral-500">Custo total</dt>
                      <dd className="text-base font-semibold text-[var(--foreground)]">
                        {p.is_reserva ? "—" : BRL.format(Number(p.valor_total ?? 0))}
                      </dd>
                    </div>
                    {!p.is_reserva && p.preco_venda != null && p.preco_venda > 0 ? (
                      <div>
                        <dt className="text-neutral-500">Vendido por</dt>
                        <dd className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
                          {BRL.format(p.preco_venda)}
                        </dd>
                      </div>
                    ) : null}
                    {p.marketplace_numero ? (
                      <div>
                        <dt className="text-neutral-500">Pedido marketplace</dt>
                        <dd className="font-mono text-xs sm:text-sm">{p.marketplace_numero}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-neutral-500">Ref. Olist</dt>
                      <dd className="font-mono text-xs sm:text-sm">{p.referencia_externa ?? "—"}</dd>
                    </div>
                    {p.tracking_codigo ? (
                      <div>
                        <dt className="text-neutral-500">Rastreio</dt>
                        <dd className="font-mono text-xs">{p.tracking_codigo}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-neutral-500">Envio</dt>
                      <dd>{p.metodo_envio ?? "—"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-neutral-500">Cliente / entrega</dt>
                      <dd>{comprador || "—"}</dd>
                      {p.comprador_fone ? <dd className="text-neutral-600 dark:text-neutral-400">{p.comprador_fone}</dd> : null}
                    </div>
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

                  {p.status === "enviado" && !p.tem_etiqueta && (
                      <button
                        type="button"
                        onClick={() => setEtiquetaModalPedidoId(p.id)}
                        className={cn(
                          AMBER_PREMIUM_SURFACE_TRANSPARENT,
                          "mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--muted)]/5",
                        )}
                      >
                        <span
                          className={cn(
                            AMBER_PREMIUM_SHELL,
                            AMBER_PREMIUM_TEXT_PRIMARY,
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          )}
                        >
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn(AMBER_PREMIUM_TEXT_PRIMARY, "block text-sm font-semibold")}>Etiqueta pendente</span>
                        </span>
                        <span
                          className={cn(
                            AMBER_PREMIUM_TEXT_PRIMARY,
                            "shrink-0 rounded-md border border-current px-2.5 py-1.5 text-[11px] font-semibold",
                          )}
                        >
                          Resolver
                        </span>
                      </button>
                    )}

                  {p.status === "pendente_estoque" ? (
                    <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                      Aguardando estoque no DropCore. O fornecedor precisa repor saldo ou sincronizar estoque da Olist.
                    </p>
                  ) : null}

                  {p.status === "bloqueado" && p.motivo_bloqueio ? (
                    <button
                      type="button"
                      onClick={() => setBloqueioModalPedidoId(p.id)}
                      className={cn(
                        DANGER_PREMIUM_SURFACE_TRANSPARENT,
                        "mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--muted)]/5",
                      )}
                    >
                      <span
                        className={cn(
                          DANGER_PREMIUM_SHELL,
                          DANGER_PREMIUM_TEXT_PRIMARY,
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        )}
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <circle cx="12" cy="12" r="10" />
                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "block text-sm font-semibold")}>Pedido bloqueado</span>
                      </span>
                      <span
                        className={cn(
                          DANGER_PREMIUM_TEXT_PRIMARY,
                          "shrink-0 rounded-md border border-current px-2.5 py-1.5 text-[11px] font-semibold",
                        )}
                      >
                        Resolver
                      </span>
                    </button>
                  ) : null}

                  {p.status === "erro_saldo" ? (
                    <div role="status" className={cn("relative mt-3 overflow-hidden rounded-xl", SELLER_SALDO_CRITICO_CARD_SURFACE)}>
                      <div className={SELLER_SALDO_CRITICO_ACCENT_BAR} aria-hidden />
                      <div className={SELLER_SALDO_CRITICO_INNER_PAD}>
                        <div className="flex flex-wrap items-center justify-between gap-3 py-3 pr-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span className={SELLER_SALDO_CRITICO_ICON_WRAP}>
                              <svg
                                className={SELLER_SALDO_CRITICO_ICON_STROKE}
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
                              <p className={SELLER_SALDO_CRITICO_TITLE}>Saldo insuficiente para este pedido</p>
                              <p className={SELLER_SALDO_CRITICO_BODY}>
                                Pedido não processado por falta de saldo na hora da venda.
                              </p>
                            </div>
                          </div>
                          <Link
                            href="/seller/dashboard?recarregar=1"
                            className="w-full shrink-0 rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-center text-[11px] font-semibold text-white shadow-sm transition-colors hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:hover:opacity-100 dark:shadow-red-950/50 dark:ring-1 dark:ring-inset dark:ring-white/20 sm:w-auto"
                          >
                            Recarregar créditos
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {p.is_reserva ? (
                    <p className="mt-3 text-sm text-neutral-500">
                      Aguardando confirmação de pagamento na Olist — assim que o cliente pagar, este pedido vira
                      um pedido de verdade aqui automaticamente, sem precisar fazer nada.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {!loading && pedidos.length > 0 ? (
          <div className="mt-4 flex flex-col items-center gap-3 pt-1 sm:flex-row sm:justify-between">
            <p className="text-xs text-[var(--muted)]">
              Total <span className="font-semibold text-[var(--foreground)]">{totalPedidos}</span> pedido{totalPedidos !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                aria-label="Página anterior"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              {getPageNumbers(page, Math.max(1, Math.ceil(totalPedidos / pageSize))).map((p, idx) =>
                p === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-[var(--muted)]">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    aria-current={p === page ? "page" : undefined}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-colors",
                      p === page
                        ? "bg-emerald-600 text-white"
                        : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                    )}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(Math.max(1, Math.ceil(totalPedidos / pageSize)), prev + 1))}
                disabled={page >= Math.max(1, Math.ceil(totalPedidos / pageSize))}
                aria-label="Próxima página"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <div className="relative ml-1.5 shrink-0">
                <div
                  aria-hidden
                  className="pointer-events-none flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                >
                  {pageSize}/página
                  <svg className="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
                <select
                  aria-label="Itens por página"
                  value={pageSize}
                  onChange={(e) => {
                    setPage(1);
                    setPageSize(Number(e.target.value));
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  <option value={20}>20/página</option>
                  <option value={50}>50/página</option>
                  <option value={100}>100/página</option>
                  <option value={300}>300/página</option>
                </select>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {etiquetaModalPedidoId && (() => {
        const p = pedidos.find((x) => x.id === etiquetaModalPedidoId);
        if (!p) return null;
        const modo = etiquetaModo[p.id] ?? "link";
        return (
          <ModalOverlay onBackdropClick={() => setEtiquetaModalPedidoId(null)} panelClassName="max-w-lg">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4">
              <h3 className="font-semibold text-[var(--foreground)]">Etiqueta não chegou automaticamente</h3>
              <button
                type="button"
                onClick={() => setEtiquetaModalPedidoId(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-[var(--muted)] hover:bg-[var(--muted)]/10"
              >
                ×
              </button>
            </div>
            <div className={cn(MODAL_PANEL_BODY_CLASS, "p-4")}>
              <AmberPremiumCallout title={modo === "link" ? "Cole o link da etiqueta" : "Envie o arquivo PDF da etiqueta"}>
                <div className="space-y-3">
                  <p>
                    {p.etiqueta_tentativas > 0
                      ? `Já tentamos buscar na Olist ${p.etiqueta_tentativas}x sem sucesso. `
                      : "Ainda não conseguimos buscar automaticamente na Olist. "}
                    Entre no painel da Olist e pegue a etiqueta deste pedido pra não travar o envio.{" "}
                    <strong className="text-[var(--foreground)]">
                      Se a Olist só baixar o PDF pro seu computador (sem te dar um link) — comum em pedidos
                      Shopee — use a opção &quot;Arquivo PDF&quot; abaixo.
                    </strong>
                  </p>
                  <p className="font-medium text-[var(--foreground)]">
                    Confira antes de enviar: o número do pedido na Olist tem que ser{" "}
                    <span className="font-mono">{p.referencia_externa ?? "—"}</span> — etiqueta de
                    pedido errado sai pro endereço/produto errado.
                  </p>

                  <div role="tablist" aria-label="Como enviar a etiqueta" className="inline-flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={modo === "link"}
                      onClick={() => setEtiquetaModo((prev) => ({ ...prev, [p.id]: "link" }))}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-[11px] font-medium transition",
                        modo === "link"
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
                      )}
                    >
                      Link
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={modo === "arquivo"}
                      onClick={() => setEtiquetaModo((prev) => ({ ...prev, [p.id]: "arquivo" }))}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-[11px] font-medium transition",
                        modo === "arquivo"
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
                      )}
                    >
                      Arquivo PDF
                    </button>
                  </div>

                  {modo === "link" ? (
                    <div className="flex flex-col gap-1.5 sm:flex-row">
                      <input
                        type="url"
                        placeholder="Cole aqui o link da etiqueta (https://...)"
                        value={etiquetaLinkInputs[p.id] ?? ""}
                        onChange={(e) =>
                          setEtiquetaLinkInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        disabled={etiquetaLinkSaving[p.id]}
                        className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-sm text-[var(--foreground)]"
                      />
                      <button
                        type="button"
                        onClick={() => salvarEtiquetaLink(p.id)}
                        disabled={etiquetaLinkSaving[p.id]}
                        className="w-full shrink-0 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 sm:w-auto"
                      >
                        {etiquetaLinkSaving[p.id] ? "Salvando..." : "Salvar link"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 sm:flex-row">
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) =>
                          setEtiquetaFileInputs((prev) => ({ ...prev, [p.id]: e.target.files?.[0] ?? null }))
                        }
                        disabled={etiquetaLinkSaving[p.id]}
                        className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-sm text-[var(--foreground)] file:mr-2 file:rounded file:border-0 file:bg-[var(--muted)]/15 file:px-2 file:py-1 file:text-xs file:font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => enviarEtiquetaArquivo(p.id)}
                        disabled={etiquetaLinkSaving[p.id]}
                        className="w-full shrink-0 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 sm:w-auto"
                      >
                        {etiquetaLinkSaving[p.id] ? "Enviando..." : "Enviar PDF"}
                      </button>
                    </div>
                  )}
                  {etiquetaLinkError[p.id] && (
                    <p className="text-[11px] text-[var(--danger)]">{etiquetaLinkError[p.id]}</p>
                  )}
                </div>
              </AmberPremiumCallout>
            </div>
          </ModalOverlay>
        );
      })()}

      {bloqueioModalPedidoId && (() => {
        const p = pedidos.find((x) => x.id === bloqueioModalPedidoId);
        if (!p) return null;
        const { href, limiteAtingido } = bloqueioResolverInfo(p);
        return (
          <ModalOverlay onBackdropClick={() => setBloqueioModalPedidoId(null)} panelClassName="max-w-lg">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4">
              <h3 className="font-semibold text-[var(--foreground)]">Pedido bloqueado</h3>
              <button
                type="button"
                onClick={() => setBloqueioModalPedidoId(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-[var(--muted)] hover:bg-[var(--muted)]/10"
              >
                ×
              </button>
            </div>
            <div className={cn(MODAL_PANEL_BODY_CLASS, "p-4")}>
              <div className={cn(DANGER_PREMIUM_SURFACE_TRANSPARENT, "rounded-xl p-4 space-y-3")}>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">{p.motivo_bloqueio}</p>
                <Link
                  href={href}
                  onClick={() => setBloqueioModalPedidoId(null)}
                  className={cn(
                    DANGER_PREMIUM_TEXT_PRIMARY,
                    "inline-flex items-center justify-center rounded-md border border-current px-3 py-2 text-sm font-semibold",
                  )}
                >
                  {limiteAtingido ? "Ver planos" : "Ir para o produto"}
                </Link>
              </div>
            </div>
          </ModalOverlay>
        );
      })()}
    </div>
  );
}
