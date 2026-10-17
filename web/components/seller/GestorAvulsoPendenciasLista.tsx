"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { type Severidade, SEVERIDADE_TEXT_CLASS } from "@/lib/ai/gestorAvulsoStatusResumo";

export type GestorPendenciaItem = {
  href: string;
  icon: ReactNode;
  nome: string;
  /** Subtítulo estático (ex: "Anúncios & SEO") — opcional, hub usa, Dashboard não. */
  funcao?: string;
  status: string;
  severidade: Severidade;
  bloqueado?: boolean;
};

/** Ícone do gestor fica neutro (mesmo tom pros 4) — nunca carrega identidade por cor nem
 * estado. Referência pedida pelo Sr Stark: admin de verdade do Shopify, onde o ícone de
 * categoria é monocromático e a diferenciação vive só no texto/badge, não num avatar
 * colorido (decisão 2026-10-14). */
const GESTOR_ICON_CHIP_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] text-[var(--foreground)]";

/** Lista compacta de status dos gestores, na mesma sequência do menu "Gestor de IA"
 * (`GESTORES_IA_SUBITENS` em `SellerNav.tsx`) — ordem fixa, não por urgência (ajuste
 * 2026-10-16, pedido do Sr Stark: a lista ficava fora de ordem em relação ao menu quando um
 * gestor tinha severidade maior). Substitui (2026-10-15) o grid de cards grandes
 * `GestorCardAvulso` que vivia só no hub. Usada no hub (`/seller/gestores-ia-avulso`, sem
 * `titulo` — as linhas vão soltas, o cabeçalho da página já dá contexto). */
export function GestorAvulsoPendenciasLista({ itens, titulo }: { itens: GestorPendenciaItem[]; titulo?: string }) {
  const lista = (
    <div className="space-y-2">
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center gap-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 transition-all hover:border-emerald-300 hover:shadow-sm dark:hover:border-emerald-700"
        >
          <span className={GESTOR_ICON_CHIP_CLASS}>{item.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <p className="font-semibold text-[var(--foreground)]">{item.nome}</p>
              {item.funcao ? <p className="truncate text-xs text-[var(--muted)]">{item.funcao}</p> : null}
            </div>
            <p
              className={cn(
                "text-xs",
                item.severidade === "neutro" ? "text-[var(--muted)]" : cn("font-medium", SEVERIDADE_TEXT_CLASS[item.severidade])
              )}
            >
              {item.status}
            </p>
            {item.bloqueado ? (
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">Orçamento de hoje esgotado — volta à meia-noite.</p>
            ) : null}
          </div>
          <svg className="h-4 w-4 shrink-0 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Link>
      ))}
    </div>
  );

  if (!titulo) return lista;

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{titulo}</p>
      <div className="mt-2.5">{lista}</div>
    </section>
  );
}
