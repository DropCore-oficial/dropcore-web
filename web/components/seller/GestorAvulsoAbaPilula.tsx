"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pílula de aba — extraída de `gestores-ia-avulso/ulisses/page.tsx` (2026-10-14) pra
 * reaproveitar no Andrey e em futuros gestores que precisem filtrar resultado por tipo,
 * em vez de listar tudo solto junto numa lista só. */
export function AbaPilula({
  ativo,
  onClick,
  icon,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors touch-manipulation",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]",
        ativo
          ? "bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700"
          : "text-[var(--muted)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)]"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
