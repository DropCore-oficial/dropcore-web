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
  INFO_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import { AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type Seller = { id: string; nome: string; documento: string | null };
type Fornecedor = { id: string; nome: string };
type Sku = {
  id: string;
  sku: string;
  nome_produto: string | null;
  custo_base: number | null;
  custo_dropcore: number | null;
  status?: string | null;
  cor?: string | null;
  tamanho?: string | null;
};
type Pedido = {
  id: string;
  seller_id: string;
  fornecedor_id: string;
  sku_id?: string | null;
  nome_produto?: string | null;
  valor_total: number;
  status: string;
  cancelado_motivo?: string | null;
  criado_em: string;
  seller_nome?: string;
  fornecedor_nome?: string;
  /** Pedido fictício (conta de teste) — nunca conta em soma real, só sinalizado aqui. */
  e_teste?: boolean;
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
  cancelado: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  produto_nao_vinculado: cn(INFO_PREMIUM_TEXT_PRIMARY, "bg-neutral-100 dark:bg-neutral-800/40"),
  anuncio_sem_sku: cn(AMBER_PREMIUM_TEXT_PRIMARY, "bg-[#fffbeb] dark:bg-amber-950/50"),
};
const STATUS_LABEL: Record<string, string> = {
  enviado: "Enviado (bloqueado)",
  aguardando_repasse: "Aguard. repasse",
  entregue: "Entregue",
  devolvido: "Devolvido",
  erro_saldo: "Erro (saldo insuf.)",
  cancelado: "Cancelado",
  produto_nao_vinculado: "Fora do catálogo",
  anuncio_sem_sku: "Anúncio sem SKU",
};
const STATUS_RESOLVIVEIS = ["produto_nao_vinculado", "anuncio_sem_sku"];

/** Números de página com reticências pra não estourar a barra quando há muitas páginas.
 * Mesmo padrão de web/app/seller/pedidos/page.tsx. */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

/** "Cancelado" sozinho não diferencia de admin cancelando manualmente — achado 2026-10-09:
 * cancelamento automático por sync com o Mercado Livre (ver fn_pedido_cancelar_estorno_ml)
 * precisa ficar óbvio na tabela, não só mais um "Cancelado" cinza igual aos outros. */
function statusLabelPedido(p: Pedido): string {
  if (p.status === "cancelado" && p.cancelado_motivo === "ml_sem_sync") return "Cancelado (ML)";
  return STATUS_LABEL[p.status] ?? p.status;
}

function statusTitlePedido(p: Pedido): string | undefined {
  if (p.status === "cancelado" && p.cancelado_motivo === "ml_sem_sync") {
    return "O Mercado Livre cancelou este pedido antes da postagem (etiqueta nunca liberada). Saldo bloqueado já foi estornado automaticamente pro seller.";
  }
  return undefined;
}

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [entregandoId, setEntregandoId] = useState<string | null>(null);
  const [resolverPedido, setResolverPedido] = useState<Pedido | null>(null);
  const [resolverSkus, setResolverSkus] = useState<Sku[]>([]);
  const [resolverSkusLoading, setResolverSkusLoading] = useState(false);
  const [resolverSkuId, setResolverSkuId] = useState("");
  const [resolverQtd, setResolverQtd] = useState("1");
  const [resolverSaving, setResolverSaving] = useState(false);
  const [resolverError, setResolverError] = useState<string | null>(null);

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
      const params = new URLSearchParams({
        status: statusFilter,
        page: String(page),
        limit: String(pageSize),
      });
      const pedRes = await fetch(`/api/org/pedidos?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pedJson = await pedRes.json();
      if (!pedRes.ok) {
        setLoading(false);
        return;
      }
      setOrgId(pedJson.org_id ?? "");
      setPedidos(Array.isArray(pedJson.pedidos) ? pedJson.pedidos : []);
      setTotalPedidos(typeof pedJson.total === "number" ? pedJson.total : 0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page, pageSize]);

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

  async function abrirResolver(p: Pedido) {
    setResolverPedido(p);
    setResolverSkuId("");
    setResolverQtd("1");
    setResolverError(null);
    setResolverSkusLoading(true);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/org/catalogo/search?fornecedorId=${encodeURIComponent(p.fornecedor_id)}&q=`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json();
      const lista = Array.isArray(json) ? json : (json?.items ?? []);
      setResolverSkus(lista.filter((s: Sku) => s.status === "ativo" || s.status === "Ativo"));
    } catch {
      setResolverSkus([]);
    } finally {
      setResolverSkusLoading(false);
    }
  }

  async function confirmarResolver() {
    if (!resolverPedido || !resolverSkuId) return;
    const qtd = Math.max(1, Math.floor(Number(resolverQtd)) || 1);
    setResolverSaving(true);
    setResolverError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/pedidos/${resolverPedido.id}/resolver-sku`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ sku_id: resolverSkuId, quantidade: qtd }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erro ao resolver pedido.");
      setSuccess("Pedido resolvido — entrou pelo pipeline normal (saldo/estoque/etiqueta).");
      setResolverPedido(null);
      load();
    } catch (e: unknown) {
      setResolverError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setResolverSaving(false);
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
        subtitle={
          <>
            Lista de pedidos enviados. Ao criar um novo pedido,{" "}
            <span className="font-medium text-[var(--foreground)]">o saldo do seller é bloqueado automaticamente</span>.
          </>
        }
        right={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-max sm:flex-nowrap sm:justify-end">
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
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
          {/* `style` em vez de classe: MODAL_PANEL_CLASS já embute `max-w-sm`, e `cn()` não
          desduplica — um 2º `max-w-*` perdia sempre pra `.max-w-sm` na ordem do CSS
          compilado (achado real 2026-10-14, esse modal nunca passou de 384px). */}
          <div
            className={cn(MODAL_PANEL_CLASS, "animate-fade-in-up animate-fade-in-up-delay-1")}
            style={{ maxWidth: "32rem" }}
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

      {resolverPedido && (
        <div
          className={cn(MODAL_OVERLAY_CLASS, "animate-fade-in-up")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-resolver-title"
          onClick={() => setResolverPedido(null)}
        >
          <div
            className={cn(MODAL_PANEL_CLASS, "animate-fade-in-up animate-fade-in-up-delay-1")}
            style={{ maxWidth: "32rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--card-border)] px-5 pb-4 pt-5">
              <h2 id="modal-resolver-title" className="text-base font-semibold text-[var(--foreground)]">
                Resolver pedido — escolher produto certo
              </h2>
              <button
                type="button"
                onClick={() => setResolverPedido(null)}
                aria-label="Fechar"
                className="-m-1 rounded p-1 text-xl leading-none text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-neutral-200"
              >
                ×
              </button>
            </div>
            <div className={cn(MODAL_PANEL_BODY_CLASS, "px-5 pb-5 pt-4")}>
              <div className="flex flex-col gap-4">
                <p className="text-sm text-[var(--muted)]">
                  {STATUS_LABEL[resolverPedido.status] ?? resolverPedido.status} — venda real de{" "}
                  <span className="font-medium text-[var(--foreground)]">{resolverPedido.seller_nome ?? "—"}</span> no
                  fornecedor <span className="font-medium text-[var(--foreground)]">{resolverPedido.fornecedor_nome ?? "—"}</span>.
                  Escolha qual produto do catálogo desse fornecedor é o certo.
                </p>
                <div>
                  <label className={labelClass}>Produto / SKU {resolverSkusLoading ? "(carregando...)" : "*"}</label>
                  <select
                    value={resolverSkuId}
                    onChange={(e) => setResolverSkuId(e.target.value)}
                    disabled={resolverSkusLoading}
                    className={inputClass}
                  >
                    <option value="">Selecione</option>
                    {resolverSkus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sku} — {s.nome_produto || "sem nome"} {s.cor ? `· ${s.cor}` : ""} {s.tamanho ? `· ${s.tamanho}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="max-w-[10rem]">
                  <label className={labelClass}>Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    value={resolverQtd}
                    onChange={(e) => setResolverQtd(e.target.value)}
                    className={inputClass}
                  />
                </div>
                {resolverError && (
                  <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "text-sm")}>{resolverError}</p>
                )}
                <button
                  type="button"
                  onClick={confirmarResolver}
                  disabled={resolverSaving || !resolverSkuId}
                  className={cn(btnPrimaryCompactClass, "self-start")}
                >
                  {resolverSaving ? "Resolvendo..." : "Resolver pedido"}
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
                    <td className="px-4 py-3">
                      {p.fornecedor_nome ?? "—"}
                      {p.e_teste ? (
                        <span
                          className="ml-1.5 inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400"
                          title="Pedido de conta de teste — não conta em repasse ou saldo real."
                        >
                          teste
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={p.nome_produto ? "text-[var(--foreground)]" : "text-[var(--muted)]"}>
                        {p.nome_produto ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(p.valor_total)}</td>
                    <td className="px-4 py-3">
                      <span
                        title={statusTitlePedido(p)}
                        className={cn(
                          "inline-flex w-36 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                          STATUS_PILL[p.status] ?? "bg-neutral-100 text-[var(--muted)] dark:bg-neutral-800"
                        )}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                        {statusLabelPedido(p)}
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
                        {STATUS_RESOLVIVEIS.includes(p.status) && (
                          <button
                            type="button"
                            onClick={() => abrirResolver(p)}
                            className={btnPrimaryCompactClass}
                          >
                            Resolver
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
                  {p.e_teste ? " · teste" : ""}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--muted)]">{formatDate(p.criado_em)}</span>
                  <span
                    title={statusTitlePedido(p)}
                    className={cn(
                      "inline-flex w-36 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                      STATUS_PILL[p.status] ?? "bg-neutral-100 text-[var(--muted)] dark:bg-neutral-800"
                    )}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                    {statusLabelPedido(p)}
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
                {STATUS_RESOLVIVEIS.includes(p.status) && (
                  <button type="button" onClick={() => abrirResolver(p)} className={cn(btnPrimaryCompactClass, "mt-2 w-full")}>
                    Resolver
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      </section>

      {!loading && pedidos.length > 0 ? (
        <div className="flex flex-col items-center gap-3 pt-1 sm:flex-row sm:justify-between">
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
                <path d="m9 18 6-6 6-6" />
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
    </div>
  );
}
