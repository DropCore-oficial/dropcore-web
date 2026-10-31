"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import {
  SUCCESS_PREMIUM_SURFACE,
  SUCCESS_PREMIUM_TEXT_PRIMARY,
  DANGER_PREMIUM_SURFACE,
  DANGER_PREMIUM_TEXT_PRIMARY,
  INFO_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import { AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type LedgerItem = {
  id: string;
  seller_id: string;
  seller_nome: string;
  fornecedor_nome: string;
  tipo: string;
  valor_total: number;
  status: string;
  data_evento: string;
  ciclo_repasse: string | null;
  pedido_id: string | null;
  debito_ja_registrado?: boolean;
  em_devolucao_desde?: string | null;
  fornecedor_contestou_em?: string | null;
  fornecedor_contestacao_texto?: string | null;
  fornecedor_contestacao_foto_url?: string | null;
};

const PRAZO_FORNECEDOR_HORAS = 48;

function formatPrazoCurto(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Mostra o prazo de 48h do fornecedor (ou a contestação, se já contestou) — só faz sentido
 * pra linha EM_DEVOLUCAO; nas demais não renderiza nada. */
function DevolucaoPrazoInfo({ r }: { r: LedgerItem }) {
  if (r.status !== "EM_DEVOLUCAO") return null;
  if (r.fornecedor_contestou_em) {
    return (
      <div className="mt-1 max-w-[220px] text-[11px] text-[var(--danger)]">
        <p className="font-semibold">Fornecedor contestou:</p>
        <p className="line-clamp-2">{r.fornecedor_contestacao_texto ?? "—"}</p>
        {r.fornecedor_contestacao_foto_url ? (
          <a href={r.fornecedor_contestacao_foto_url} target="_blank" rel="noopener noreferrer" className="underline">
            Ver foto ↗
          </a>
        ) : null}
      </div>
    );
  }
  if (r.em_devolucao_desde) {
    const prazoFinal = new Date(new Date(r.em_devolucao_desde).getTime() + PRAZO_FORNECEDOR_HORAS * 60 * 60 * 1000);
    return <p className="mt-1 text-[11px] text-[var(--muted)]">Prazo fornecedor: {formatPrazoCurto(prazoFinal.toISOString())}</p>;
  }
  return null;
}

type DebitoPendenteItem = {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string | null;
  valor_fornecedor: number;
  ciclo_a_descontar: string;
  criado_em: string;
  seller_id: string | null;
  seller_nome: string | null;
  pedido_id: string | null;
};

const btnPrimaryCompactClass =
  "rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60";
const btnSecondaryCompactClass =
  "rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-60";
const btnDangerCompactClass =
  "rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500 dark:hover:bg-red-400";

/** Status crus do `financial_ledger` — nunca mostrar sem traduzir (achado da crítica 2026-10-12). */
const LEDGER_STATUS_LABEL: Record<string, string> = {
  BLOQUEADO: "Bloqueado",
  ENTREGUE: "Entregue",
  AGUARDANDO_REPASSE: "Aguard. repasse",
  EM_DEVOLUCAO: "Em devolução",
  DEVOLVIDO: "Devolvido",
  PAGO: "Pago",
};
const LEDGER_STATUS_PILL: Record<string, string> = {
  BLOQUEADO: cn(AMBER_PREMIUM_TEXT_PRIMARY, "bg-[#fffbeb] dark:bg-amber-950/50"),
  ENTREGUE: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  AGUARDANDO_REPASSE: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  EM_DEVOLUCAO: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  DEVOLVIDO: cn(INFO_PREMIUM_TEXT_PRIMARY, "bg-neutral-100 dark:bg-neutral-800/40"),
  PAGO: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-32 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        LEDGER_STATUS_PILL[status] ?? "bg-neutral-100 text-[var(--muted)] dark:bg-neutral-800"
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {LEDGER_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateCiclo(s: string) {
  if (!s) return "—";
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DevolucoesPage() {
  const router = useRouter();
  const [list, setList] = useState<LedgerItem[]>([]);
  const [listPago, setListPago] = useState<LedgerItem[]>([]);
  const [debitosPendentes, setDebitosPendentes] = useState<DebitoPendenteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingDebitoId, setUpdatingDebitoId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; mensagem: string; onConfirmar: () => void } | null>(
    null
  );

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
      const res = await fetch("/api/org/financial/ledger?include_pago=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Erro ao carregar.");
        setList([]);
        setListPago([]);
      } else {
        setList(Array.isArray(data.items) ? data.items : []);
        setListPago(Array.isArray(data.items_pago) ? data.items_pago : []);
      }

      const resDebitos = await fetch("/api/org/financial/debitos-pendentes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dataDebitos = await resDebitos.json();
      setDebitosPendentes(resDebitos.ok && Array.isArray(dataDebitos.items) ? dataDebitos.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setList([]);
      setListPago([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function confirmarEnvio(ledgerId: string, pedidoId: string | null) {
    setConfirmacao(null);
    if (!pedidoId) {
      setMessage({ type: "err", text: "Pedido não encontrado para este registro." });
      return;
    }
    setUpdatingId(ledgerId);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      // Rota só aceita PATCH (achado 2026-10-12: "Confirmar envio" aqui nunca funcionou, dava 405).
      const res = await fetch(`/api/org/pedidos/${pedidoId}/entregar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: json.mensagem || "Envio confirmado. Pedido movido para repasse." });
        load();
      } else {
        setMessage({ type: "err", text: json?.error || "Erro ao confirmar envio." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setUpdatingId(null);
    }
  }

  async function patchStatus(ledgerId: string, status: string) {
    setConfirmacao(null);
    setUpdatingId(ledgerId);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/financial/ledger/${ledgerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: json.mensagem || `Status atualizado para ${LEDGER_STATUS_LABEL[status] ?? status}.` });
        load();
      } else {
        setMessage({ type: "err", text: json?.error || "Erro ao atualizar." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setUpdatingId(null);
    }
  }

  async function registrarDebitoPosRepasse(ledgerId: string) {
    setConfirmacao(null);
    setUpdatingDebitoId(ledgerId);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/org/financial/devolucao-pos-repasse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ledger_id: ledgerId }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: json.mensagem || "Débito registrado. Será descontado no próximo repasse." });
        load();
      } else {
        setMessage({ type: "err", text: json?.error || "Erro ao registrar." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setUpdatingDebitoId(null);
    }
  }

  function askConfirmarEnvio(r: LedgerItem) {
    setConfirmacao({
      titulo: "Confirmar envio no lugar do fornecedor?",
      mensagem: `${r.seller_nome} — ${r.fornecedor_nome}, ${formatMoney(r.valor_total)}. Uso excepcional: confirma que o pedido foi enviado sem o fornecedor ter feito isso no portal dele.`,
      onConfirmar: () => void confirmarEnvio(r.id, r.pedido_id),
    });
  }

  function askRegistrarDevolucao(r: LedgerItem) {
    setConfirmacao({
      titulo: "Registrar devolução?",
      mensagem: `${r.seller_nome} — ${r.fornecedor_nome}, ${formatMoney(r.valor_total)}. Marca que o item está voltando pro fornecedor — use só depois de confirmar isso com o fornecedor.`,
      onConfirmar: () => void patchStatus(r.id, "EM_DEVOLUCAO"),
    });
  }

  async function manterVenda(ledgerId: string) {
    setConfirmacao(null);
    setUpdatingId(ledgerId);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/org/financial/ledger/${ledgerId}/manter-venda`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: json.mensagem || "Devolução revertida." });
        load();
      } else {
        setMessage({ type: "err", text: json?.error || "Erro ao reverter." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setUpdatingId(null);
    }
  }

  function askManterVenda(r: LedgerItem) {
    setConfirmacao({
      titulo: "Devolução não procede?",
      mensagem: `${r.seller_nome} — ${r.fornecedor_nome}, ${formatMoney(r.valor_total)}. Reverte a devolução — a venda volta pro fluxo normal de repasse pro fornecedor, nada volta pro saldo do seller. Use só quando o fornecedor tinha razão.`,
      onConfirmar: () => void manterVenda(r.id),
    });
  }

  function askFornecedorConferiu(r: LedgerItem) {
    setConfirmacao({
      titulo: "Fornecedor conferiu a devolução?",
      mensagem: `${r.seller_nome} — ${r.fornecedor_nome}, ${formatMoney(r.valor_total)}. Libera o valor de volta pro saldo do seller. Só confirme depois do fornecedor confirmar que recebeu o item de volta.`,
      onConfirmar: () => void patchStatus(r.id, "DEVOLVIDO"),
    });
  }

  function askRegistrarDebito(r: LedgerItem) {
    setConfirmacao({
      titulo: "Registrar débito pro próximo repasse?",
      mensagem: `${r.fornecedor_nome} vai ter ${formatMoney(r.valor_total)} descontado do próximo repasse por causa de uma devolução depois do pagamento já feito.`,
      onConfirmar: () => void registrarDebitoPosRepasse(r.id),
    });
  }

  const algumaAcaoEmAndamento = updatingId !== null || updatingDebitoId !== null;

  if (loading && list.length === 0 && listPago.length === 0) {
    return (
      <div className="dropcore-shell-6xl space-y-5 pt-6 pb-5 md:pb-7">
        <p className="text-sm text-[var(--muted)]">Carregando bloqueios...</p>
      </div>
    );
  }

  return (
    <div className="dropcore-shell-6xl space-y-5 pt-6 pb-5 md:pb-7">
      <AdminPageHeader
        eyebrow="Operação"
        title="Bloqueios e devoluções"
        subtitle={
          <>
            Lista de bloqueios ativos. Use &quot;Registrar devolução&quot; quando o item voltar; depois
            &quot;Fornecedor conferiu&quot; para liberar o valor de volta ao seller.
          </>
        }
        right={
          <button type="button" onClick={() => load()} disabled={loading} className={btnSecondaryCompactClass}>
            {loading ? "Atualizando..." : "Atualizar lista"}
          </button>
        }
      />

      {message && (
        <div
          className={cn(
            message.type === "ok" ? SUCCESS_PREMIUM_SURFACE : DANGER_PREMIUM_SURFACE,
            message.type === "ok" ? SUCCESS_PREMIUM_TEXT_PRIMARY : DANGER_PREMIUM_TEXT_PRIMARY,
            "rounded-xl px-4 py-3 text-sm"
          )}
        >
          {message.text}
        </div>
      )}
      {error && (
        <div className={cn(DANGER_PREMIUM_SURFACE, DANGER_PREMIUM_TEXT_PRIMARY, "rounded-xl px-4 py-3 text-sm")}>
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--card-border)] px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Bloqueios ativos</h2>
        </div>
        {list.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--muted)] sm:px-5">
            Nenhum bloqueio com status Bloqueado, Entregue, Aguardando repasse ou Em devolução.
          </p>
        ) : (
          <>
            <div className="hidden sm:block dropcore-scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)] bg-[var(--muted)]/10 text-left text-xs text-[var(--muted)]">
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Seller</th>
                    <th className="px-4 py-3 font-medium">Fornecedor</th>
                    <th className="px-4 py-3 font-medium text-right">Valor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--card-border)]/60 transition-colors hover:bg-[var(--muted)]/8">
                      <td className="px-4 py-3 text-[var(--muted)]">{formatDate(r.data_evento)}</td>
                      <td className="px-4 py-3">{r.seller_nome}</td>
                      <td className="px-4 py-3">{r.fornecedor_nome}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatMoney(r.valor_total)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                        <DevolucaoPrazoInfo r={r} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {r.status === "BLOQUEADO" && (
                            <button
                              type="button"
                              onClick={() => askConfirmarEnvio(r)}
                              disabled={algumaAcaoEmAndamento}
                              title="Confirma o envio no lugar do fornecedor (uso excepcional)"
                              className="whitespace-nowrap rounded-md bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-amber-600/20 transition-colors hover:bg-amber-700 disabled:opacity-50"
                            >
                              {updatingId === r.id ? "..." : "Confirmar envio"}
                            </button>
                          )}
                          {["BLOQUEADO", "ENTREGUE", "AGUARDANDO_REPASSE"].includes(r.status) && (
                            <button type="button" onClick={() => askRegistrarDevolucao(r)} disabled={algumaAcaoEmAndamento} className={btnDangerCompactClass}>
                              {updatingId === r.id ? "..." : "Registrar devolução"}
                            </button>
                          )}
                          {r.status === "EM_DEVOLUCAO" && (
                            <>
                              <button type="button" onClick={() => askFornecedorConferiu(r)} disabled={algumaAcaoEmAndamento} className={btnPrimaryCompactClass}>
                                {updatingId === r.id ? "..." : "Fornecedor conferiu"}
                              </button>
                              <button type="button" onClick={() => askManterVenda(r)} disabled={algumaAcaoEmAndamento} className={btnSecondaryCompactClass}>
                                {updatingId === r.id ? "..." : "Devolução não procede"}
                              </button>
                            </>
                          )}
                          {r.status === "DEVOLVIDO" && <span className="text-xs text-[var(--muted)]">Concluído</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden divide-y divide-[var(--card-border)]/60">
              {list.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">{r.seller_nome}</span>
                    <span className="text-sm font-semibold tabular-nums text-[var(--foreground)] shrink-0">{formatMoney(r.valor_total)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)] truncate">{r.fornecedor_nome}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--muted)]">{formatDate(r.data_evento)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <DevolucaoPrazoInfo r={r} />
                  <div className="mt-2 flex flex-col gap-1.5">
                    {r.status === "BLOQUEADO" && (
                      <button
                        type="button"
                        onClick={() => askConfirmarEnvio(r)}
                        disabled={algumaAcaoEmAndamento}
                        className="w-full rounded-md bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-amber-600/20 transition-colors hover:bg-amber-700 disabled:opacity-50"
                      >
                        {updatingId === r.id ? "..." : "Confirmar envio"}
                      </button>
                    )}
                    {["BLOQUEADO", "ENTREGUE", "AGUARDANDO_REPASSE"].includes(r.status) && (
                      <button type="button" onClick={() => askRegistrarDevolucao(r)} disabled={algumaAcaoEmAndamento} className={cn(btnDangerCompactClass, "w-full")}>
                        {updatingId === r.id ? "..." : "Registrar devolução"}
                      </button>
                    )}
                    {r.status === "EM_DEVOLUCAO" && (
                      <>
                        <button type="button" onClick={() => askFornecedorConferiu(r)} disabled={algumaAcaoEmAndamento} className={cn(btnPrimaryCompactClass, "w-full")}>
                          {updatingId === r.id ? "..." : "Fornecedor conferiu"}
                        </button>
                        <button type="button" onClick={() => askManterVenda(r)} disabled={algumaAcaoEmAndamento} className={cn(btnSecondaryCompactClass, "w-full")}>
                          {updatingId === r.id ? "..." : "Devolução não procede"}
                        </button>
                      </>
                    )}
                    {r.status === "DEVOLVIDO" && <span className="text-xs text-[var(--muted)]">Concluído</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--card-border)] px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Devolução após o repasse</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Registros já pagos. Se o cliente devolveu depois do repasse, registre o débito para descontar no próximo repasse (fornecedor + DropCore).
          </p>
        </div>
        {listPago.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--muted)] sm:px-5">Nenhum registro pago no momento.</p>
        ) : (
          <>
            <div className="hidden sm:block dropcore-scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)] bg-[var(--muted)]/10 text-left text-xs text-[var(--muted)]">
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Seller</th>
                    <th className="px-4 py-3 font-medium">Fornecedor</th>
                    <th className="px-4 py-3 font-medium text-right">Valor</th>
                    <th className="px-4 py-3 font-medium">Ciclo</th>
                    <th className="px-4 py-3 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {listPago.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--card-border)]/60 transition-colors hover:bg-[var(--muted)]/8">
                      <td className="px-4 py-3 text-[var(--muted)]">{formatDate(r.data_evento)}</td>
                      <td className="px-4 py-3">{r.seller_nome}</td>
                      <td className="px-4 py-3">{r.fornecedor_nome}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatMoney(r.valor_total)}</td>
                      <td className="px-4 py-3">{r.ciclo_repasse ? formatDateCiclo(r.ciclo_repasse) : "—"}</td>
                      <td className="px-4 py-3">
                        {r.debito_ja_registrado ? (
                          <span className="text-xs text-[var(--muted)]">✓ Débito registrado</span>
                        ) : (
                          <button type="button" onClick={() => askRegistrarDebito(r)} disabled={algumaAcaoEmAndamento} className={btnDangerCompactClass}>
                            {updatingDebitoId === r.id ? "..." : "Registrar débito"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden divide-y divide-[var(--card-border)]/60">
              {listPago.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">{r.seller_nome}</span>
                    <span className="text-sm font-semibold tabular-nums text-[var(--foreground)] shrink-0">{formatMoney(r.valor_total)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)] truncate">
                    {r.fornecedor_nome} · ciclo {r.ciclo_repasse ? formatDateCiclo(r.ciclo_repasse) : "—"}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--muted)]">{formatDate(r.data_evento)}</span>
                    {r.debito_ja_registrado ? (
                      <span className="text-xs text-[var(--muted)]">✓ Débito registrado</span>
                    ) : (
                      <button type="button" onClick={() => askRegistrarDebito(r)} disabled={algumaAcaoEmAndamento} className={btnDangerCompactClass}>
                        {updatingDebitoId === r.id ? "..." : "Registrar débito"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--card-border)] px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Débito de fornecedor pendente</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Débito registrado acima que ainda não foi descontado de um repasse. Se o ciclo agendado já passou e o
            débito continua aqui, é porque não coube na capacidade do fornecedor naquele ciclo — foi adiado
            automaticamente pro ciclo seguinte.
          </p>
        </div>
        {debitosPendentes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--muted)] sm:px-5">Nenhum débito de fornecedor pendente no momento.</p>
        ) : (
          <>
            <div className="hidden sm:block dropcore-scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)] bg-[var(--muted)]/10 text-left text-xs text-[var(--muted)]">
                    <th className="px-4 py-3 font-medium">Fornecedor</th>
                    <th className="px-4 py-3 font-medium">Deve por causa do seller</th>
                    <th className="px-4 py-3 font-medium text-right">Valor</th>
                    <th className="px-4 py-3 font-medium">Registrado em</th>
                    <th className="px-4 py-3 font-medium">Ciclo agendado</th>
                  </tr>
                </thead>
                <tbody>
                  {debitosPendentes.map((d) => (
                    <tr key={d.id} className="border-b border-[var(--card-border)]/60 transition-colors hover:bg-[var(--muted)]/8">
                      <td className="px-4 py-3">{d.fornecedor_nome ?? "—"}</td>
                      <td className="px-4 py-3">{d.seller_nome ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatMoney(d.valor_fornecedor)}</td>
                      <td className="px-4 py-3 text-[var(--muted)]">{formatDate(d.criado_em)}</td>
                      <td className="px-4 py-3">{formatDateCiclo(d.ciclo_a_descontar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden divide-y divide-[var(--card-border)]/60">
              {debitosPendentes.map((d) => (
                <div key={d.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">{d.fornecedor_nome ?? "—"}</span>
                    <span className="text-sm font-semibold tabular-nums text-[var(--foreground)] shrink-0">{formatMoney(d.valor_fornecedor)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)] truncate">Seller: {d.seller_nome ?? "—"}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                    <span>Registrado {formatDate(d.criado_em)}</span>
                    <span>Ciclo {formatDateCiclo(d.ciclo_a_descontar)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {confirmacao ? (
        <ModalOverlay onBackdropClick={() => setConfirmacao(null)}>
          <div className={MODAL_PANEL_BODY_CLASS + " p-5"}>
            <p className="font-semibold text-[var(--foreground)]">{confirmacao.titulo}</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{confirmacao.mensagem}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmacao(null)} className={btnSecondaryCompactClass}>
                Cancelar
              </button>
              <button type="button" onClick={confirmacao.onConfirmar} className={btnPrimaryCompactClass}>
                Confirmar
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}
    </div>
  );
}
