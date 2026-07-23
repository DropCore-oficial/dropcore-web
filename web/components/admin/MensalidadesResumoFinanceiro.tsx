"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cicloAtualYm, type MensalidadeTotaisFinanceiros } from "@/lib/mensalidadeTotaisFinanceirosOrg";
import {
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_BODY,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SECONDARY,
} from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_SOFT,
  INFO_PREMIUM_SURFACE_TRANSPARENT,
  INFO_PREMIUM_TEXT_SOFT,
  SUCCESS_PREMIUM_SURFACE,
  SUCCESS_PREMIUM_SURFACE_TRANSPARENT,
  SUCCESS_PREMIUM_TEXT_SOFT,
} from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatCicloLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatCicloLabelCurto(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function shiftCicloYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function statusLinhaClass(status: string): string {
  if (status === "pago") return cn(SUCCESS_PREMIUM_SURFACE_TRANSPARENT, SUCCESS_PREMIUM_TEXT_SOFT);
  if (status === "inadimplente") return cn(DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_SOFT);
  if (status === "pendente") return cn(INFO_PREMIUM_SURFACE_TRANSPARENT, INFO_PREMIUM_TEXT_SOFT);
  return "border border-[var(--card-border)] text-neutral-500 dark:text-neutral-400";
}

function statusLabel(status: string): string {
  if (status === "pago") return "Pago";
  if (status === "inadimplente") return "Inadimplente";
  if (status === "pendente") return "Pendente";
  if (status === "cancelado") return "Cancelado";
  return status;
}

type Props = {
  portalTrialDays?: number;
  mensalidadePortal?: {
    sellers: { em_teste: number; adimplentes: number; inadimplentes: number };
    fornecedores: { em_teste: number; adimplentes: number; inadimplentes: number };
  };
};

function IconWrap({ children, tone }: { children: ReactNode; tone: "emerald" | "neutral" | "danger" | "amber" }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400"
      : tone === "danger"
        ? "bg-[var(--danger)]/10 text-[var(--danger)] ring-[var(--danger)]/20 dark:text-red-400"
        : tone === "amber"
          ? cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY, "ring-amber-500/15")
          : "bg-neutral-200/70 text-neutral-600 ring-neutral-300/30 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700/40";
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1", cls)} aria-hidden>
      {children}
    </span>
  );
}

function EntidadeChip({ nome, tipo }: { nome: string; tipo: "seller" | "fornecedor" }) {
  const inicial = (nome.trim()[0] ?? "?").toUpperCase();
  return (
    <li className="group flex items-center gap-3 min-w-0 rounded-xl border border-[var(--card-border)]/70 bg-[var(--card)] px-3 py-2.5 shadow-sm transition-all hover:border-emerald-300/70 hover:shadow-md dark:hover:border-emerald-700/50">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold shadow-inner",
          tipo === "seller"
            ? "bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 text-emerald-700 dark:from-emerald-500/20 dark:to-emerald-600/10 dark:text-emerald-400"
            : "bg-gradient-to-br from-neutral-200/90 to-neutral-100/50 text-neutral-700 dark:from-neutral-800 dark:to-neutral-900 dark:text-neutral-300"
        )}
      >
        {inicial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">{nome}</p>
        <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          {tipo === "seller" ? "Seller ativo" : "Fornecedor ativo"}
        </p>
      </div>
    </li>
  );
}

function KpiFinanceiro({
  label,
  valor,
  detalhe,
  extra,
  tone,
  icon,
}: {
  label: string;
  valor: string;
  detalhe: string;
  extra?: ReactNode;
  tone: "success" | "neutral" | "danger";
  icon: ReactNode;
}) {
  const surface =
    tone === "success"
      ? SUCCESS_PREMIUM_SURFACE
      : tone === "danger"
        ? cn(DANGER_PREMIUM_SURFACE_TRANSPARENT, "ring-1 ring-[var(--danger)]/10 dark:ring-[var(--danger)]/20")
        : "border border-[var(--card-border)] bg-[var(--card)] ring-1 ring-[var(--card-border)]/40";

  const valorCls =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "danger"
        ? "text-[var(--danger)] dark:text-red-400"
        : "text-neutral-900 dark:text-neutral-100";

  const iconTone = tone === "success" ? "emerald" : tone === "danger" ? "danger" : "neutral";

  return (
    <div className={cn("relative overflow-hidden rounded-2xl px-4 py-4 transition-all hover:shadow-md", surface)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</p>
          <p className={cn("mt-2 text-2xl font-bold tabular-nums tracking-tight", valorCls)}>{valor}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">{detalhe}</p>
          {extra}
        </div>
        <IconWrap tone={iconTone}>{icon}</IconWrap>
      </div>
    </div>
  );
}

function PortalMiniCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "trial" | "success" | "danger";
}) {
  const border =
    tone === "success"
      ? "border-l-emerald-500"
      : tone === "danger"
        ? "border-l-[var(--danger)]"
        : "border-l-amber-500";

  const valueCls =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
        ? "text-[var(--danger)] dark:text-red-400"
        : AMBER_PREMIUM_TEXT_PRIMARY;

  return (
    <div className={cn("rounded-xl border border-[var(--card-border)] bg-[var(--card)] border-l-[3px] px-3 py-3 shadow-sm", border)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", valueCls)}>{value}</p>
    </div>
  );
}

export function MensalidadesResumoFinanceiro({ portalTrialDays, mensalidadePortal }: Props) {
  const router = useRouter();
  const [ciclo, setCiclo] = useState(cicloAtualYm);
  const [resumo, setResumo] = useState<MensalidadeTotaisFinanceiros | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [linhasAbertas, setLinhasAbertas] = useState(false);

  const carregar = useCallback(async (ym: string) => {
    setLoading(true);
    setErro(null);
    try {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(`/api/org/mensalidades/resumo-financeiro?ciclo=${encodeURIComponent(ym)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao carregar resumo");
      setResumo(json as MensalidadeTotaisFinanceiros);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
      setResumo(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void carregar(ciclo);
  }, [ciclo, carregar]);

  const mf = resumo;

  const progressoCiclo = useMemo(() => {
    if (!mf) return { pct: 0, total: 0, taxaMp: 0 };
    const total = mf.pago_liquido + mf.pendente_cobravel + mf.inadimplente_cobravel;
    const pct = total > 0 ? Math.round((mf.pago_liquido / total) * 100) : mf.pago_liquido > 0 ? 100 : 0;
    const taxaMp = mf.pago_bruto > mf.pago_liquido ? mf.pago_bruto - mf.pago_liquido : 0;
    return { pct, total, taxaMp };
  }, [mf]);

  const linhasVisiveis = mf ? (linhasAbertas ? mf.linhas_ciclo : mf.linhas_ciclo.slice(0, 4)) : [];

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm overflow-hidden">
      <div className="relative border-b border-neutral-100 dark:border-neutral-800 bg-[var(--card)]">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500/80 dark:bg-emerald-500/70" aria-hidden />
        <div className="px-5 sm:px-6 py-5 pl-6 sm:pl-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 shadow-sm dark:bg-emerald-400/10">
                <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" x2="22" y1="10" y2="10" />
                  <path d="M6 14h.01M10 14h4" />
                </svg>
              </div>
              <div className="min-w-0 space-y-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/80 dark:text-emerald-400/80">
                    Financeiro · portal
                  </p>
                  <h2 className="mt-0.5 text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                    Mensalidades DropCore
                  </h2>
                </div>
                {mf && (
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card)] px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm ring-1 ring-[var(--card-border)] dark:text-neutral-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {mf.sellers_ativos} seller{mf.sellers_ativos !== 1 ? "s" : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--card)] px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm ring-1 ring-[var(--card-border)] dark:text-neutral-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                      {mf.fornecedores_ativos} fornecedor{mf.fornecedores_ativos !== 1 ? "es" : ""}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-300">
                      {formatCicloLabel(mf.ciclo_ym)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[17.5rem]">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Ciclo
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCiclo(shiftCicloYm(ciclo, -1))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-neutral-600 shadow-sm hover:border-emerald-300 hover:bg-emerald-500/5 dark:text-neutral-300 dark:hover:border-emerald-700 transition-colors"
                  aria-label="Mês anterior"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <input
                  type="month"
                  value={ciclo}
                  onChange={(e) => setCiclo(e.target.value || cicloAtualYm())}
                  aria-label="Selecionar ciclo"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm font-medium text-neutral-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => setCiclo(shiftCicloYm(ciclo, 1))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-neutral-600 shadow-sm hover:border-emerald-300 hover:bg-emerald-500/5 dark:text-neutral-300 dark:hover:border-emerald-700 transition-colors"
                  aria-label="Próximo mês"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/admin/mensalidades?ciclo=${ciclo}`)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99]"
              >
                Ver lista do mês
                <svg className="h-4 w-4 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-5 pl-6 sm:pl-7 space-y-6">
        {erro && (
          <p className="text-sm text-[var(--danger)] dark:text-red-400 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3" role="alert">
            {erro}
          </p>
        )}

        {loading && !mf ? (
          <div className="space-y-5 animate-pulse">
            <div className="h-32 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="h-28 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60" />
              <div className="h-28 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60" />
              <div className="h-28 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60" />
            </div>
          </div>
        ) : null}

        {mf && (
          <>
            {/* Hero — recebido + progresso */}
            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800/70 dark:text-emerald-400/80">
                    Recebido no ciclo · líquido MP
                  </p>
                  <p className="mt-1 text-4xl sm:text-5xl font-bold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-400">
                    {BRL.format(mf.pago_liquido)}
                  </p>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                    {mf.pago_qtd} pagamento{mf.pago_qtd !== 1 ? "s" : ""} · {mf.pago_qtd_sellers} seller{mf.pago_qtd_sellers !== 1 ? "s" : ""} · {mf.pago_qtd_fornecedores} fornec.
                    {mf.caixa_qtd > 0 ? (
                      <span className="block sm:inline sm:ml-1 mt-0.5 sm:mt-0">
                        Caixa PIX no mês: <strong className="font-semibold text-neutral-800 dark:text-neutral-200">{BRL.format(mf.caixa_liquido_mes)}</strong>
                      </span>
                    ) : null}
                  </p>
                  {progressoCiclo.taxaMp > 0 && (
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      Taxa MP estimada no ciclo: {BRL.format(progressoCiclo.taxaMp)}
                      {mf.pago_bruto > mf.pago_liquido ? ` (bruto ${BRL.format(mf.pago_bruto)})` : ""}
                    </p>
                  )}
                </div>

                {progressoCiclo.total > 0 && (
                  <div className="w-full lg:max-w-xs shrink-0">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                      <span>Cobrança do ciclo</span>
                      <span className="text-emerald-700 dark:text-emerald-400">{progressoCiclo.pct}% recebido</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200/80 ring-1 ring-inset ring-neutral-300/30 dark:bg-neutral-800 dark:ring-neutral-700/50">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-700 ease-out"
                        style={{ width: `${Math.min(100, progressoCiclo.pct)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                      Base: recebido + a receber + inadimplente (cobrável)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* KPIs secundários */}
            <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", loading && "opacity-60")}>
              <KpiFinanceiro
                tone="neutral"
                label="A receber (cobrável)"
                valor={BRL.format(mf.pendente_cobravel)}
                detalhe={`${mf.pendente_cobravel_qtd_sellers + mf.pendente_cobravel_qtd_fornecedores} conta${mf.pendente_cobravel_qtd_sellers + mf.pendente_cobravel_qtd_fornecedores !== 1 ? "s" : ""} · Sellers ${BRL.format(mf.pendente_cobravel_sellers)} · Fornec. ${BRL.format(mf.pendente_cobravel_fornecedores)}`}
                icon={
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                }
                extra={
                  mf.pendente_em_teste > 0 ? (
                    <p className={cn("mt-2 text-[11px] leading-relaxed rounded-lg px-2.5 py-2", AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_BODY)}>
                      <span className="font-semibold">Em teste (não cobra): {BRL.format(mf.pendente_em_teste)}</span>
                      <span className="block mt-0.5 opacity-90">
                        {mf.pendente_em_teste_qtd_sellers} seller{mf.pendente_em_teste_qtd_sellers !== 1 ? "s" : ""} · {mf.pendente_em_teste_qtd_fornecedores} fornecedor{mf.pendente_em_teste_qtd_fornecedores !== 1 ? "es" : ""}
                      </span>
                    </p>
                  ) : null
                }
              />
              <KpiFinanceiro
                tone="danger"
                label="Inadimplente"
                valor={BRL.format(mf.inadimplente_cobravel)}
                detalhe={`${mf.inadimplente_qtd_sellers + mf.inadimplente_qtd_fornecedores} conta${mf.inadimplente_qtd_sellers + mf.inadimplente_qtd_fornecedores !== 1 ? "s" : ""} fora do trial${mf.inadimplente_em_teste > 0 ? ` · ${BRL.format(mf.inadimplente_em_teste)} em trial` : ""}`}
                icon={
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <path d="M12 9v4M12 17h.01" />
                  </svg>
                }
              />
            </div>

            {mf.ciclos_disponiveis.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mr-1">Histórico</span>
                {mf.ciclos_disponiveis.slice(0, 8).map((ym) => (
                  <button
                    key={ym}
                    type="button"
                    onClick={() => setCiclo(ym)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[11px] font-semibold border transition-all active:scale-[0.98]",
                      ym === ciclo
                        ? "border-emerald-500 bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                        : "border-[var(--card-border)] bg-[var(--card)] text-neutral-600 dark:text-neutral-400 hover:border-emerald-300/70 hover:text-emerald-700 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
                    )}
                  >
                    {formatCicloLabelCurto(ym)}
                  </button>
                ))}
              </div>
            )}

            {/* Grid principal: linhas + cadastros */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
              {/* Linhas do ciclo */}
              <div className="xl:col-span-3 rounded-2xl border border-[var(--card-border)] bg-neutral-50/50 dark:bg-neutral-900/20 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-[var(--card)]">
                  <div>
                    <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Linhas do ciclo</p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {mf.geradas_entidades_sellers} seller{mf.geradas_entidades_sellers !== 1 ? "s" : ""} · {mf.geradas_entidades_fornecedores} fornecedor{mf.geradas_entidades_fornecedores !== 1 ? "es" : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-[10px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
                    {mf.linhas_ciclo.length}
                  </span>
                </div>
                {mf.linhas_ciclo.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">Nenhuma linha neste ciclo</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 border-b border-neutral-100 dark:border-neutral-800">
                            <th className="px-4 py-2.5 font-bold">Entidade</th>
                            <th className="px-3 py-2.5 font-bold hidden sm:table-cell">Tipo</th>
                            <th className="px-3 py-2.5 font-bold text-right">Valor</th>
                            <th className="px-4 py-2.5 font-bold text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {linhasVisiveis.map((l, i) => (
                            <tr key={`${l.entidade_id}-${l.tipo}-${i}`} className="bg-[var(--card)]/60 hover:bg-emerald-500/[0.03] transition-colors">
                              <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100 max-w-[12rem] truncate">
                                {l.entidade_nome}
                              </td>
                              <td className="px-3 py-3 text-neutral-500 dark:text-neutral-400 hidden sm:table-cell">
                                {l.tipo === "seller" ? "Seller" : "Fornecedor"}
                              </td>
                              <td className="px-3 py-3 text-right font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">
                                {BRL.format(l.valor)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold", statusLinhaClass(l.status))}>
                                  {statusLabel(l.status)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {mf.linhas_ciclo.length > 4 && (
                      <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-2.5 bg-[var(--card)]/80">
                        <button
                          type="button"
                          onClick={() => setLinhasAbertas((v) => !v)}
                          className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          {linhasAbertas ? "Mostrar menos" : `Ver todas (${mf.linhas_ciclo.length})`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Cadastros ativos */}
              <div className="xl:col-span-2 space-y-4">
                <div className="rounded-2xl border border-[var(--card-border)] bg-neutral-50/50 dark:bg-neutral-900/20 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Sellers ativos</p>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                      {mf.cadastro_sellers.length}
                    </span>
                  </div>
                  {mf.cadastro_sellers.length === 0 ? (
                    <p className="text-sm text-neutral-500">Nenhum</p>
                  ) : (
                    <ul className="space-y-2">
                      {mf.cadastro_sellers.map((s) => (
                        <EntidadeChip key={s.id} nome={s.nome} tipo="seller" />
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-2xl border border-[var(--card-border)] bg-neutral-50/50 dark:bg-neutral-900/20 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Fornecedores ativos</p>
                    <span className="rounded-full bg-neutral-200/80 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-bold text-neutral-600 dark:text-neutral-300">
                      {mf.cadastro_fornecedores.length}
                    </span>
                  </div>
                  {mf.cadastro_fornecedores.length === 0 ? (
                    <p className="text-sm text-neutral-500">Nenhum</p>
                  ) : (
                    <>
                      <ul className="space-y-2">
                        {mf.cadastro_fornecedores.map((f) => (
                          <EntidadeChip key={f.id} nome={f.nome} tipo="fornecedor" />
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => router.push("/admin/empresas")}
                        className="mt-3 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
                      >
                        Gerenciar empresas →
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {mensalidadePortal && (
          <div className="rounded-2xl border border-[var(--card-border)] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/30">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Situação atual no portal
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                Independente do filtro de mês · trial{" "}
                <code className="rounded-md bg-neutral-200/70 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono">PORTAL_TRIAL_DAYS</code>{" "}
                ({portalTrialDays ?? 7} dias)
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-2.5">Sellers</p>
                <div className="grid grid-cols-3 gap-2">
                  <PortalMiniCard label="Em teste" value={mensalidadePortal.sellers.em_teste} tone="trial" />
                  <PortalMiniCard label="Em dia" value={mensalidadePortal.sellers.adimplentes} tone="success" />
                  <PortalMiniCard label="Inadimplente" value={mensalidadePortal.sellers.inadimplentes} tone="danger" />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-2.5">Fornecedores</p>
                <div className="grid grid-cols-3 gap-2">
                  <PortalMiniCard label="Em teste" value={mensalidadePortal.fornecedores.em_teste} tone="trial" />
                  <PortalMiniCard label="Em dia" value={mensalidadePortal.fornecedores.adimplentes} tone="success" />
                  <PortalMiniCard label="Inadimplente" value={mensalidadePortal.fornecedores.inadimplentes} tone="danger" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
