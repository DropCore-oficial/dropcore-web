"use client";

import Link from "next/link";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

const activeClass = "text-emerald-600 dark:text-emerald-400 border-emerald-500";
const inactiveClass = "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 border-transparent";

function IconHome({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function IconPackage({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}
function IconCalculator({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" />
      <line x1="16" x2="16" y1="14" y2="14.01" />
      <line x1="16" x2="16" y1="18" y2="18.01" />
      <line x1="12" x2="12" y1="14" y2="14.01" />
      <line x1="12" x2="12" y1="18" y2="18.01" />
      <line x1="8" x2="8" y1="14" y2="14.01" />
      <line x1="8" x2="8" y1="18" y2="18.01" />
    </svg>
  );
}
function IconPlug({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  );
}

export function SellerNav({
  active,
  calcOnly = false,
}: {
  active: "dashboard" | "catalogo" | "calculadora" | "integracoes";
  /** Só assinatura calculadora: esconde Dashboard, Catálogo e Integrações */
  calcOnly?: boolean;
}) {
  const linkClass = (key: "dashboard" | "catalogo" | "calculadora" | "integracoes") =>
    `flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-b-2 -mb-px relative ${
      active === key ? activeClass + " hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20" : inactiveClass + " border-transparent hover:bg-neutral-100/80 dark:hover:bg-neutral-800/50"
    }`;

  const mobileLinkClass = (key: "dashboard" | "catalogo" | "calculadora" | "integracoes") =>
    `flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2 transition-all duration-200 border-t-2 relative ${
      active === key ? activeClass + " bg-emerald-50/30 dark:bg-emerald-950/20" : inactiveClass + " border-transparent active:bg-neutral-100 dark:active:bg-neutral-800/50"
    }`;

  if (calcOnly) {
    return (
      <>
        <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/98 dark:bg-neutral-950/98 backdrop-blur-xl shadow-sm">
          <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 flex items-center gap-8">
            <DropCoreLogo variant="horizontal" href="/seller/calculadora" className="shrink-0" />
            <div className="flex items-center gap-0.5">
              <Link href="/seller/calculadora" className={linkClass("calculadora")}>
                <IconCalculator active={active === "calculadora"} />
                Calculadora
              </Link>
            </div>
            <Link
              href="/seller/dashboard"
              className="ml-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Início
            </Link>
            <ThemeToggle />
          </div>
        </nav>
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200/80 dark:border-neutral-800/80 bg-white/[0.98] dark:bg-neutral-950/[0.98] backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
          <div className="max-w-3xl mx-auto flex justify-center">
            <Link href="/seller/calculadora" className={`${mobileLinkClass("calculadora")} flex-1 max-w-[200px]`}>
              <IconCalculator active={active === "calculadora"} />
              <span className="text-[10px] font-medium">Calculadora</span>
            </Link>
          </div>
        </nav>
      </>
    );
  }

  return (
    <>
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/98 dark:bg-neutral-950/98 backdrop-blur-xl shadow-sm">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 flex items-center gap-8">
          <DropCoreLogo variant="horizontal" href="/seller/dashboard" className="shrink-0" />
          <div className="flex items-center gap-0.5">
            <Link href="/seller/dashboard" className={linkClass("dashboard")}>
              <IconHome active={active === "dashboard"} />
              Dashboard
            </Link>
            <Link href="/seller/catalogo" className={linkClass("catalogo")}>
              <IconPackage active={active === "catalogo"} />
              Catálogo
            </Link>
            <Link href="/seller/calculadora" className={linkClass("calculadora")}>
              <IconCalculator active={active === "calculadora"} />
              Calculadora
            </Link>
            <Link href="/seller/integracoes-erp" className={linkClass("integracoes")}>
              <IconPlug active={active === "integracoes"} />
              Integrações
            </Link>
          </div>
          <Link
            href="/seller/dashboard"
            className="ml-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Início
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200/80 dark:border-neutral-800/80 bg-white/[0.98] dark:bg-neutral-950/[0.98] backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <div className="max-w-3xl mx-auto flex">
          <Link href="/seller/dashboard" className={mobileLinkClass("dashboard")}>
            <IconHome active={active === "dashboard"} />
            <span className="text-[10px] font-medium">Dashboard</span>
          </Link>
          <Link href="/seller/catalogo" className={mobileLinkClass("catalogo")}>
            <IconPackage active={active === "catalogo"} />
            <span className="text-[10px] font-medium">Catálogo</span>
          </Link>
          <Link href="/seller/calculadora" className={mobileLinkClass("calculadora")}>
            <IconCalculator active={active === "calculadora"} />
            <span className="text-[10px] font-medium">Calculadora</span>
          </Link>
          <Link href="/seller/integracoes-erp" className={mobileLinkClass("integracoes")}>
            <IconPlug active={active === "integracoes"} />
            <span className="text-[10px] font-medium">Integrações</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
