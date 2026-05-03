"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppBarEndDesktopAuth, AppBarEndMobileAuth } from "@/components/AppBarEndAuth";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { MobileAppBar } from "@/components/MobileAppBar";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const activeClass = "text-emerald-600 dark:text-emerald-400 border-emerald-500";
const inactiveDesktop =
  "text-[var(--muted)] hover:text-[var(--foreground)] border-transparent hover:bg-[var(--surface-hover)]";
const inactiveMobile =
  "text-[var(--muted)] active:text-[var(--foreground)] border-transparent active:bg-[var(--surface-hover)]";

function IconHome({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function IconPackage({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}
function IconTruck({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18h2" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    </svg>
  );
}
function IconCreditCard({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

/** Área fixa para ícones da nav desktop — mesmo “peso” visual entre rotas. */
function NavIconDesktop({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center [&_svg]:block [&_svg]:h-5 [&_svg]:w-5">
      {children}
    </span>
  );
}

/** Área fixa para ícones da tab bar mobile. */
function NavIconMobile({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-9 w-full shrink-0 items-center justify-center [&_svg]:block [&_svg]:h-5 [&_svg]:w-5">
      {children}
    </span>
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
      active === key ? activeClass + " hover:bg-emerald-100 dark:hover:bg-emerald-900" : inactiveDesktop
    }`;

  const mobileLinkClass = (key: "dashboard" | "produtos" | "pedidos" | "cadastro") =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-visible px-1.5 py-2.5 transition-all duration-200 border-t-2 touch-manipulation relative ${
      active === key ? activeClass + " bg-emerald-100 dark:bg-emerald-900" : inactiveMobile
    }`;

  return (
    <>
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm">
        <div className="dropcore-shell-4xl flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <DropCoreLogo variant="horizontal" href="/fornecedor/dashboard" className="shrink-0" />
            <div className="flex min-w-0 items-center justify-start gap-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link href="/fornecedor/dashboard" className={linkClass("dashboard")}>
                <NavIconDesktop>
                  <IconHome active={active === "dashboard"} />
                </NavIconDesktop>
                Dashboard
              </Link>
              <Link href="/fornecedor/produtos" className={linkClass("produtos")}>
                <NavIconDesktop>
                  <IconPackage active={active === "produtos"} />
                </NavIconDesktop>
                Produtos
              </Link>
              <Link href="/fornecedor/pedidos" className={linkClass("pedidos")}>
                <NavIconDesktop>
                  <IconTruck active={active === "pedidos"} />
                </NavIconDesktop>
                Pedidos
              </Link>
              <Link href="/fornecedor/cadastro" className={linkClass("cadastro")}>
                <NavIconDesktop>
                  <IconCreditCard active={active === "cadastro"} />
                </NavIconDesktop>
                Cadastro
              </Link>
            </div>
          </div>
          <AppBarEndDesktopAuth context="fornecedor" onLogout={sair} />
        </div>
      </nav>

      <MobileAppBar
        logoHref="/fornecedor/dashboard"
        end={<AppBarEndMobileAuth context="fornecedor" onLogout={sair} />}
      />

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-chrome-up)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-4 items-stretch min-h-[56px]">
          <Link href="/fornecedor/dashboard" className={mobileLinkClass("dashboard")}>
            <NavIconMobile>
              <IconHome active={active === "dashboard"} />
            </NavIconMobile>
            <span className="max-w-[5.25rem] text-center text-[10px] font-medium leading-tight tracking-tight">Dashboard</span>
          </Link>
          <Link href="/fornecedor/produtos" className={mobileLinkClass("produtos")}>
            <NavIconMobile>
              <IconPackage active={active === "produtos"} />
            </NavIconMobile>
            <span className="max-w-[5.25rem] text-center text-[10px] font-medium leading-tight tracking-tight">Produtos</span>
          </Link>
          <Link href="/fornecedor/pedidos" className={mobileLinkClass("pedidos")}>
            <NavIconMobile>
              <IconTruck active={active === "pedidos"} />
            </NavIconMobile>
            <span className="max-w-[5.25rem] text-center text-[10px] font-medium leading-tight tracking-tight">Pedidos</span>
          </Link>
          <Link href="/fornecedor/cadastro" className={mobileLinkClass("cadastro")}>
            <NavIconMobile>
              <IconCreditCard active={active === "cadastro"} />
            </NavIconMobile>
            <span className="max-w-[5.25rem] text-center text-[10px] font-medium leading-tight tracking-tight">Cadastro</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
