"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";

type LogRow = {
  id: string;
  actor_email: string | null;
  ip_address: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  detalhes: Record<string, unknown> | null;
  criado_em: string;
};

const ACTION_LABELS: Record<string, string> = {
  "mensalidade.excluir": "Excluiu mensalidade",
  "mensalidade.marcar_pago_manual": "Marcou mensalidade como paga (manual)",
  "ledger.mudar_status": "Mudou status do ledger",
  "deposito_pix.aprovar": "Aprovou depósito PIX",
  "seller.excluir": "Excluiu seller",
  "seller.credito_manual": "Adicionou crédito manual ao seller",
  "fornecedor.excluir": "Excluiu fornecedor",
  "membro.remover": "Removeu membro da org",
  "membro.mudar_papel": "Mudou papel de membro",
  "pedido.confirmar_envio_manual": "Confirmou envio de pedido (manual)",
  "sku.excluir": "Excluiu SKU",
  "calculadora_assinante.apagar_conta": "Apagou conta de assinante (calculadora)",
  "calculadora_assinante.excluir": "Excluiu assinante (calculadora)",
  "calculadora_assinante.desativar": "Desativou assinante (calculadora)",
  "portal_trial.cancelar": "Cancelou teste grátis do portal",
  "erp.bling.conectar": "Conectou Bling",
  "erp.bling.conectar_oauth": "Conectou Bling (OAuth)",
  "erp.bling.desconectar": "Desconectou Bling",
  "erp.olist.conectar": "Conectou Olist/Tiny",
  "erp.olist.desconectar": "Desconectou Olist/Tiny",
  "erp.olist.regenerar_ingest_token": "Regenerou token de webhook Olist",
  "erp.olist.sync_manual": "Sincronizou Olist manualmente",
  "erp.olist.sync_precos_admin": "Sincronizou preços Olist (admin)",
  "erp.olist.sync_estoque_admin": "Sincronizou estoque Olist (admin)",
  "disputa_fornecedor.decidir": "Decidiu disputa com fornecedor (Amanda)",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatDateTimeBRT(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

const inputClass =
  "h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 shadow-sm dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:shadow-none";
const btnSecondaryCompact =
  "rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10";

export default function AdminAuditoriaPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        setError("Faça login novamente.");
        return;
      }
      const params = new URLSearchParams();
      if (actor) params.set("actor", actor);
      if (action) params.set("action", action);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/org/auditoria?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar auditoria.");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actionOptions = Array.from(new Set(rows.map((r) => r.action))).sort();

  return (
    <div className="dropcore-shell-6xl py-4 sm:py-6 pb-5 md:pb-7">
      <AdminPageHeader
        eyebrow="Operação"
        title="Auditoria"
        subtitle="Quem fez o quê no sistema — exclusões, aprovações de PIX, mudança de permissão, integrações de ERP e outras ações administrativas, com IP de origem."
      />

      <div className="mt-6 flex flex-col gap-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="rounded-xl border border-neutral-200 bg-neutral-100 p-4 sm:p-5 dark:border-neutral-700 dark:bg-neutral-900/40"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end lg:gap-x-6 lg:gap-y-4">
            <label className="flex min-w-0 flex-col gap-2 lg:col-span-4">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Ator (e-mail)</span>
              <input
                type="text"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                placeholder="nome@empresa.com"
                className={inputClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2 lg:col-span-3">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Ação</span>
              <select value={action} onChange={(e) => setAction(e.target.value)} className={inputClass}>
                <option value="">Todas</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {actionLabel(a)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-2 lg:col-span-2">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">De</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </label>
            <label className="flex min-w-0 flex-col gap-2 lg:col-span-2">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Até</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </label>
            <button type="submit" className={`${btnSecondaryCompact} h-10 lg:col-span-1`}>
              Filtrar
            </button>
          </div>
        </form>

        {error && (
          <div className={`${DANGER_PREMIUM_SHELL} px-4 py-3 text-sm ${DANGER_PREMIUM_TEXT_PRIMARY}`} role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-neutral-500">Carregando...</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-100 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/50">
            Nenhum registro de auditoria encontrado com esses filtros.
          </div>
        ) : (
          <>
            <ul className="md:hidden m-0 list-none space-y-3 p-0">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/40"
                >
                  <p className="font-semibold text-sm">{actionLabel(r.action)}</p>
                  <p className="mt-1 text-xs text-neutral-500">{formatDateTimeBRT(r.criado_em)}</p>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500">Ator</dt>
                      <dd className="min-w-0 truncate text-right font-medium">{r.actor_email ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500">IP</dt>
                      <dd className="font-mono text-xs">{r.ip_address ?? "—"}</dd>
                    </div>
                    {r.target_table && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-neutral-500">Alvo</dt>
                        <dd className="min-w-0 truncate text-right text-xs">
                          {r.target_table}
                          {r.target_id ? ` · ${r.target_id.slice(0, 8)}` : ""}
                        </dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>

            <div className="hidden md:block w-full min-w-0 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400">Data/hora</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400">Ator</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400">Ação</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400">Alvo</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 dark:text-neutral-400">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800">
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800 dark:text-neutral-200">
                        {formatDateTimeBRT(r.criado_em)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3">{r.actor_email ?? "—"}</td>
                      <td className="px-4 py-3">{actionLabel(r.action)}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-xs text-neutral-500">
                        {r.target_table ? `${r.target_table}${r.target_id ? ` · ${r.target_id.slice(0, 8)}` : ""}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{r.ip_address ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
