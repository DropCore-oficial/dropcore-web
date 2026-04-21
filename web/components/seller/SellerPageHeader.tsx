"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

type SellerPageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  showBack?: boolean;
  backHref?: string;
  right?: React.ReactNode;
};

export function SellerPageHeader({ title, subtitle, showBack = false, backHref = "/seller/dashboard", right }: SellerPageHeaderProps) {
  const router = useRouter();
  return (
    <header className="flex items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-5 md:mb-6 animate-fade-in-up">
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
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight leading-snug">{title}</h1>
          <span className="h-1 w-10 sm:w-12 rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 shrink-0 self-center" aria-hidden />
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1 sm:mt-1.5 max-w-xl leading-relaxed">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
