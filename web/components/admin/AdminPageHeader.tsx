"use client";

import type { ReactNode } from "react";
import Link from "next/link";

type AdminPageHeaderProps = {
  /** Ex: "Operação", "Financeiro" — label curto em maiúsculo acima do título. */
  eyebrow: string;
  title: string;
  /** Conteúdo extra ao lado do título (ex: PlanLimitsBadge). */
  titleExtra?: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  /** Filtros/ações do lado direito (desktop) / abaixo (mobile). */
  right?: ReactNode;
};

/**
 * Header padrão das páginas /admin/* — mesmo cartão usado em /dashboard e nas
 * dashboards de fornecedor/seller (rounded-2xl, shadow-sm, p-4/sm:p-5).
 * Fonte única: antes esse bloco era copiado à mão em cada página admin.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  titleExtra,
  subtitle,
  backHref = "/dashboard",
  right,
}: AdminPageHeaderProps) {
  return (
    <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0 space-y-1">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Voltar
          </Link>
          <p className="text-sm font-medium uppercase leading-snug tracking-wide text-emerald-700/90 dark:text-emerald-400/90">
            {eyebrow}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">{title}</h1>
            {titleExtra}
          </div>
          {subtitle && <p className="max-w-xl text-sm leading-snug text-[var(--muted)]">{subtitle}</p>}
        </div>
        {right && (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end sm:pt-0.5">
            {right}
          </div>
        )}
      </div>
    </header>
  );
}
