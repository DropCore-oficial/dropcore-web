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
import type { ResumoFinanceiroAvulso } from "@/lib/ai/gestorAvulsoResumoDados";

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

/** Card "Resultado · últimos 30 dias" — lucro estimado em destaque, faturamento e produto
 * campeão como contexto. Movido pra página própria (2026-10-15, pedido explícito do Sr
 * Stark) — antes vivia embutido no hub `/seller/gestores-ia-avulso`. */
function ResumoFinanceiroCard({ resumo }: { resumo: ResumoFinanceiroAvulso }) {
  const variacao = resumo.faturamento30dVariacaoPct;

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
            >
              {variacao >= 0 ? "↑" : "↓"} {Math.abs(Math.round(variacao))}%
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {resumo.margemMediaPct !== null
            ? `margem de ~${Math.round(resumo.margemMediaPct)}% sobre ${BRL.format(resumo.faturamento30d)} faturados`
            : "cadastre o custo dos seus produtos no ADS pra estimar o lucro"}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--card-border)] p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Faturamento</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--foreground)]">{BRL.format(resumo.faturamento30d)}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {resumo.vendas30d} venda{resumo.vendas30d === 1 ? "" : "s"} paga{resumo.vendas30d === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Produto campeão</p>
          {resumo.produtoCampeao ? (
            <>
              <p className="mt-0.5 line-clamp-2 text-sm font-bold text-[var(--foreground)]">
                {resumo.produtoCampeao.nome}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{resumo.produtoCampeao.vendas} vendas no período</p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-[var(--muted)]">Nenhuma venda no período</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function GestoresIaAvulsoDashboardPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [resumo, setResumo] = useState<ResumoFinanceiroAvulso | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
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
  }, [router]);

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
          <div className="mt-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Dashboard
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Lucro, faturamento e produto campeão dos últimos 30 dias — direto da sua conta do Mercado Livre.
            </p>
          </div>
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
          <ResumoFinanceiroCard resumo={resumo} />
        ) : null}
      </div>
      <SellerNav active="dashboard_avulso" calcOnly temGestoresIa />
    </div>
  );
}
