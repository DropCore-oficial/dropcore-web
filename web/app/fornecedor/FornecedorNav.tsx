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
function IconTruck({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18h2" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    </svg>
  );
}
function IconCreditCard({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

export function FornecedorNav({ active }: { active: "dashboard" | "produtos" | "pedidos" | "cadastro" }) {
  const linkClass = (key: "dashboard" | "produtos" | "pedidos" | "cadastro") =>
    `flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-b-2 -mb-px relative ${
      active === key ? activeClass + " hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20" : inactiveClass + " border-transparent hover:bg-neutral-100/80 dark:hover:bg-neutral-800/50"
    }`;

  const mobileLinkClass = (key: "dashboard" | "produtos" | "pedidos" | "cadastro") =>
    `flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2 transition-all duration-200 border-t-2 relative ${
      active === key ? activeClass + " bg-emerald-50/30 dark:bg-emerald-950/20" : inactiveClass + " border-transparent active:bg-neutral-100 dark:active:bg-neutral-800/50"
    }`;

  return (
    <>
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/98 dark:bg-neutral-950/98 backdrop-blur-xl shadow-sm">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 flex items-center gap-8">
          <DropCoreLogo variant="horizontal" href="/fornecedor/dashboard" className="shrink-0" />
          <div className="flex items-center gap-0.5">
            <Link href="/fornecedor/dashboard" className={linkClass("dashboard")}>
              <IconHome active={active === "dashboard"} />
              Dashboard
            </Link>
            <Link href="/fornecedor/produtos" className={linkClass("produtos")}>
              <IconPackage active={active === "produtos"} />
              Produtos
            </Link>
            <Link href="/fornecedor/pedidos" className={linkClass("pedidos")}>
              <IconTruck active={active === "pedidos"} />
              Pedidos
            </Link>
            <Link href="/fornecedor/cadastro" className={linkClass("cadastro")}>
              <IconCreditCard active={active === "cadastro"} />
              Cadastro
            </Link>
          </div>
          <Link
            href="/fornecedor/dashboard"
            className="ml-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Início
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200/80 dark:border-neutral-800/80 bg-white/[0.98] dark:bg-neutral-950/[0.98] backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.5)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-3xl mx-auto grid grid-cols-5 min-h-[52px] items-stretch">
          <Link href="/fornecedor/dashboard" className={mobileLinkClass("dashboard")}>
            <IconHome active={active === "dashboard"} />
            <span className="text-[10px] font-medium">Dashboard</span>
          </Link>
          <Link href="/fornecedor/produtos" className={mobileLinkClass("produtos")}>
            <IconPackage active={active === "produtos"} />
            <span className="text-[10px] font-medium">Produtos</span>
          </Link>
          <Link href="/fornecedor/pedidos" className={mobileLinkClass("pedidos")}>
            <IconTruck active={active === "pedidos"} />
            <span className="text-[10px] font-medium">Pedidos</span>
          </Link>
          <Link href="/fornecedor/cadastro" className={mobileLinkClass("cadastro")}>
            <IconCreditCard active={active === "cadastro"} />
            <span className="text-[10px] font-medium">Cadastro</span>
          </Link>
          <div className="flex flex-col items-center justify-center gap-0.5 border-t-2 border-transparent py-2 px-1 min-h-[52px] touch-manipulation">
            <ThemeToggle className="p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center shrink-0 rounded-lg" />
            <span className="text-[9px] font-medium text-neutral-500 dark:text-neutral-400 leading-none">Tema</span>
          </div>
        </div>
      </nav>
    </>
  );
}
