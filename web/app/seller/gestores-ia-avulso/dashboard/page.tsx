"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { GestorAvulsoConectarMlEmptyState } from "@/components/seller/GestorAvulsoConectarMlEmptyState";
import { IconClock } from "@/components/seller/Icons";
import type { ResumoFinanceiroAvulso } from "@/lib/ai/gestorAvulsoResumoDados";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";

type Acesso = "loading" | "liberado" | "negado";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function IconDashboard({ className = "h-6 w-6 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="6" x2="6" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="18" x2="18" y1="20" y2="14" />
    </svg>
  );
}

/** Sparkline — faturamento por dia dos últimos 30 dias. Mesmo padrão do gráfico
 * "Desempenho" de `/seller/dashboard`: barra em px (não % de um container de 40px — barra
 * baixa virava "pontinho" ilegível) + tooltip customizado no toque/hover (o `title` nativo
 * não aparece em celular, achado 2026-10-15) + rótulo de data nas pontas. */
function SparklineFaturamento({ porDia }: { porDia: ResumoFinanceiroAvulso["porDia30d"] }) {
  const [ativoIdx, setAtivoIdx] = useState<number | null>(null);
  const max = Math.max(...porDia.map((d) => d.faturamento), 1);
  const barMaxH = 96;

  const hojeStr = new Date().toISOString().slice(0, 10);
  const ultimoDiaHoje = porDia[porDia.length - 1]?.dia === hojeStr;

  return (
    <div>
      <div className="flex h-28 items-end gap-[2px]">
        {porDia.map((d, idx) => {
          const diaFmt = d.dia.length >= 10 ? `${d.dia.slice(8)}/${d.dia.slice(5, 7)}` : d.dia;
          const barH = d.faturamento > 0 ? Math.max(14, (d.faturamento / max) * barMaxH) : 3;
          const pertoDaBordaDireita = idx >= porDia.length - 2;
          return (
            <div
              key={d.dia}
              className="relative flex min-w-0 flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setAtivoIdx(idx)}
              onMouseLeave={() => setAtivoIdx((v) => (v === idx ? null : v))}
              onClick={() => setAtivoIdx((v) => (v === idx ? null : idx))}
            >
              <div
                className="w-full cursor-default rounded-t bg-emerald-600 transition hover:opacity-90 dark:bg-emerald-500"
                style={{ height: `${barH}px` }}
              />
              {ativoIdx === idx ? (
                <div
                  className={cn(
                    "pointer-events-none absolute bottom-full z-20 mb-2",
                    pertoDaBordaDireita ? "right-0" : "left-1/2 -translate-x-1/2"
                  )}
                >
                  <div className="min-w-[140px] whitespace-nowrap rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 shadow-xl">
                    <p className="text-[11px] font-semibold text-[var(--foreground)]">{diaFmt}</p>
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {BRL.format(d.faturamento)}
                    </p>
                    {d.vendas > 0 ? (
                      <p className="text-[11px] text-[var(--muted)]">
                        {d.vendas} venda{d.vendas > 1 ? "s" : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between px-0.5">
        <span className="text-[10px] text-[var(--muted)]">
          {porDia[0]?.dia.length >= 10 ? `${porDia[0].dia.slice(8)}/${porDia[0].dia.slice(5, 7)}` : porDia[0]?.dia ?? ""}
        </span>
        <span className={cn("text-[10px]", ultimoDiaHoje ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-[var(--muted)]")}>
          {ultimoDiaHoje
            ? "Hoje"
            : (() => {
                const last = porDia[porDia.length - 1]?.dia;
                return last && last.length >= 10 ? `${last.slice(8)}/${last.slice(5, 7)}` : last ?? "";
              })()}
        </span>
      </div>
    </div>
  );
}

/** Card "Resultado · últimos 30 dias" — lucro estimado em destaque, grid de desempenho
 * (faturamento/vendas/ticket médio), produto campeão clicável e sparkline, inspirado na
 * seção "Desempenho" de `/seller/dashboard` (o dashboard de verdade do seller do hub).
 * Movido pra página própria (2026-10-15, pedido explícito do Sr Stark) — antes vivia
 * embutido no hub `/seller/gestores-ia-avulso`. */
function ResumoFinanceiroCard({ resumo }: { resumo: ResumoFinanceiroAvulso }) {
  const variacao = resumo.faturamento30dVariacaoPct;
  const temVendaNoPeriodo = resumo.porDia30d.some((d) => d.faturamento > 0);

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Resultado · últimos 30 dias</p>

      <div className="mt-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/30">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Lucro estimado
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight text-[var(--foreground)]">
            {resumo.lucroEstimado30d !== null ? BRL.format(resumo.lucroEstimado30d) : "—"}
          </span>
          {variacao !== null ? (
            <span
              className={cn(
                "text-sm font-semibold",
                variacao >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-[var(--danger)]"
              )}
              title="Variação do faturamento vs. os 30 dias anteriores (a margem usada no lucro estimado é a mesma dos dois períodos)"
            >
              {variacao >= 0 ? "↑" : "↓"} {Math.abs(Math.round(variacao))}% faturamento
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {resumo.margemMediaPct !== null
            ? `margem de ~${Math.round(resumo.margemMediaPct)}% sobre ${BRL.format(resumo.faturamento30d)} faturados`
            : "cadastre o custo dos seus produtos no ADS pra estimar o lucro"}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-[var(--card-border)] overflow-hidden rounded-xl border border-[var(--card-border)]">
        <div className="px-3 py-3 sm:px-4">
          <p className="text-[11px] text-[var(--muted)]">Faturamento</p>
          <p className="mt-0.5 text-sm font-bold text-[var(--foreground)] tabular-nums sm:text-base">
            {BRL.format(resumo.faturamento30d)}
          </p>
        </div>
        <div className="px-3 py-3 sm:px-4">
          <p className="text-[11px] text-[var(--muted)]">Vendas</p>
          <p className="mt-0.5 text-sm font-bold text-[var(--foreground)] tabular-nums sm:text-base">{resumo.vendas30d}</p>
        </div>
        <div className="px-3 py-3 sm:px-4">
          <p className="text-[11px] text-[var(--muted)]">Ticket médio</p>
          <p className="mt-0.5 text-sm font-bold text-[var(--foreground)] tabular-nums sm:text-base">
            {resumo.ticketMedio30d !== null ? BRL.format(resumo.ticketMedio30d) : "—"}
          </p>
        </div>
      </div>

      <div className="mt-2.5 rounded-xl border border-[var(--card-border)] px-3.5 py-3">
        <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Produto campeão</p>
        {resumo.produtoCampeao ? (
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-bold text-[var(--foreground)]">{resumo.produtoCampeao.nome}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{resumo.produtoCampeao.vendas} vendas no período</p>
            </div>
            <a
              href={mlItemPermalink(resumo.produtoCampeao.itemId)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            >
              Ver anúncio ↗
            </a>
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-[var(--muted)]">Nenhuma venda no período</p>
        )}
      </div>

      {temVendaNoPeriodo ? (
        <div className="mt-2.5 rounded-xl border border-[var(--card-border)] px-3.5 pb-3 pt-2.5">
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Faturamento por dia</p>
          <div className="mt-2">
            <SparklineFaturamento porDia={resumo.porDia30d} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Card "Top produtos" — ranking por faturamento real no período (não só quantidade),
 * substitui o antigo bloco "Pendências dos gestores" (2026-10-15, pedido do Sr Stark: isso
 * já aparece no hub `/seller/gestores-ia-avulso`, duplicado aqui; dado de venda ajuda mais
 * no Dashboard). Reaproveita os mesmos pedidos já buscados pro card de Resultado — só passou
 * a rastrear faturamento por item além da quantidade (`mercadoLivreApiClient.ts`). */
function TopProdutosCard({ resumo }: { resumo: ResumoFinanceiroAvulso }) {
  if (resumo.topProdutos.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Top produtos · 30 dias</p>
        <p className="mt-2 text-sm text-[var(--muted)]">Nenhuma venda no período.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Top produtos · 30 dias</p>
      <ul className="mt-2.5 divide-y divide-[var(--card-border)]">
        {resumo.topProdutos.map((p, i) => (
          <li key={p.itemId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--muted)]/10 text-xs font-bold text-[var(--muted)]">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium text-[var(--foreground)]">{p.nome}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{p.vendas} venda{p.vendas !== 1 ? "s" : ""}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold tabular-nums text-[var(--foreground)]">{BRL.format(p.faturamento)}</p>
            </div>
            <a
              href={mlItemPermalink(p.itemId)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            >
              Ver ↗
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function GestoresIaAvulsoDashboardPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [resumo, setResumo] = useState<ResumoFinanceiroAvulso | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }

    // Dashboard é a página de entrada do avulso agora (2026-10-15) — precisa se auto-rotear
    // por tipo de acesso igual as outras telas do avulso, não só confiar no 403 genérico do
    // /resumo (senão assinante só-Calculadora ou seller do hub cai numa tela de erro aqui).
    const meRes = await fetch(`/api/calculadora/me?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok) {
      setAcesso("negado");
      return;
    }
    if (me.access === "seller") {
      router.replace("/seller/cadastro");
      return;
    }
    if (me.access === "calc_only_locked") {
      router.replace("/seller/calculadora");
      return;
    }
    if (me.access === "calc_only" && me.inclui_gestores_ia !== true) {
      router.replace("/seller/gestores-ia-avulso");
      return;
    }
    setLogoUrl(typeof me.logo_url === "string" && me.logo_url.length > 0 ? me.logo_url : null);
    setEmail(typeof me.email === "string" ? me.email : null);

    const res = await fetch(`/api/gestores-ia-avulso/resumo?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 422) {
      setMlConectado(false);
      setAcesso("liberado");
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAcesso("negado");
      return;
    }
    setMlConectado(true);
    setResumo(json as ResumoFinanceiroAvulso);
    setAcesso("liberado");
  }, [router]);

  // Mesmo formato do cabeçalho do /seller/dashboard real (saudação com data por extenso,
  // não "Atualizado às HH:MM") — decisão 2026-10-15, pedido explícito do Sr Stark.
  const dataHojeFmt = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <div className="flex items-stretch gap-3">
            {logoUrl ? (
              <div className="flex shrink-0 items-center">
                <img
                  src={logoUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-2xl border-0 object-contain bg-transparent p-0 outline-none ring-0 sm:h-20 sm:w-20"
                />
              </div>
            ) : (
              <div className="flex shrink-0 items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white shadow-md shadow-emerald-500/25 sm:h-20 sm:w-20">
                  {email?.charAt(0).toUpperCase() ?? "G"}
                </div>
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pt-0.5">
              <p className="m-0 flex min-w-0 items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-emerald-700/90 dark:text-emerald-400/90 leading-snug">
                <IconClock className="h-3.5 w-3.5 shrink-0" />
                Gestor de IA
              </p>
              <h1 className="min-w-0 truncate text-2xl font-bold leading-tight tracking-tight text-[var(--foreground)] sm:text-3xl">
                Dashboard
              </h1>
              <p className="text-base leading-snug text-[var(--muted)] capitalize">{dataHojeFmt}</p>
            </div>
          </div>
          <p className="mt-2 text-sm leading-snug text-[var(--muted)]">
            Lucro, faturamento e produto campeão dos últimos 30 dias — direto da sua conta do Mercado Livre.
          </p>
        </header>

        {acesso === "loading" ? (
          <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-24 w-full" />
          </section>
        ) : acesso === "negado" ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            Não foi possível validar seu acesso.
          </div>
        ) : !mlConectado ? (
          <GestorAvulsoConectarMlEmptyState
            icon={<IconDashboard className="h-6 w-6 shrink-0" />}
            titulo="Conecte sua conta do Mercado Livre primeiro"
            descricao="O Dashboard precisa ler seus pedidos pagos pra calcular faturamento e lucro estimado."
          />
        ) : resumo ? (
          <>
            <ResumoFinanceiroCard resumo={resumo} />
            <TopProdutosCard resumo={resumo} />
          </>
        ) : null}
      </div>
      <SellerNav active="dashboard_avulso" calcOnly temGestoresIa />
    </div>
  );
}
