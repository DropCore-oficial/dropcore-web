"use client";

import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

type MobileAppBarProps = {
  logoHref: string;
  /** Conteúdo à direita (default: ThemeToggle) */
  end?: React.ReactNode;
  className?: string;
};

/**
 * Barra fixa no topo só em mobile (`md:hidden`), com logo DropCore horizontal completo + tema.
 * Use em conjunto com `pt-[calc(3.5rem+env(safe-area-inset-top,0px))]` no container da página (altura h-14).
 */
export function MobileAppBar({ logoHref, end, className = "" }: MobileAppBarProps) {
  return (
    <header
      className={`md:hidden fixed left-0 right-0 top-0 z-40 overflow-visible border-b border-neutral-200/80 bg-white/[0.98] backdrop-blur-xl dark:border-neutral-800/80 dark:bg-neutral-950/[0.98] ${className}`}
    >
      <div className="pt-[env(safe-area-inset-top,0px)]">
        <div className="dropcore-shell-4xl flex h-14 min-h-14 items-center justify-between gap-2">
          <DropCoreLogo
            variant="horizontal"
            href={logoHref}
            className="min-w-0 shrink-0 overflow-visible py-0.5"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            {end ?? (
              <ThemeToggle className="shrink-0 rounded-lg p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
