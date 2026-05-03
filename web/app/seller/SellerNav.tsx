"use client";

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

type NavKey = "dashboard" | "produtos" | "calculadora" | "integracoes";

export function SellerNav({
  active,
  calcOnly = false,
}: {
  active: NavKey;
  /** Só assinatura calculadora: esconde Dashboard e Integrações */
  calcOnly?: boolean;
}) {
  const router = useRouter();

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/seller/login");
  }

  async function sairCalculadoraNav() {
    await supabaseBrowser.auth.signOut();
    router.replace("/calculadora/login");
  }

  const linkClass = (key: NavKey) =>
    `flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-b-2 -mb-px relative ${
      active === key ? activeClass + " hover:bg-emerald-100 dark:hover:bg-emerald-900" : inactiveDesktop
    }`;

  const mobileLinkClass = (key: NavKey) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 overflow-visible px-1 py-2 transition-all duration-200 border-t-2 touch-manipulation relative ${
      active === key ? activeClass + " bg-emerald-100 dark:bg-emerald-900" : inactiveMobile
    }`;

  if (calcOnly) {
    return (
      <>
        <MobileAppBar
          logoHref="/seller/calculadora"
          end={<AppBarEndMobileAuth context="seller" onLogout={sairCalculadoraNav} logoutLabel="Sair" />}
        />
        <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm">
          <div className="max-w-4xl mx-auto flex w-full min-w-0 items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-8">
              <DropCoreLogo variant="horizontal" href="/seller/calculadora" className="shrink-0" />
              <div className="flex items-center gap-0.5">
                <Link href="/seller/calculadora" className={linkClass("calculadora")}>
                  <IconCalculator active={active === "calculadora"} />
                  Calculadora
                </Link>
              </div>
            </div>
            <AppBarEndDesktopAuth context="seller" onLogout={sairCalculadoraNav} />
          </div>
        </nav>
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-chrome-up)] pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-lg mx-auto grid grid-cols-2 items-stretch min-h-[52px]">
            <Link
              href="/seller/calculadora"
              className={`${mobileLinkClass("calculadora")} border-t-0 border-b-0 py-2 touch-manipulation min-h-[52px]`}
            >
              <IconCalculator active={active === "calculadora"} />
              <span className="text-[10px] font-medium leading-tight text-center">Calculadora</span>
            </Link>
            <button
              type="button"
              onClick={() => void sairCalculadoraNav()}
              className="flex flex-col items-center justify-center gap-0.5 border-l border-[var(--card-border)] py-2 px-1 min-h-[52px] touch-manipulation text-[var(--muted)] hover:text-[var(--foreground)] active:bg-[var(--surface-hover)] transition-colors"
              aria-label="Sair da calculadora"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
              <span className="text-[10px] font-medium leading-tight">Sair</span>
            </button>
          </div>
        </nav>
      </>
    );
  }

  return (
    <>
      <MobileAppBar
        logoHref="/seller/dashboard"
        end={<AppBarEndMobileAuth context="seller" onLogout={sair} />}
      />
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm">
        <div className="max-w-4xl mx-auto flex w-full min-w-0 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <DropCoreLogo variant="horizontal" href="/seller/dashboard" className="shrink-0" />
            <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link href="/seller/dashboard" className={linkClass("dashboard")}>
                <IconHome active={active === "dashboard"} />
                Dashboard
              </Link>
              <Link href="/seller/produtos" className={linkClass("produtos")}>
                <IconPackage active={active === "produtos"} />
                Produtos
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
          </div>
          <AppBarEndDesktopAuth context="seller" onLogout={sair} />
        </div>
      </nav>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-chrome-up)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-4 items-stretch min-h-[50px]">
          <Link href="/seller/dashboard" className={mobileLinkClass("dashboard")}>
            <IconHome active={active === "dashboard"} />
            <span className="max-w-[4.5rem] text-center text-[9px] sm:text-[10px] font-medium leading-tight tracking-tight">Painel</span>
          </Link>
          <Link href="/seller/produtos" className={mobileLinkClass("produtos")}>
            <IconPackage active={active === "produtos"} />
            <span className="max-w-[4.5rem] text-center text-[9px] sm:text-[10px] font-medium leading-tight tracking-tight">Produtos</span>
          </Link>
          <Link href="/seller/calculadora" className={mobileLinkClass("calculadora")}>
            <IconCalculator active={active === "calculadora"} />
            <span className="max-w-[4.5rem] text-center text-[9px] sm:text-[10px] font-medium leading-tight tracking-tight">Calc.</span>
          </Link>
          <Link href="/seller/integracoes-erp" className={mobileLinkClass("integracoes")}>
            <IconPlug active={active === "integracoes"} />
            <span className="max-w-[4.5rem] text-center text-[9px] sm:text-[10px] font-medium leading-tight tracking-tight">Integr.</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
