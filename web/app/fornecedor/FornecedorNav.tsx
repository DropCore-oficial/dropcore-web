"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
function IconPlug({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  );
}
function IconCadastro({ active }: { active: boolean }) {
  return (
    <svg className={`h-5 w-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

type NavKey = "dashboard" | "produtos" | "pedidos" | "cadastro" | "integracoes";

/** Só mobile agora — desktop mostra as 5 categorias direto na barra, sem "Mais". */
const NAV_MAIS_MENU_KEYS_MOBILE = ["integracoes", "cadastro"] as const satisfies readonly NavKey[];

export function FornecedorNav({ active, wide = false }: { active: NavKey; wide?: boolean }) {
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
    router.replace("/fornecedor/login");
  }

  const linkClass = (key: NavKey) =>
    `flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border-b-2 -mb-px relative ${
      active === key ? activeClass + " hover:bg-emerald-100 dark:hover:bg-emerald-900" : inactiveDesktop
    }`;

  const mobileLinkClass = (key: NavKey) =>
    `flex min-w-0 flex-1 flex-row items-center justify-center gap-1 overflow-hidden px-0.5 py-2 transition-all duration-200 border-t-2 touch-manipulation relative ${
      active === key ? activeClass + " bg-emerald-100 dark:bg-emerald-900" : inactiveMobile
    }`;

  const mobileMaisActive = (NAV_MAIS_MENU_KEYS_MOBILE as readonly string[]).includes(active);
  const mobileMaisBtnClass =
    `flex min-w-0 flex-1 flex-row items-center justify-center gap-1 overflow-hidden px-0.5 py-2 transition-all duration-200 border-t-2 touch-manipulation relative ` +
    (mobileMaisActive
      ? activeClass + " bg-emerald-100 dark:bg-emerald-900"
      : inactiveMobile + (mobileMaisOpen ? " bg-[var(--surface-hover)]" : ""));

  return (
    <>
      <MobileAppBar
        logoHref="/fornecedor/dashboard"
        end={<AppBarEndMobileAuth context="fornecedor" onLogout={sair} />}
      />
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm">
        <div className={`${wide ? "dropcore-shell-6xl" : "dropcore-shell-4xl"} flex w-full min-w-0 items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6`}>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4 md:gap-6">
            <DropCoreLogo variant="horizontal" href="/fornecedor/dashboard" className="shrink-0" />
            <div className="flex shrink-0 items-center gap-0.5">
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
              <Link href="/fornecedor/integracoes-erp" className={linkClass("integracoes")}>
                <IconPlug active={active === "integracoes"} />
                ERP
              </Link>
              <Link href="/fornecedor/cadastro" className={linkClass("cadastro")}>
                <IconCadastro active={active === "cadastro"} />
                Cadastro
              </Link>
            </div>
          </div>
          <AppBarEndDesktopAuth context="fornecedor" onLogout={sair} />
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
            aria-label="Mais opções do fornecedor"
          >
            <Link
              href="/fornecedor/integracoes-erp"
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
              href="/fornecedor/cadastro"
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
          <Link href="/fornecedor/dashboard" className={mobileLinkClass("dashboard")}>
            <IconHome active={active === "dashboard"} />
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Painel</span>
          </Link>
          <Link href="/fornecedor/produtos" className={mobileLinkClass("produtos")}>
            <IconPackage active={active === "produtos"} />
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Produtos</span>
          </Link>
          <Link href="/fornecedor/pedidos" className={mobileLinkClass("pedidos")}>
            <IconTruck active={active === "pedidos"} />
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Pedidos</span>
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
