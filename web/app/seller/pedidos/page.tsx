"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { cn } from "@/lib/utils";

type PedidoItem = { sku: string; quantidade: number; nome_produto: string | null };

type Pedido = {
  id: string;
  nome_produto: string | null;
  valor_total: number;
  status: string;
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
  enviado: "Aguardando postagem",
  aguardando_repasse: "Postado",
  entregue: "Entregue",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
  erro_saldo: "Erro de saldo",
};

const STATUS_PENDENTE = cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY);

export default function SellerPedidosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");

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
                  className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--foreground)]">{titulo}</p>
                      <p className="mt-1 text-sm text-neutral-500">{formatDate(p.criado_em)}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                        p.status === "pendente_estoque" || p.status === "enviado"
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
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
