"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import {
  SELLER_SALDO_CRITICO_ACCENT_BAR,
  SELLER_SALDO_CRITICO_BODY,
  SELLER_SALDO_CRITICO_CARD_SURFACE,
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
};

const STATUS_PENDENTE = cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY);
const STATUS_BLOQUEADO = cn(DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY);

export default function SellerPedidosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const destaqueId = searchParams.get("destaque");
  const pedidoRefs = useRef<Record<string, HTMLElement | null>>({});

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

  useEffect(() => {
    if (destaqueId && pedidos.length > 0 && !loading) {
      const el = pedidoRefs.current[destaqueId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [destaqueId, pedidos, loading]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pb-24 md:pb-8">
      <SellerNav active="pedidos" />
      <main className="dropcore-shell-4xl mx-auto px-4 pt-20 sm:px-6 sm:pt-24">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Seus pedidos</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Pedidos importados da Olist e do ERP. O extrato financeiro continua no Dashboard.
          </p>
        </div>

        {error ? (
          <AmberPremiumCallout className="mb-4" title="Erro">
            {error}
          </AmberPremiumCallout>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-neutral-600 dark:text-neutral-400" htmlFor="filtro-status">
            Filtrar por status
          </label>
          <select
            id="filtro-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="pendente_estoque">Aguardando estoque</option>
            <option value="bloqueado">Bloqueado</option>
            <option value="enviado">Aguardando postagem</option>
            <option value="aguardando_repasse">Postados</option>
            <option value="entregue">Entregues</option>
            <option value="erro_saldo">Erro de saldo</option>
          </select>
        </div>

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
              const titulo =
                p.nome_produto?.trim() ||
                p.itens.map((i) => i.sku).join(", ") ||
                "Pedido";
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
                      <p className="mt-1 text-sm text-neutral-500">{formatDate(p.criado_em)}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                        p.status === "bloqueado" || p.status === "erro_saldo"
                          ? STATUS_BLOQUEADO
                          : p.status === "pendente_estoque" || p.status === "enviado"
                            ? STATUS_PENDENTE
                            : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      )}
                    >
                      {statusLabel[p.status] ?? p.status}
                    </span>
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-neutral-500">Custo total</dt>
                      <dd className="font-medium">{BRL.format(Number(p.valor_total ?? 0))}</dd>
                    </div>
                    {p.marketplace_numero ? (
                      <div>
                        <dt className="text-neutral-500">Pedido marketplace</dt>
                        <dd className="font-mono text-xs sm:text-sm">{p.marketplace_numero}</dd>
                      </div>
                    ) : null}
                    {p.referencia_externa ? (
                      <div>
                        <dt className="text-neutral-500">Ref. Olist</dt>
                        <dd className="font-mono text-xs sm:text-sm">{p.referencia_externa}</dd>
                      </div>
                    ) : null}
                    {comprador ? (
                      <div className="sm:col-span-2">
                        <dt className="text-neutral-500">Cliente / entrega</dt>
                        <dd>{comprador}</dd>
                        {p.comprador_fone ? <dd className="text-neutral-600 dark:text-neutral-400">{p.comprador_fone}</dd> : null}
                      </div>
                    ) : null}
                    {p.tracking_codigo ? (
                      <div>
                        <dt className="text-neutral-500">Rastreio</dt>
                        <dd className="font-mono text-xs">{p.tracking_codigo}</dd>
                      </div>
                    ) : null}
                    {p.metodo_envio ? (
                      <div>
                        <dt className="text-neutral-500">Envio</dt>
                        <dd>{p.metodo_envio}</dd>
                      </div>
                    ) : null}
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

                  {p.status === "pendente_estoque" ? (
                    <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                      Aguardando estoque no DropCore. O fornecedor precisa repor saldo ou sincronizar estoque da Olist.
                    </p>
                  ) : null}

                  {p.status === "bloqueado" && p.motivo_bloqueio ? (
                    <p className={cn("mt-3 text-sm", DANGER_PREMIUM_TEXT_PRIMARY)}>{p.motivo_bloqueio}</p>
                  ) : null}

                  {p.status === "erro_saldo" ? (
                    <div role="status" className={cn("relative mt-3 overflow-hidden rounded-xl p-3", SELLER_SALDO_CRITICO_CARD_SURFACE)}>
                      <div className={SELLER_SALDO_CRITICO_ACCENT_BAR} aria-hidden />
                      <div className="flex items-start gap-2.5 pl-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--danger)]/35 bg-[var(--danger)]/10 dark:border-red-400/55 dark:bg-transparent">
                          <svg
                            className="h-4 w-4 text-[var(--danger)] dark:text-red-300"
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
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold leading-snug tracking-tight text-[var(--danger)] dark:text-red-300">
                            Saldo insuficiente para este pedido
                          </p>
                          <p className={cn(SELLER_SALDO_CRITICO_BODY, "mt-1")}>
                            Pedido não processado por falta de saldo na hora da venda.
                          </p>
                          <Link
                            href="/seller/dashboard?recarregar=1"
                            className="mt-2.5 block w-full rounded-lg bg-[var(--danger)] px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:hover:opacity-100 dark:shadow-sm dark:shadow-red-950/50 dark:ring-1 dark:ring-inset dark:ring-white/20 sm:inline-block sm:w-auto sm:text-left"
                          >
                            Recarregar créditos
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
