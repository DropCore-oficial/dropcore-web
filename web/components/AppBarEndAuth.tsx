"use client";

import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";

const btnSairMobile =
  "inline-flex h-10 min-w-[2.75rem] shrink-0 items-center justify-center rounded-xl border border-[var(--chrome-border)] bg-[var(--card)] px-2.5 text-[11px] font-semibold leading-none text-[var(--chrome-icon)] shadow-none transition-colors touch-manipulation hover:border-red-300 hover:text-red-600 dark:hover:border-red-800/60 dark:hover:text-red-400";

const btnSairDesktop =
  "inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-[var(--chrome-border)] bg-[var(--card)] px-3 text-sm font-medium leading-none text-[var(--chrome-icon)] shadow-none transition-colors hover:text-[var(--foreground)]";

/**
 * Ações à direita da `MobileAppBar`: sino + tema + Sair (mesmo padrão do fornecedor).
 */
export function AppBarEndMobileAuth({
  context,
  onLogout,
  logoutLabel = "Sair",
}: {
  context: "admin" | "seller" | "fornecedor";
  onLogout: () => void | Promise<void>;
  logoutLabel?: string;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1">
      <NotificationBell context={context} className="flex shrink-0 items-center" />
      <ThemeToggle />
      <button type="button" onClick={() => void onLogout()} className={btnSairMobile}>
        {logoutLabel}
      </button>
    </div>
  );
}

/**
 * Trio na barra superior desktop (nav fixa `md:flex`), alinhado ao fornecedor.
 */
export function AppBarEndDesktopAuth({
  context,
  onLogout,
}: {
  context: "admin" | "seller" | "fornecedor";
  onLogout: () => void | Promise<void>;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <NotificationBell context={context} />
      <ThemeToggle />
      <button type="button" onClick={() => void onLogout()} className={btnSairDesktop}>
        Sair
      </button>
    </div>
  );
}
