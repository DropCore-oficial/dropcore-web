"use client";

import { FornecedorNav } from "@/app/fornecedor/FornecedorNav";

/** Layout leve do dashboard atrás do bloqueio de mensalidade (sem APIs). */
export function FornecedorPortalBlockedShell() {
  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <FornecedorNav active="dashboard" />
      <div className="dropcore-shell-4xl py-5 md:py-7 space-y-5 md:space-y-6" aria-hidden>
        <header className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 shadow-sm">
          <div className="flex gap-3">
            <div className="h-[5.25rem] w-[5.25rem] shrink-0 rounded-2xl bg-neutral-200/80 dark:bg-neutral-800/80 sm:h-[5.5rem] sm:w-[5.5rem]" />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              <div className="h-3 w-28 rounded bg-neutral-200/80 dark:bg-neutral-800/80" />
              <div className="h-7 w-48 max-w-full rounded bg-neutral-200/80 dark:bg-neutral-800/80" />
              <p className="text-base capitalize text-[var(--muted)]">{dataHoje}</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm"
            >
              <div className="h-3 w-16 rounded bg-neutral-200/80 dark:bg-neutral-800/80" />
              <div className="mt-3 h-7 w-24 rounded bg-neutral-200/80 dark:bg-neutral-800/80" />
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 shadow-sm min-h-[220px]">
          <div className="h-4 w-32 rounded bg-neutral-200/80 dark:bg-neutral-800/80" />
          <div className="mt-6 flex h-36 items-end gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-neutral-200/60 dark:bg-neutral-800/60"
                style={{ height: `${35 + (i % 4) * 15}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
