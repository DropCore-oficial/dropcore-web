"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

type SellerPageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  showBack?: boolean;
  backHref?: string;
  right?: React.ReactNode;
  /** Cartão com gradiente suave — páginas principais (ex.: catálogo) */
  surface?: "plain" | "hero";
};

export function SellerPageHeader({
  title,
  subtitle,
  showBack = false,
  backHref = "/seller/dashboard",
  right,
  surface = "plain",
}: SellerPageHeaderProps) {
  const router = useRouter();
  const titleClass =
    surface === "hero"
      ? "text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight leading-[1.15]"
      : "text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight leading-snug";
  const accentClass =
    surface === "hero"
      ? "h-1 w-12 sm:w-14 rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300/80 shrink-0 self-center shadow-sm shadow-emerald-500/25"
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
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className={titleClass}>{title}</h1>
          <span className={accentClass} aria-hidden />
        </div>
        {subtitle && <p className={subtitleClass}>{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </>
  );

  if (surface === "hero") {
    return (
      <header className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-neutral-200/80 dark:border-neutral-800/90 bg-white/90 dark:bg-neutral-900/75 backdrop-blur-md shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08),0_1px_0_rgba(255,255,255,0.6)_inset] dark:shadow-[0_4px_32px_-8px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.06)_inset] mb-5 sm:mb-7 animate-fade-in-up">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_0%_-40%,rgba(16,185,129,0.14),transparent_50%),radial-gradient(ellipse_80%_60%_at_100%_0%,rgba(20,184,166,0.1),transparent_45%)] dark:bg-[radial-gradient(ellipse_100%_80%_at_0%_-40%,rgba(16,185,129,0.18),transparent_52%),radial-gradient(ellipse_70%_50%_at_100%_0%,rgba(56,189,248,0.08),transparent_48%)]"
          aria-hidden
        />
        <div className="relative flex items-start justify-between gap-3 sm:gap-5 px-4 py-5 sm:px-7 sm:py-6 md:px-8 md:py-7">
          {inner}
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-5 md:mb-6 animate-fade-in-up">
      {inner}
    </header>
  );
}
