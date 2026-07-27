"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
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

type PedidoItem = { sku: string; quantidade: number; nome_produto: string | null };

type Pedido = {
  id: string;
  nome_produto: string | null;
  valor_total: number;
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
  const destaqueId = searchParams.get("destaque");
  const pedidoRefs = useRef<Record<string, HTMLElement | null>>({});
  const [etiquetaLinkInputs, setEtiquetaLinkInputs] = useState<Record<string, string>>({});
  const [etiquetaLinkSaving, setEtiquetaLinkSaving] = useState<Record<string, boolean>>({});
  const [etiquetaLinkError, setEtiquetaLinkError] = useState<Record<string, string>>({});
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter]);

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
          titleExtra={
            <div className="relative ml-auto inline-flex shrink-0 sm:hidden">
              <div
                aria-hidden
                className="pointer-events-none inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[var(--surface-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
              >
                <svg className="h-2.5 w-2.5 shrink-0 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
                {statusFilter ? statusLabel[statusFilter] ?? statusFilter : "Todos"}
                <svg className="h-2.5 w-2.5 shrink-0 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
              <select
                aria-label="Filtrar por status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
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
          }
          right={
            <div className="relative hidden shrink-0 sm:inline-flex">
              <div
                aria-hidden
                className="pointer-events-none inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[var(--surface-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
              >
                <svg className="h-2.5 w-2.5 shrink-0 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                </svg>
                {statusFilter ? statusLabel[statusFilter] ?? statusFilter : "Todos"}
                <svg className="h-2.5 w-2.5 shrink-0 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
              <select
                id="filtro-status"
                aria-label="Filtrar por status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
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
          }
        />

        {error ? (
          <AmberPremiumCallout className="mb-4" title="Erro">
            {error}
          </AmberPremiumCallout>
        ) : null}

        {loading ? (
          <p className="text-sm text-neutral-500">Carregando pedidos…</p>
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
              const itensNomes = p.itens
                .map((i) => i.nome_produto?.trim())
                .filter((nome): nome is string => Boolean(nome));
              const skuList = p.itens.map((i) => i.sku).filter(Boolean).join(", ");
              const nomeEncontrado = p.nome_produto?.trim() || (itensNomes.length > 0 ? itensNomes.join(", ") : "");
              const titulo = nomeEncontrado || skuList || "Pedido";
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
                      <p className="font-medium text-[var(--foreground)]">{titulo}</p>
                      {nomeEncontrado && skuList ? (
                        <p className="mt-0.5 font-mono text-xs text-neutral-500">{skuList}</p>
                      ) : null}
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
                      <dd className="font-medium">
                        {p.is_reserva ? "—" : BRL.format(Number(p.valor_total ?? 0))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Pedido marketplace</dt>
                      <dd className="font-mono text-xs sm:text-sm">{p.marketplace_numero ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Ref. Olist</dt>
                      <dd className="font-mono text-xs sm:text-sm">{p.referencia_externa ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Rastreio</dt>
                      <dd className="font-mono text-xs">{p.tracking_codigo ?? "—"}</dd>
                    </div>
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

                  {p.itens.length > 0 ? (
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
      </main>

      {etiquetaModalPedidoId && (() => {
        const p = pedidos.find((x) => x.id === etiquetaModalPedidoId);
        if (!p) return null;
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
              <AmberPremiumCallout title="Cole o link da etiqueta">
                <div className="space-y-2">
                  <p>
                    {p.etiqueta_tentativas > 0
                      ? `Já tentamos buscar na Olist ${p.etiqueta_tentativas}x sem sucesso. `
                      : "Ainda não conseguimos buscar automaticamente na Olist. "}
                    Entre no painel da Olist, pegue o link da etiqueta deste pedido e cole abaixo pra
                    não travar o envio.
                  </p>
                  <p className="font-medium text-[var(--foreground)]">
                    Confira antes de colar: o número do pedido na Olist tem que ser{" "}
                    <span className="font-mono">{p.referencia_externa ?? "—"}</span> — etiqueta de
                    pedido errado sai pro endereço/produto errado.
                  </p>
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
