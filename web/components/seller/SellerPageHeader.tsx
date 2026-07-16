"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type SellerPageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  showBack?: boolean;
  backHref?: string;
  right?: React.ReactNode;
  /** Conteúdo extra ao lado do título/barra degradê (ex.: filtro compacto). */
  titleExtra?: ReactNode;
  /** Variante de cabeçalho em formato de cartão para páginas principais. */
  surface?: "plain" | "hero";
  className?: string;
};

export function SellerPageHeader({
  title,
  subtitle,
  showBack = false,
  backHref = "/seller/dashboard",
  right,
  titleExtra,
  surface = "plain",
  className,
}: SellerPageHeaderProps) {
  const router = useRouter();
  const titleClass =
    surface === "hero"
      ? "text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight leading-[1.15]"
      : "text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight leading-snug";
  const accentClass =
    surface === "hero"
      ? "h-1 min-h-1 w-14 sm:w-20 rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 shrink-0 self-center"
      : "h-1 w-10 sm:w-12 rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 shrink-0 self-center";
  const subtitleClass =
    surface === "hero"
      ? "text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mt-2 sm:mt-2.5 max-w-2xl leading-relaxed"
      : "text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1 sm:mt-1.5 max-w-xl leading-relaxed";

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        {showBack && (
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 mb-2 sm:mb-3 transition-colors group touch-manipulation min-h-[44px] sm:min-h-0 -ml-1 px-1 rounded-lg active:bg-neutral-100/80 dark:active:bg-neutral-800/50"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Voltar
          </button>
        )}
        <div className={`flex items-center gap-2 sm:gap-3 ${titleExtra ? "flex-nowrap" : "flex-wrap"}`}>
          <h1 className={cn(titleClass, titleExtra ? "min-w-0 truncate" : undefined)}>{title}</h1>
          <span className={accentClass} aria-hidden />
          {titleExtra}
        </div>
        {subtitle && <div className={subtitleClass}>{subtitle}</div>}
      </div>
      {right && <div className="w-full shrink-0 sm:w-auto">{right}</div>}
    </>
  );

  if (surface === "hero") {
    return (
      <header
        className={cn(
          "relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[var(--card-border)] bg-[var(--card)] mb-5 sm:mb-7 animate-fade-in-up",
          className
        )}
      >
        <div className="relative flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-5 sm:px-7 sm:py-6 md:px-8 md:py-7">
          {inner}
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-4 sm:mb-5 md:mb-6 animate-fade-in-up",
        className
      )}
    >
      {inner}
    </header>
  );
}
