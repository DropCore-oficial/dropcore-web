"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Mesmas classes que `FornecedorNav` / `SellerNav` (mobile) — borda superior + estado ativo emerald */
const activeClass =
  "text-emerald-600 dark:text-emerald-400 border-emerald-500 bg-emerald-100 dark:bg-emerald-950/20";
const inactiveClass =
  "text-neutral-500 dark:text-neutral-400 border-transparent hover:text-neutral-900 dark:hover:text-neutral-100 active:bg-neutral-100 dark:active:bg-neutral-800/50";

function IconHome({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconBuilding({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}

function IconClipboard({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    </svg>
  );
}

function IconPackage({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

const items: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/dashboard", label: "Início", match: (p) => p === "/dashboard" },
  { href: "/admin/empresas", label: "Empresas", match: (p) => p.startsWith("/admin/empresas") },
  {
    href: "/admin/alteracoes-produtos",
    label: "Alterações",
    match: (p) => p.startsWith("/admin/alteracoes-produtos"),
  },
  { href: "/admin/pedidos", label: "Pedidos", match: (p) => p.startsWith("/admin/pedidos") },
];

/**
 * Barra inferior fixa no mobile para admins (espelha `FornecedorNav` / `SellerNav`).
 * z-[100] para ficar acima do indicador de dev do Next (canto inferior esquerdo em dev).
 */
export function AdminMobileBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-neutral-200/80 bg-white/[0.98] pb-[env(safe-area-inset-bottom)] dark:border-neutral-800/80 dark:bg-neutral-950/[0.98] md:hidden backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
      aria-label="Navegação admin"
    >
      <div className="mx-auto grid min-h-[56px] max-w-3xl grid-cols-5 items-stretch">
        {items.map((item) => {
          const active = item.match(pathname);
          const icon =
            item.href === "/dashboard" ? (
              <IconHome active={active} />
            ) : item.href === "/admin/empresas" ? (
              <IconBuilding active={active} />
            ) : item.href === "/admin/alteracoes-produtos" ? (
              <IconClipboard active={active} />
            ) : (
              <IconPackage active={active} />
            );
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-1 overflow-visible border-t-2 px-1.5 py-2.5 transition-all duration-200 ${
                active ? activeClass : inactiveClass
              }`}
            >
              {icon}
              <span className="max-w-[5.25rem] text-center text-[10px] font-medium leading-tight tracking-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
        <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 border-l border-neutral-200/60 py-1.5 touch-manipulation dark:border-neutral-800/80">
          <ThemeToggle className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white p-1.5 dark:border-neutral-700 dark:bg-neutral-900" />
          <span className="max-w-[4.5rem] text-center text-[10px] font-medium leading-tight text-neutral-500 dark:text-neutral-400">
            Tema
          </span>
        </div>
      </div>
    </nav>
  );
}
