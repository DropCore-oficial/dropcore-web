"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { MobileAppBar } from "@/components/MobileAppBar";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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
  const router = useRouter();
  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/fornecedor/login");
  }

  const linkClass = (key: "dashboard" | "produtos" | "pedidos" | "cadastro") =>
    `flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-b-2 -mb-px relative ${
      active === key ? activeClass + " hover:bg-emerald-100 dark:hover:bg-emerald-900" : inactiveClass + " border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800"
    }`;

  const mobileLinkClass = (key: "dashboard" | "produtos" | "pedidos" | "cadastro") =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-visible px-1.5 py-2.5 transition-all duration-200 border-t-2 touch-manipulation relative ${
      active === key ? activeClass + " bg-emerald-100 dark:bg-emerald-900" : inactiveClass + " border-transparent active:bg-neutral-100 dark:active:bg-neutral-800"
    }`;

  const actionsClass =
    "rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors";

  return (
    <>
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-sm">
        <div className="dropcore-shell-4xl flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <DropCoreLogo variant="horizontal" href="/fornecedor/dashboard" className="shrink-0" />
            <div className="flex min-w-0 items-center justify-start gap-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <NotificationBell context="fornecedor" />
            <ThemeToggle className="shrink-0" />
            <button type="button" onClick={() => void sair()} className={actionsClass}>
              Sair
            </button>
          </div>
        </div>
      </nav>

      <MobileAppBar
        logoHref="/fornecedor/dashboard"
        end={
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell context="fornecedor" className="shrink-0" />
            <ThemeToggle className="shrink-0 rounded-lg p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center" />
            <button
              type="button"
              onClick={() => void sair()}
              className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:border-red-200 hover:text-red-600 dark:border-neutral-600 dark:text-neutral-300 dark:hover:border-red-900/60 dark:hover:text-red-400"
            >
              Sair
            </button>
          </div>
        }
      />

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.5)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-4 items-stretch min-h-[56px]">
          <Link href="/fornecedor/dashboard" className={mobileLinkClass("dashboard")}>
            <IconHome active={active === "dashboard"} />
            <span className="max-w-[5.25rem] text-center text-[10px] font-medium leading-tight tracking-tight">Dashboard</span>
          </Link>
          <Link href="/fornecedor/produtos" className={mobileLinkClass("produtos")}>
            <IconPackage active={active === "produtos"} />
            <span className="max-w-[5.25rem] text-center text-[10px] font-medium leading-tight tracking-tight">Produtos</span>
          </Link>
          <Link href="/fornecedor/pedidos" className={mobileLinkClass("pedidos")}>
            <IconTruck active={active === "pedidos"} />
            <span className="max-w-[5.25rem] text-center text-[10px] font-medium leading-tight tracking-tight">Pedidos</span>
          </Link>
          <Link href="/fornecedor/cadastro" className={mobileLinkClass("cadastro")}>
            <IconCreditCard active={active === "cadastro"} />
            <span className="max-w-[5.25rem] text-center text-[10px] font-medium leading-tight tracking-tight">Cadastro</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
