"use client";

import { useEffect, useState } from "react";
import { AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";

export const PLAN_LIMITS_REFRESH_EVENT = "plan-limits-refresh";

type PlanLimits = {
  vendas_mes: number;
  vendas_limite: number;
  produto_cor_count: number;
  produto_cor_limite: number;
};

export function PlanLimitsBadge() {
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token || cancelled) return;
      const res = await fetch("/api/org/plan-limits", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const json = await res.json();
      if (cancelled || !res.ok) return;
      if (json?.plan_limits) setLimits(json.plan_limits);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1);
    window.addEventListener(PLAN_LIMITS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(PLAN_LIMITS_REFRESH_EVENT, handler);
  }, []);

  if (!limits) return null;

  const vendasProximo = limits.vendas_mes >= limits.vendas_limite * 0.8;
  const produtosProximo = limits.produto_cor_count >= limits.produto_cor_limite * 0.8;
  const alerta = vendasProximo || produtosProximo;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-3 rounded-full px-3 py-1 text-[11px] font-medium",
        alerta
          ? cn(AMBER_PREMIUM_SHELL, "text-neutral-800 dark:text-neutral-100")
          : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)]"
      )}
      title={alerta ? "Próximo do limite do plano Starter. Faça upgrade para Pro." : undefined}
    >
      <span>
        Vendas:{" "}
        <strong className={alerta && vendasProximo ? AMBER_PREMIUM_TEXT_PRIMARY : "text-[var(--foreground)]"}>
          {limits.vendas_mes}/{limits.vendas_limite}
        </strong>
      </span>
      <span className="text-[var(--muted)]">|</span>
      <span>
        Produtos:{" "}
        <strong className={alerta && produtosProximo ? AMBER_PREMIUM_TEXT_PRIMARY : "text-[var(--foreground)]"}>
          {limits.produto_cor_count}/{limits.produto_cor_limite}
        </strong>
      </span>
    </span>
  );
}
