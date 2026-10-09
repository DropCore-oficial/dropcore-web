"use client";

import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";

export type UsoTokensHoje = { tokens: number; cota: number };

const TOKENS_FMT = new Intl.NumberFormat("pt-BR");

/**
 * Barra de orçamento diário dos gestores avulso (R$4/dia da chave da casa, ~280k tokens
 * estimados, reseta à meia-noite BRT) — compartilhada entre Andrey/Amanda/Tiago (os únicos
 * que gastam token de IA; Ulisses é 100% código, não usa). Fixa (`sticky`) logo abaixo da
 * barra superior fixa, pra ficar visível rolando a página — antes era o primeiro bloco de
 * conteúdo normal, duplicado em 3 arquivos, cada um ia embora ao rolar.
 */
export function GestorAvulsoOrcamentoBar({
  usoTokensHoje,
  bloqueadoHoje,
}: {
  usoTokensHoje: UsoTokensHoje | null;
  bloqueadoHoje: boolean;
}) {
  if (!usoTokensHoje) return null;
  const pct = Math.min(100, Math.round((usoTokensHoje.tokens / usoTokensHoje.cota) * 100));

  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-30 md:top-14 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-[var(--foreground)]">Uso dos Gestores de IA hoje</span>
        <span className={cn("font-semibold", bloqueadoHoje ? DANGER_PREMIUM_TEXT_PRIMARY : "text-[var(--muted)]")}>
          {pct}% usado · {TOKENS_FMT.format(usoTokensHoje.tokens)} de {TOKENS_FMT.format(usoTokensHoje.cota)} tokens
        </span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutral-200/80 ring-1 ring-inset ring-neutral-300/30 dark:bg-neutral-800 dark:ring-neutral-700/50">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            bloqueadoHoje
              ? "bg-gradient-to-r from-red-500 to-red-600"
              : pct >= 80
                ? "bg-gradient-to-r from-amber-500 to-amber-600"
                : "bg-gradient-to-r from-emerald-500 to-emerald-600"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--muted)]">Redefine às 00:00</p>
    </div>
  );
}
