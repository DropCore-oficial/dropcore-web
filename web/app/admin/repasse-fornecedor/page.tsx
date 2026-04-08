"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { PlanLimitsBadge } from "@/components/PlanLimitsBadge";

type PreviewItem = {
  fornecedor_id: string;
  fornecedor_nome: string;
  valor_fornecedor: number;
  valor_dropcore: number;
};

type Preview = {
  ciclo_repasse: string;
  ready_statuses?: string[];
  ja_fechado: boolean;
  fechado_em: string | null;
  entries_count: number;
  total_count?: number;
  status_counts?: Record<string, number>;
  debitos_count: number;
  fornecedores_cadastro_pendente?: string[];
  por_fornecedor: PreviewItem[];
  total_fornecedores: number;
  total_dropcore: number;
};
type FutureCyclePreview = {
  ciclo_repasse: string;
  entries_count: number;
  total_fornecedores: number;
  total_dropcore: number;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(s: string) {
  if (!s) return "—";
  const d = s.includes("T") ? new Date(s) : new Date(s + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatCiclo(s: string) {
  if (!s) return "—";
  // Força horário do meio-dia para evitar problema de fuso deslocar o dia
  const d = new Date(s + "T12:00:00");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

/** Retorna a data de uma segunda-feira como string local YYYY-MM-DD (sem fuso) */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Gera as próximas 8 segundas-feiras a partir de hoje */
function proximas8Segundas(): string[] {
  const result: string[] = [];
  const hoje = new Date();
  const dia = hoje.getDay(); // 0=dom,1=seg,...6=sab
  // dias até a próxima segunda (se hoje é segunda, começa da próxima semana)
  const diffParaProxSeg = dia === 1 ? 7 : (8 - dia) % 7 || 7;
  const base = new Date(hoje);
  base.setDate(base.getDate() + diffParaProxSeg);
  for (let i = 0; i < 8; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    result.push(toLocalDateStr(d));
  }
  return result;
}

/** Segundas anteriores (últimas 8, mais recente primeiro) */
function ultimas8Segundas(): string[] {
  const result: string[] = [];
  const hoje = new Date();
  const dia = hoje.getDay();
  // dias desde a última segunda (se hoje é segunda, inclui hoje)
  const diffParaUltimaSeg = dia === 1 ? 0 : dia === 0 ? 6 : dia - 1;
  const base = new Date(hoje);
  base.setDate(base.getDate() - diffParaUltimaSeg);
  for (let i = 0; i < 8; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 7);
    result.push(toLocalDateStr(d));
  }
  return result;
}

export default function RepasseFornecedorPage() {
  const router = useRouter();
  const [ciclo, setCiclo] = useState(() => proximas8Segundas()[0]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [cicloBuscado, setCicloBuscado] = useState<string | null>(null);
  const [futureCycles, setFutureCycles] = useState<FutureCyclePreview[]>([]);

  const proximasOpcoes = proximas8Segundas();
  const ultimasOpcoes = ultimas8Segundas();

  async function loadPreview(cicloStr: string) {
    setLoading(true);
    setError(null);
    setMessage(null);
    setPreview(null);
    setCicloBuscado(cicloStr);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) { router.replace("/login"); return; }
      const res = await fetch(
        `/api/org/financial/repasse-semanal?ciclo_repasse=${encodeURIComponent(cicloStr)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "Erro ao carregar."); return; }
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function loadFutureCycles() {
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const ciclos = proximas8Segundas().slice(0, 4);
      const results = await Promise.all(
        ciclos.map(async (c) => {
          const res = await fetch(`/api/org/financial/repasse-semanal?ciclo_repasse=${encodeURIComponent(c)}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (!res.ok) return null;
          const data = (await res.json()) as Preview;
          return {
            ciclo_repasse: c,
            entries_count: data.entries_count ?? 0,
            total_fornecedores: data.total_fornecedores ?? 0,
            total_dropcore: data.total_dropcore ?? 0,
          } satisfies FutureCyclePreview;
        })
      );
      setFutureCycles(results.filter((x): x is FutureCyclePreview => Boolean(x)));
    } catch {
      setFutureCycles([]);
    }
  }

  useEffect(() => {
    loadPreview(ciclo);
    loadFutureCycles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fecharRepasse() {
    if (!preview || preview.entries_count === 0) return;
    if ((preview.fornecedores_cadastro_pendente?.length ?? 0) > 0) {
      setMessage({
        type: "err",
        text: "Existem fornecedores com cadastro incompleto neste ciclo. Peça para completarem o cadastro antes de fechar o repasse.",
      });
      return;
    }
    setClosing(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/org/financial/repasse-semanal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ciclo_repasse: ciclo }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessage({
          type: "ok",
          text: `Repasse fechado com sucesso! ${json.ledger_atualizados ?? 0} pedido(s) marcado(s) como PAGO. Fornecedores: ${BRL.format(json.total_fornecedores ?? 0)} · DropCore: ${BRL.format(json.total_dropcore ?? 0)}.`,
        });
        loadPreview(ciclo);
        loadFutureCycles();
      } else {
        setMessage({ type: "err", text: json?.error || "Erro ao fechar repasse." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setClosing(false);
    }
  }

  function selectCiclo(val: string) {
    setCiclo(val);
    loadPreview(val);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-8 h-8 rounded-lg border border-neutral-200 bg-neutral-100 flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors text-sm"
          >
            ←
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-neutral-900">Repasse ao fornecedor</h1>
              <PlanLimitsBadge />
            </div>
            <p className="text-xs text-neutral-600 mt-0.5">Feche o ciclo semanal para marcar pedidos como pagos</p>
          </div>
        </div>

        {/* Como funciona */}
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm px-4 py-3 text-xs text-neutral-500 leading-relaxed">
          <p className="font-medium text-neutral-600 mb-1">Como funciona o ciclo</p>
          Esta tela trabalha com o <span className="text-neutral-600">financeiro (ledger)</span>, não com a lista de pedidos.
          Um pedido só aparece aqui quando o lançamento do ciclo está <span className="text-neutral-600">pronto para repasse</span>
          (status <span className="text-neutral-600">ENTREGUE</span> ou <span className="text-neutral-600">AGUARDANDO_REPASSE</span>)
          e com o <span className="text-neutral-600">ciclo de repasse</span> igual à segunda-feira selecionada.
          Ao fechar, o sistema marca esses lançamentos como <span className="text-neutral-600">PAGO</span> e gera o “A pagar aos fornecedores”.
        </div>

        {futureCycles.length > 0 && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-900/50 shadow-sm px-4 py-3">
            <p className="text-xs font-semibold text-sky-800 dark:text-sky-300 mb-2">Próximos ciclos (previsão rápida)</p>
            <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mb-2">
              Próximas 4 segundas: quanto está <span className="font-medium">pronto para fechar</span> no ledger (ENTREGUE / AGUARDANDO_REPASSE). Clique num ciclo abaixo para detalhar.
            </p>
            <div className="rounded-lg border border-sky-200/80 dark:border-sky-900/40 overflow-hidden divide-y divide-sky-100 dark:divide-sky-900/40">
              {futureCycles.map((f) => (
                <button
                  key={f.ciclo_repasse}
                  type="button"
                  onClick={() => selectCiclo(f.ciclo_repasse)}
                  className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 text-left px-3 py-2 text-xs hover:bg-white/80 dark:hover:bg-sky-950/40 transition-colors"
                >
                  <span className="text-neutral-800 dark:text-neutral-200">
                    <span className="font-medium">{formatCiclo(f.ciclo_repasse)}</span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {" "}
                      · {f.entries_count} lançamento{f.entries_count !== 1 ? "s" : ""} pronto{f.entries_count !== 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 shrink-0 tabular-nums">
                    <span className="text-neutral-600 dark:text-neutral-400">
                      Forn. <span className="font-semibold text-sky-800 dark:text-sky-200">{BRL.format(f.total_fornecedores)}</span>
                    </span>
                    <span className="text-neutral-600 dark:text-neutral-400">
                      DC <span className="font-semibold text-emerald-700 dark:text-emerald-400">{BRL.format(f.total_dropcore)}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-500">
              Valores previstos até você fechar o repasse naquele ciclo. Depois, use <span className="font-medium">A pagar aos fornecedores</span>.
            </p>
          </div>
        )}

        {/* Seletor de ciclo */}
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-neutral-200">
            <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-3">Selecione o ciclo (segunda-feira)</p>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-neutral-600 mb-2">Próximas semanas</p>
                <div className="flex flex-wrap gap-2">
                  {proximasOpcoes.map((s) => (
                    <button
                      key={s}
                      onClick={() => selectCiclo(s)}
                      className={`rounded-xl border px-3 py-1.5 text-xs transition-colors ${
                        ciclo === s
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold"
                          : "border-neutral-300 text-neutral-600 hover:border-neutral-500 hover:text-neutral-900"
                      }`}
                    >
                      {formatCiclo(s)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-neutral-600 mb-2">Semanas anteriores</p>
                <div className="flex flex-wrap gap-2">
                  {ultimasOpcoes.map((s) => (
                    <button
                      key={s}
                      onClick={() => selectCiclo(s)}
                      className={`rounded-xl border px-3 py-1.5 text-xs transition-colors ${
                        ciclo === s
                          ? "border-blue-300 bg-blue-50 text-blue-700 font-semibold"
                          : "border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-700"
                      }`}
                    >
                      {formatCiclo(s)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <p className="text-[11px] text-neutral-600">Ou escolha manualmente:</p>
                <input
                  type="date"
                  value={ciclo}
                  onChange={(e) => { setCiclo(e.target.value.slice(0, 10)); }}
                  onBlur={(e) => loadPreview(e.target.value.slice(0, 10))}
                  className="rounded-lg border border-neutral-300 bg-neutral-100 text-neutral-900 text-xs px-2 py-1.5 focus:outline-none focus:border-neutral-500"
                />
              </div>
            </div>
          </div>

          {/* Resultado */}
          <div className="px-4 py-4">
            {loading ? (
              <p className="text-sm text-neutral-600 text-center py-4">Carregando…</p>
            ) : error ? (
              <p className="text-sm text-rose-600 py-2">{error}</p>
            ) : preview && cicloBuscado ? (
              <div className="space-y-4">

                {/* Status do ciclo */}
                {preview.ja_fechado && (
                  <div className="rounded-xl border border-yellow-300 bg-yellow-50 px-3 py-2.5 text-xs text-yellow-800">
                    {preview.entries_count > 0
                      ? <>Ciclo já fechado em {formatDate(preview.fechado_em ?? "")}. Há <strong>{preview.entries_count} novo(s) pedido(s)</strong> que ainda não foram repassados.</>
                      : <>Ciclo fechado em {formatDate(preview.fechado_em ?? "")}. Não há novos pedidos para repassar.</>
                    }
                  </div>
                )}

                {preview.entries_count === 0 && !preview.ja_fechado ? (
                  <div className="text-center py-6 space-y-2">
                    <p className="text-3xl">📭</p>
                    <p className="text-sm text-neutral-600 font-medium">Nenhum pedido neste ciclo</p>
                    <p className="text-xs text-neutral-600 max-w-md mx-auto">
                      Isso significa: neste ciclo ({formatCiclo(cicloBuscado)}) não há lançamentos do ledger prontos para repasse
                      (<span className="text-neutral-600">ENTREGUE</span> ou <span className="text-neutral-600">AGUARDANDO_REPASSE</span>).
                    </p>

                    {(preview.total_count ?? 0) > 0 && preview.status_counts && (
                      <div className="mt-4 mx-auto max-w-md text-left rounded-xl border border-neutral-200 bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">Diagnóstico do ciclo</p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-neutral-700">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-neutral-500">Total no ciclo</span>
                            <span className="font-semibold tabular-nums">{preview.total_count}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-neutral-500">Prontos p/ repasse</span>
                            <span className="font-semibold tabular-nums">{preview.entries_count}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-neutral-500">BLOQUEADO</span>
                            <span className="font-semibold tabular-nums">{preview.status_counts.BLOQUEADO ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-neutral-500">AGUARDANDO_REPASSE</span>
                            <span className="font-semibold tabular-nums">{preview.status_counts.AGUARDANDO_REPASSE ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-neutral-500">ENTREGUE</span>
                            <span className="font-semibold tabular-nums">{preview.status_counts.ENTREGUE ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-neutral-500">PAGO</span>
                            <span className="font-semibold tabular-nums">{preview.status_counts.PAGO ?? 0}</span>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] text-neutral-500">
                          Se estiver tudo em <span className="font-medium">BLOQUEADO</span>, o fornecedor ainda não postou (ou o status financeiro não foi atualizado).
                          Se estiver em <span className="font-medium">PAGO</span>, esse ciclo já foi baixado.
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => router.push("/admin/pedidos")}
                        className="rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-700 hover:border-neutral-500"
                      >
                        Ver pedidos
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push("/admin/devolucoes")}
                        className="rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-700 hover:border-neutral-500"
                      >
                        Bloqueios e devoluções
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push("/admin/a-pagar-fornecedores")}
                        className="rounded-xl border border-neutral-300 px-3 py-2 text-xs text-neutral-700 hover:border-neutral-500"
                      >
                        A pagar fornecedores
                      </button>
                    </div>
                  </div>
                ) : preview.entries_count > 0 ? (
                  <>
                    {/* Resumo */}
                    <div className="grid grid-cols-3 divide-x divide-neutral-200 rounded-xl border border-neutral-200 overflow-hidden">
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[11px] text-neutral-600 mb-0.5">Pedidos</p>
                        <p className="text-lg font-bold text-neutral-900">{preview.entries_count}</p>
                      </div>
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[11px] text-neutral-600 mb-0.5">Fornecedores</p>
                        <p className="text-base font-bold text-neutral-900 tabular-nums">{BRL.format(preview.total_fornecedores)}</p>
                      </div>
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[11px] text-neutral-600 mb-0.5">DropCore</p>
                        <p className="text-base font-bold text-emerald-700 tabular-nums">{BRL.format(preview.total_dropcore)}</p>
                      </div>
                    </div>

                    {/* Tabela por fornecedor */}
                    <div className="rounded-xl border border-neutral-200 overflow-hidden">
                      <div className="px-3 py-2 border-b border-neutral-200 grid grid-cols-[1fr_auto_auto] gap-3 text-[11px] text-neutral-600 font-medium uppercase tracking-wide">
                        <span>Fornecedor</span>
                        <span className="text-right w-28">Valor fornecedor</span>
                        <span className="text-right w-24">DropCore</span>
                      </div>
                      {preview.por_fornecedor.map((row) => (
                        <div key={row.fornecedor_id} className="px-3 py-2.5 border-b border-neutral-200/40 last:border-0 grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                          <span className="text-sm text-neutral-900 truncate">{row.fornecedor_nome}</span>
                          <span className="text-sm tabular-nums text-neutral-600 text-right w-28">{BRL.format(row.valor_fornecedor)}</span>
                          <span className="text-sm tabular-nums text-emerald-700 text-right w-24">{BRL.format(row.valor_dropcore)}</span>
                        </div>
                      ))}
                    </div>

                    {preview.debitos_count > 0 && (
                      <p className="text-xs text-yellow-700">
                        ⚠ {preview.debitos_count} débito(s) de devolução serão descontados neste repasse.
                      </p>
                    )}
                    {(preview.fornecedores_cadastro_pendente?.length ?? 0) > 0 && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <p className="font-semibold mb-1">Cadastro pendente bloqueia fechamento</p>
                        <p>
                          Fornecedores pendentes: {preview.fornecedores_cadastro_pendente!.slice(0, 5).join(", ")}
                          {preview.fornecedores_cadastro_pendente!.length > 5
                            ? ` e mais ${preview.fornecedores_cadastro_pendente!.length - 5}.`
                            : "."}
                        </p>
                      </div>
                    )}

                    <button
                      onClick={fecharRepasse}
                      disabled={closing || (preview.fornecedores_cadastro_pendente?.length ?? 0) > 0}
                      className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors ${
                        closing || (preview.fornecedores_cadastro_pendente?.length ?? 0) > 0
                          ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      }`}
                    >
                      {closing ? "Fechando…" : `Fechar repasse — ${formatCiclo(ciclo)}`}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Mensagem de sucesso/erro */}
        {message && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-rose-300 bg-rose-50 text-rose-700"
          }`}>
            {message.text}
          </div>
        )}

      </div>
    </div>
  );
}
