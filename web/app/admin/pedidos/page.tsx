"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PlanLimitsBadge, PLAN_LIMITS_REFRESH_EVENT } from "@/components/PlanLimitsBadge";
import { IconClipboard } from "@/components/seller/Icons";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import {
  SUCCESS_PREMIUM_SURFACE,
  SUCCESS_PREMIUM_TEXT_PRIMARY,
  DANGER_PREMIUM_SURFACE,
  DANGER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import { AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type Seller = { id: string; nome: string; documento: string | null };
type Fornecedor = { id: string; nome: string };
type Sku = { id: string; sku: string; nome_produto: string | null; custo_base: number | null; custo_dropcore: number | null; status?: string | null };
type Pedido = {
  id: string;
  seller_id: string;
  fornecedor_id: string;
  sku_id?: string | null;
  nome_produto?: string | null;
  valor_total: number;
  status: string;
  criado_em: string;
  seller_nome?: string;
  fornecedor_nome?: string;
};

const inputClass =
  "w-full max-w-xs rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-emerald-500";
const labelClass = "block text-xs font-medium text-[var(--muted)] mb-1";
// Ação compacta de toolbar/cabeçalho de lista — mesmo padrão de
// web/components/fornecedor/FornecedorImportEstoquePanel.tsx (teste em /admin/pedidos
// antes de virar padrão de skill/design system para o resto do sistema).
const btnSecondaryCompactClass =
  "rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10";
const btnPrimaryCompactClass =
  "rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60";

// Status = informação, não ação: sem borda (borda é a assinatura visual de botão nesta
// tela), fundo suave + bolinha (bg-current) na cor do texto em vez de pílula com contorno.
const STATUS_PILL: Record<string, string> = {
  enviado: cn(AMBER_PREMIUM_TEXT_PRIMARY, "bg-[#fffbeb] dark:bg-amber-950/50"),
  aguardando_repasse: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  entregue: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  devolvido: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  erro_saldo: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  cancelado: "bg-neutral-100 text-[var(--muted)] dark:bg-neutral-800",
};
const STATUS_LABEL: Record<string, string> = {
  enviado: "Enviado (bloqueado)",
  aguardando_repasse: "Aguard. repasse",
  entregue: "Entregue",
  devolvido: "Devolvido",
  erro_saldo: "Erro (saldo insuf.)",
  cancelado: "Cancelado",
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PedidosPage() {
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sellerId, setSellerId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [skuId, setSkuId] = useState("");
  const [skus, setSkus] = useState<Sku[]>([]);
  const [skusLoading, setSkusLoading] = useState(false);
  const [valorFornecedor, setValorFornecedor] = useState("");
  const [valorDropcore, setValorDropcore] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [entregandoId, setEntregandoId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const token = session.access_token;
      const pedRes = await fetch(`/api/org/pedidos?status=${encodeURIComponent(statusFilter)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pedJson = await pedRes.json();
      if (!pedRes.ok) {
        setLoading(false);
        return;
      }
      setOrgId(pedJson.org_id ?? "");
      setPedidos(Array.isArray(pedJson.pedidos) ? pedJson.pedidos : []);
      setSellers(Array.isArray(pedJson.sellers) ? pedJson.sellers : []);
      setFornecedores(
        Array.isArray(pedJson.fornecedores) ? pedJson.fornecedores.filter((f: Fornecedor) => f.id && f.nome) : []
      );
    } catch {
      setError("Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function loadSkus(fornId: string) {
    if (!fornId || !orgId) { setSkus([]); setSkuId(""); return; }
    setSkusLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/org/catalogo/search?orgId=${encodeURIComponent(orgId)}&fornecedorId=${encodeURIComponent(fornId)}&q=`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json();
      // API retorna { ok, items, count }
      const lista = Array.isArray(json) ? json : (json?.items ?? []);
      setSkus(lista.filter((s: Sku) => s.status === "ativo" || s.status === "Ativo"));
    } catch {
      setSkus([]);
    } finally {
      setSkusLoading(false);
    }
  }

  function handleFornecedorChange(id: string) {
    setFornecedorId(id);
    setSkuId("");
    setValorFornecedor("");
    setValorDropcore("");
    loadSkus(id);
  }

  function handleSkuChange(id: string) {
    setSkuId(id);
    if (!id) { setValorFornecedor(""); setValorDropcore(""); return; }
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    const custoBase = sku.custo_base ?? 0;
    const custoDropcore = sku.custo_dropcore ?? 0;
    const margemDropcore = Math.max(0, custoDropcore - custoBase);
    setValorFornecedor(custoBase.toFixed(2).replace(".", ","));
    setValorDropcore(margemDropcore.toFixed(2).replace(".", ","));
  }

  async function confirmarEnvio(pedidoId: string) {
    setEntregandoId(pedidoId);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/pedidos/${pedidoId}/entregar`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setSuccess(`Envio confirmado! Pedido entra no repasse de ${json.ciclo_repasse ?? "—"}.`);
        load();
      } else {
        setError(json?.error || "Erro ao confirmar envio.");
      }
    } catch {
      setError("Erro ao confirmar envio.");
    } finally {
      setEntregandoId(null);
    }
  }

  async function enviar() {
    const vF = parseFloat(String(valorFornecedor).replace(",", "."));
    const vD = parseFloat(String(valorDropcore).replace(",", "."));
    if (!sellerId || !fornecedorId) {
      setError("Selecione seller e fornecedor.");
      return;
    }
    if (!Number.isFinite(vF) || vF < 0 || !Number.isFinite(vD) || vD < 0 || vF + vD <= 0) {
      setError("Valores inválidos. Use valor fornecedor e valor DropCore (ex.: 30 e 4,50).");
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/org/pedidos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          seller_id: sellerId,
          fornecedor_id: fornecedorId,
          valor_fornecedor: vF,
          valor_dropcore: vD,
          sku_id: skuId || null,
          nome_produto: skuId ? (skus.find(s => s.id === skuId)?.nome_produto ?? skus.find(s => s.id === skuId)?.sku ?? null) : null,
          preco_venda: precoVenda ? parseFloat(precoVenda.replace(",", ".")) : null,
        }),
      });
      const json = await res.json();
      if (res.status === 402 && json?.code === "SALDO_INSUFICIENTE") {
        setError(
          `Saldo insuficiente. Disponível: ${formatMoney(json.saldo_disponivel ?? 0)}. Necessário: ${formatMoney(json.valor_total ?? 0)}.`
        );
        return;
      }
      if (!res.ok) {
        setError(json?.error || "Erro ao criar pedido.");
        return;
      }
      setSuccess(
        `Pedido criado e saldo bloqueado. Valor total: ${formatMoney(json.valor_total ?? vF + vD)}. Ciclo repasse: ${json.ciclo_repasse ?? "—"}.`
      );
      setValorFornecedor("");
      setValorDropcore("");
      setShowForm(false);
      window.dispatchEvent(new Event(PLAN_LIMITS_REFRESH_EVENT));
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSending(false);
    }
  }


  if (loading) {
    return (
      <div className="dropcore-shell-6xl pt-6 pb-10 md:pb-12">
        <p className="text-sm text-[var(--muted)]">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="dropcore-shell-6xl space-y-5 pt-6 pb-10 md:pb-12">
      <AdminPageHeader
        eyebrow="Operação"
        title="Pedidos"
        titleExtra={<PlanLimitsBadge />}
        subtitle="Lista de pedidos enviados. Ao criar um novo pedido, o saldo do seller é bloqueado automaticamente."
        right={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-max sm:flex-nowrap sm:justify-end">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[1.875rem] flex-1 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] sm:w-36 sm:flex-none"
            >
              <option value="">Todos</option>
              <option value="enviado">Enviado (bloqueado)</option>
              <option value="aguardando_repasse">Aguardando repasse</option>
              <option value="entregue">Entregue</option>
              <option value="devolvido">Devolvido</option>
              <option value="cancelado">Cancelado</option>
              <option value="erro_saldo">Erro saldo</option>
            </select>
            <button
              type="button"
              onClick={() => router.push("/admin/devolucoes")}
              className={cn(btnSecondaryCompactClass, "flex-1 sm:flex-none")}
            >
              Bloqueios e devoluções
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={cn(btnPrimaryCompactClass, "inline-flex w-full items-center justify-center gap-1.5 sm:w-auto")}
            >
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Novo pedido
            </button>
          </div>
        }
      />

      {error && (
        <div className={cn(DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-xl px-4 py-3 text-sm mb-4")}>
          {error}
        </div>
      )}
      {success && (
        <div className={cn(SUCCESS_PREMIUM_SURFACE, SUCCESS_PREMIUM_TEXT_PRIMARY, "rounded-xl px-4 py-3 text-sm mb-4")}>
          {success}
        </div>
      )}

      {showForm && (
        <div
          className={cn(MODAL_OVERLAY_CLASS, "animate-fade-in-up")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-novo-pedido-title"
          onClick={() => setShowForm(false)}
        >
          <div
            className={cn(MODAL_PANEL_CLASS, "max-w-lg animate-fade-in-up animate-fade-in-up-delay-1")}
            onClick={(e) => e.stopPropagation()}
          >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--card-border)] px-5 pb-4 pt-5">
            <h2 id="modal-novo-pedido-title" className="text-base font-semibold text-[var(--foreground)]">
              Criar pedido (bloquear saldo)
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              aria-label="Fechar"
              className="-m-1 rounded p-1 text-xl leading-none text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-neutral-200"
            >
              ×
            </button>
          </div>
          <div className={cn(MODAL_PANEL_BODY_CLASS, "px-5 pb-5 pt-4")}>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Seller *</label>
              <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={inputClass}>
                <option value="">Selecione</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} {s.documento ? `(${s.documento})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Fornecedor *</label>
              <select value={fornecedorId} onChange={(e) => handleFornecedorChange(e.target.value)} className={inputClass}>
                <option value="">Selecione</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            {fornecedorId && (
              <div>
                <label className={labelClass}>
                  Produto / SKU {skusLoading ? "(carregando...)" : "(opcional)"}
                </label>
                <select
                  value={skuId}
                  onChange={(e) => handleSkuChange(e.target.value)}
                  disabled={skusLoading}
                  className={inputClass}
                >
                  <option value="">Sem produto específico</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome_produto || s.sku} — R$ {(s.custo_dropcore ?? 0).toFixed(2).replace(".", ",")}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>
                Preço de venda ao cliente (R$) <span className="text-[var(--muted)]">— visível só para o seller</span>
              </label>
              <input
                type="text"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(e.target.value)}
                placeholder="Ex: 89,90"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-xs">
              <div>
                <label className={labelClass}>Valor fornecedor (R$)</label>
                <input
                  type="text"
                  value={valorFornecedor}
                  onChange={(e) => setValorFornecedor(e.target.value)}
                  placeholder="Ex: 30"
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className={labelClass}>Valor DropCore (R$)</label>
                <input
                  type="text"
                  value={valorDropcore}
                  onChange={(e) => setValorDropcore(e.target.value)}
                  placeholder="Ex: 4,50"
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Total debitado = valor fornecedor + valor DropCore (ex.: 15% sobre o custo).
            </p>
            <button type="button" onClick={enviar} disabled={sending} className={cn(btnPrimaryCompactClass, "self-start")}>
              {sending ? "Enviando..." : "Criar pedido e bloquear saldo"}
            </button>
          </div>
          </div>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
      {pedidos.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
            <IconClipboard className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Nenhum pedido encontrado</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">Clique em &quot;Novo pedido&quot; para criar.</p>
        </div>
      ) : (
        <>
          {/* Desktop/tablet: tabela */}
          <div className="hidden sm:block dropcore-scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] bg-[var(--muted)]/10 text-left text-xs text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Seller</th>
                  <th className="px-4 py-3 font-medium">Fornecedor</th>
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--card-border)]/60 transition-colors hover:bg-[var(--muted)]/8">
                    <td className="px-4 py-3 text-[var(--muted)]">{formatDate(p.criado_em)}</td>
                    <td className="px-4 py-3">{p.seller_nome ?? "—"}</td>
                    <td className="px-4 py-3">{p.fornecedor_nome ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={p.nome_produto ? "text-[var(--foreground)]" : "text-[var(--muted)]"}>
                        {p.nome_produto ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(p.valor_total)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex w-36 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                          STATUS_PILL[p.status] ?? "bg-neutral-100 text-[var(--muted)] dark:bg-neutral-800"
                        )}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {p.status === "enviado" && (
                          <button
                            type="button"
                            onClick={() => confirmarEnvio(p.id)}
                            disabled={entregandoId === p.id}
                            title="Confirma o envio no lugar do fornecedor (uso excepcional)"
                            className="whitespace-nowrap rounded-md bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-amber-600/20 transition-colors hover:bg-amber-700 disabled:opacity-50"
                          >
                            {entregandoId === p.id ? "Confirmando..." : "↑ Confirmar envio"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards empilhados (tabela de 7 colunas não cabe em ~390px) */}
          <div className="sm:hidden divide-y divide-[var(--card-border)]/60">
            {pedidos.map((p) => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--foreground)] truncate">{p.seller_nome ?? "—"}</span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--foreground)] shrink-0">{formatMoney(p.valor_total)}</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)] truncate">
                  {p.fornecedor_nome ?? "—"}
                  {p.nome_produto ? ` · ${p.nome_produto}` : ""}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--muted)]">{formatDate(p.criado_em)}</span>
                  <span
                    className={cn(
                      "inline-flex w-36 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                      STATUS_PILL[p.status] ?? "bg-neutral-100 text-[var(--muted)] dark:bg-neutral-800"
                    )}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                {p.status === "enviado" && (
                  <button
                    type="button"
                    onClick={() => confirmarEnvio(p.id)}
                    disabled={entregandoId === p.id}
                    title="Confirma o envio no lugar do fornecedor (uso excepcional)"
                    className="mt-2 w-full rounded-md bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-amber-600/20 transition-colors hover:bg-amber-700 disabled:opacity-50"
                  >
                    {entregandoId === p.id ? "Confirmando..." : "↑ Confirmar envio"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      </section>
    </div>
  );
}
