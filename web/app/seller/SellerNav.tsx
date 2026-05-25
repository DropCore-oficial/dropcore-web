"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
function IconPlano({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5L12 2z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}
function IconCadastro({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

type NavKey = "dashboard" | "produtos" | "calculadora" | "plano" | "cadastro" | "integracoes";

/** Rotas agrupadas no menu “Mais” (desktop e mobile). */
const NAV_MAIS_MENU_KEYS = ["integracoes", "plano", "cadastro"] as const satisfies readonly NavKey[];

function SellerNavDesktopMais({ active }: { active: NavKey }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const maisActive = (NAV_MAIS_MENU_KEYS as readonly string[]).includes(active);

  useEffect(() => {
    setOpen(false);
  }, [active]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const btnClass =
    `flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-b-2 -mb-px relative ` +
    (maisActive ? activeClass + " hover:bg-emerald-100 dark:hover:bg-emerald-900" : inactiveDesktop);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        className={btnClass}
        aria-expanded={open}
        aria-haspopup="menu"
        id="seller-nav-mais-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        Mais
        <svg
          className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-[100] mt-1 w-[min(calc(100vw-2rem),16rem)] rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg ring-1 ring-[var(--foreground)]/[0.06]"
          role="menu"
          aria-labelledby="seller-nav-mais-trigger"
        >
          <Link
            href="/seller/integracoes-erp"
            role="menuitem"
            className={`mx-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active === "integracoes"
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
            }`}
            onClick={() => setOpen(false)}
          >
            <IconPlug active={active === "integracoes"} />
            ERP
          </Link>
          <Link
            href="/seller/plano"
            role="menuitem"
            className={`mx-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active === "plano"
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
            }`}
            onClick={() => setOpen(false)}
          >
            <IconPlano active={active === "plano"} />
            Plano
          </Link>
          <Link
            href="/seller/cadastro"
            role="menuitem"
            className={`mx-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active === "cadastro"
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
            }`}
            onClick={() => setOpen(false)}
          >
            <IconCadastro active={active === "cadastro"} />
            Cadastro
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function SellerNav({
  active,
  calcOnly = false,
}: {
  active: NavKey;
  /** Só assinatura calculadora: esconde Dashboard e ERP */
  calcOnly?: boolean;
}) {
  const router = useRouter();
  const [mobileMaisOpen, setMobileMaisOpen] = useState(false);

  useEffect(() => {
    setMobileMaisOpen(false);
  }, [active]);

  useEffect(() => {
    if (!mobileMaisOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMaisOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileMaisOpen]);

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/seller/login");
  }

  async function sairCalculadoraNav() {
    await supabaseBrowser.auth.signOut();
    router.replace("/calculadora/login");
  }

  const linkClass = (key: NavKey) =>
    `flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-b-2 -mb-px relative ${
      active === key ? activeClass + " hover:bg-emerald-100 dark:hover:bg-emerald-900" : inactiveDesktop
    }`;

  const mobileLinkClass = (key: NavKey) =>
    `flex min-w-0 flex-1 flex-row items-center justify-center gap-1 overflow-hidden px-0.5 py-2 transition-all duration-200 border-t-2 touch-manipulation relative ${
      active === key ? activeClass + " bg-emerald-100 dark:bg-emerald-900" : inactiveMobile
    }`;

  const mobileMaisActive = (NAV_MAIS_MENU_KEYS as readonly string[]).includes(active);
  const mobileMaisBtnClass =
    `flex min-w-0 flex-1 flex-row items-center justify-center gap-1 overflow-hidden px-0.5 py-2 transition-all duration-200 border-t-2 touch-manipulation relative ` +
    (mobileMaisActive
      ? activeClass + " bg-emerald-100 dark:bg-emerald-900"
      : inactiveMobile + (mobileMaisOpen ? " bg-[var(--surface-hover)]" : ""));

  if (calcOnly) {
    return (
      <>
        <MobileAppBar
          logoHref="/seller/calculadora"
          end={<AppBarEndMobileAuth context="seller" onLogout={sairCalculadoraNav} logoutLabel="Sair" />}
        />
        <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm">
          <div className="max-w-4xl mx-auto flex w-full min-w-0 items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-6 sm:gap-8">
              <DropCoreLogo variant="horizontal" href="/seller/calculadora" className="shrink-0" />
              <div className="flex shrink-0 items-center gap-0.5">
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
        <div className="dropcore-shell-4xl flex w-full min-w-0 items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4 md:gap-6">
            <DropCoreLogo variant="horizontal" href="/seller/dashboard" className="shrink-0" />
            <div className="flex shrink-0 items-center gap-0.5">
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
              <SellerNavDesktopMais active={active} />
            </div>
          </div>
          <AppBarEndDesktopAuth context="seller" onLogout={sair} />
        </div>
      </nav>

      {mobileMaisOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[85] md:hidden bg-[var(--foreground)]/20"
            aria-label="Fechar menu"
            onClick={() => setMobileMaisOpen(false)}
          />
          <div
            className="fixed left-3 right-3 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-[95] rounded-2xl border border-[var(--card-border)] bg-[var(--card)] py-2 shadow-xl ring-1 ring-[var(--foreground)]/[0.06] md:hidden"
            role="menu"
            aria-label="Mais opções do seller"
          >
            <Link
              href="/seller/integracoes-erp"
              role="menuitem"
              className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                active === "integracoes"
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                  : "text-[var(--foreground)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
              }`}
              onClick={() => setMobileMaisOpen(false)}
            >
              <IconPlug active={active === "integracoes"} />
              ERP
            </Link>
            <Link
              href="/seller/plano"
              role="menuitem"
              className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                active === "plano"
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                  : "text-[var(--foreground)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
              }`}
              onClick={() => setMobileMaisOpen(false)}
            >
              <IconPlano active={active === "plano"} />
              Plano
            </Link>
            <Link
              href="/seller/cadastro"
              role="menuitem"
              className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                active === "cadastro"
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                  : "text-[var(--foreground)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
              }`}
              onClick={() => setMobileMaisOpen(false)}
            >
              <IconCadastro active={active === "cadastro"} />
              Cadastro
            </Link>
          </div>
        </>
      ) : null}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-chrome-up)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-4 items-stretch min-h-[52px]">
          <Link href="/seller/dashboard" className={mobileLinkClass("dashboard")}>
            <IconHome active={active === "dashboard"} />
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Painel</span>
          </Link>
          <Link href="/seller/produtos" className={mobileLinkClass("produtos")}>
            <IconPackage active={active === "produtos"} />
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Produtos</span>
          </Link>
          <Link href="/seller/calculadora" className={mobileLinkClass("calculadora")}>
            <IconCalculator active={active === "calculadora"} />
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Calculadora</span>
          </Link>
          <button
            type="button"
            className={mobileMaisBtnClass}
            aria-expanded={mobileMaisOpen}
            aria-haspopup="menu"
            onClick={() => setMobileMaisOpen((o) => !o)}
          >
            <svg
              className={`h-5 w-5 shrink-0 transition-transform duration-200 ${mobileMaisOpen ? "rotate-180 text-emerald-500" : "text-current"}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}
