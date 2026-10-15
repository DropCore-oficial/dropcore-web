"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { IconAndrey, IconAmanda, IconUlisses } from "@/components/seller/GestorAvulsoIcons";
import { GestorAvulsoPendenciasLista, type GestorPendenciaItem } from "@/components/seller/GestorAvulsoPendenciasLista";
import {
  type AndreyRun,
  type AmandaRun,
  type UlissesRun,
  resumoStatusAndrey,
  resumoStatusAmanda,
  resumoStatusUlisses,
  severidadeAndrey,
  severidadeAmanda,
  severidadeUlisses,
} from "@/lib/ai/gestorAvulsoStatusResumo";

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

/** Sparkline — faturamento por dia dos últimos 30 dias. Mesma ideia do mini-gráfico da
 * seção "Desempenho" de `/seller/dashboard`, só que mais simples (sem tooltip custom, usa
 * `title` nativo) — primeira versão de gráfico no Dashboard avulso. */
function SparklineFaturamento({ porDia }: { porDia: ResumoFinanceiroAvulso["porDia30d"] }) {
  const max = Math.max(...porDia.map((d) => d.faturamento), 1);
  return (
    <div className="flex h-10 items-end gap-[2px]">
      {porDia.map((d) => {
        const diaFmt = `${d.dia.slice(8)}/${d.dia.slice(5, 7)}`;
        return (
          <div
            key={d.dia}
            className="min-w-0 flex-1 rounded-t bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            style={{ height: `${Math.max((d.faturamento / max) * 100, d.faturamento > 0 ? 4 : 2)}%` }}
            title={`${diaFmt}: ${BRL.format(d.faturamento)}${d.vendas ? ` · ${d.vendas} venda${d.vendas > 1 ? "s" : ""}` : ""}`}
          />
        );
      })}
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

export default function GestoresIaAvulsoDashboardPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [resumo, setResumo] = useState<ResumoFinanceiroAvulso | null>(null);
  const [andreyRun, setAndreyRun] = useState<AndreyRun>(null);
  const [amandaRun, setAmandaRun] = useState<AmandaRun>(null);
  const [ulissesRun, setUlissesRun] = useState<UlissesRun>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    fetch(`/api/calculadora/me?t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setLogoUrl(typeof j.logo_url === "string" && j.logo_url.length > 0 ? j.logo_url : null);
        setEmail(typeof j.email === "string" ? j.email : null);
      })
      .catch(() => {});
    const res = await fetch(`/api/gestores-ia-avulso/resumo?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 403) {
      setAcesso("negado");
      return;
    }
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

    const [andreyRes, amandaRes, ulissesRes] = await Promise.all([
      fetch("/api/gestores-ia-avulso/andrey", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      fetch("/api/gestores-ia-avulso/amanda", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      fetch("/api/gestores-ia-avulso/ulisses", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
    ]);
    const andreyJson = await andreyRes.json().catch(() => ({}));
    if (andreyRes.ok) setAndreyRun(andreyJson.run ?? null);
    const amandaJson = await amandaRes.json().catch(() => ({}));
    if (amandaRes.ok) setAmandaRun(amandaJson.run ?? null);
    const ulissesJson = await ulissesRes.json().catch(() => ({}));
    if (ulissesRes.ok) setUlissesRun(ulissesJson.run ?? null);
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
          <Link href="/seller/gestores-ia-avulso" className="text-xs font-medium text-[var(--muted)] hover:underline">
            ← Gestor de IA
          </Link>
          <div className="mt-2 flex items-stretch gap-3">
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
            <GestorAvulsoPendenciasLista
              titulo="Pendências dos gestores"
              itens={[
                {
                  href: "/seller/gestores-ia-avulso/andrey",
                  icon: <IconAndrey />,
                  nome: "Anúncio",
                  status: resumoStatusAndrey(andreyRun),
                  severidade: severidadeAndrey(andreyRun),
                },
                {
                  href: "/seller/gestores-ia-avulso/amanda",
                  icon: <IconAmanda />,
                  nome: "SAC",
                  status: resumoStatusAmanda(amandaRun),
                  severidade: severidadeAmanda(amandaRun),
                },
                {
                  href: "/seller/gestores-ia-avulso/ulisses",
                  icon: <IconUlisses />,
                  nome: "ADS",
                  status: resumoStatusUlisses(ulissesRun),
                  severidade: severidadeUlisses(ulissesRun),
                },
              ] satisfies GestorPendenciaItem[]}
            />
          </>
        ) : null}
      </div>
      <SellerNav active="dashboard_avulso" calcOnly temGestoresIa />
    </div>
  );
}
