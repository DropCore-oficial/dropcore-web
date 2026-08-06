"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppBarEndDesktopAuth, AppBarEndMobileAuth } from "@/components/AppBarEndAuth";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { MobileAppBar } from "@/components/MobileAppBar";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { buildSellerSupportWhatsAppHref, getSellerSupportWhatsAppPrefill } from "@/lib/sellerSupportWhatsAppPrefill";

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
function IconStorefront({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7 4.5 3h15L21 7" />
      <path d="M3 7v3a2.5 2.5 0 0 0 5 0V7" />
      <path d="M8 10a2.5 2.5 0 0 0 5 0V7" />
      <path d="M13 10a2.5 2.5 0 0 0 5 0V7" />
      <path d="M18 10a2.5 2.5 0 0 0 3-2.4V7" />
      <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" />
      <path d="M9 21v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5" />
    </svg>
  );
}
function IconTruck({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}
function IconHelp({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9a2.8 2.8 0 1 1 3.8 2.6c-.7.3-1 .9-1 1.6v.3" />
      <path d="M12 17h.01" />
    </svg>
  );
}
function IconGear({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.3-.9-2 3.4L6.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7.7 7.7 0 0 0 1.7 1L11 21h4l.4-2.6a7.7 7.7 0 0 0 1.7-1l2.3.9 2-3.4Z" />
    </svg>
  );
}
function IconSuporte() {
  return (
    <svg className="w-5 h-5 shrink-0 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

type NavKey = "dashboard" | "pedidos" | "fornecedores" | "produtos" | "calculadora" | "plano" | "cadastro" | "integracoes";

/** Rotas agrupadas no menu “Mais” (só mobile agora — desktop mostra tudo direto na rail). */
const NAV_MAIS_MENU_KEYS = ["integracoes", "plano", "cadastro"] as const satisfies readonly NavKey[];
/** No mobile a barra de baixo só mostra 3 categorias — Calculadora e Fornecedores saem de
 * lá e entram no "Mais" (só no mobile; no desktop todos os itens são ícones próprios na rail). */
const NAV_MAIS_MENU_KEYS_MOBILE = [...NAV_MAIS_MENU_KEYS, "calculadora", "fornecedores"] as const satisfies readonly NavKey[];

const railActive = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400";
const railInactive = "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]";

/** Ícone da rail lateral (desktop): mostra o nome num tooltip ao passar o mouse. */
function SellerNavRailItem({
  href,
  label,
  isActive,
  children,
}: {
  href: string;
  label: string;
  isActive: boolean;
  children: ReactNode;
}) {
  const className = `group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
    isActive ? railActive : railInactive
  }`;
  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[var(--foreground)] opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </span>
    </Link>
  );
}

/** Botão "Ajuda" da rail lateral (desktop): dropdown com os canais de suporte — pensado pra crescer com mais itens. */
function SellerNavHelpMenu({ supportHref }: { supportHref: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Ajuda"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          open ? railActive : railInactive
        }`}
      >
        <IconHelp active={open} />
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[var(--foreground)] opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
          Ajuda
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Ajuda"
          className="absolute bottom-0 left-full z-50 ml-2 w-56 rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg ring-1 ring-[var(--foreground)]/[0.06]"
        >
          <a
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="mx-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
            onClick={() => setOpen(false)}
          >
            <IconSuporte />
            Suporte no WhatsApp
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function SellerNav({
  active,
  calcOnly = false,
  wide = false,
}: {
  active: NavKey;
  /** Só assinatura calculadora: esconde Dashboard e ERP */
  calcOnly?: boolean;
  /** Página já migrada pro padrão largo (dropcore-shell-6xl) — usado pra escalar a largura da barra inferior no mobile junto com o conteúdo. Não afeta mais o desktop (virou rail lateral de largura fixa). */
  wide?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const supportHref = buildSellerSupportWhatsAppHref(getSellerSupportWhatsAppPrefill(pathname));
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

  // Desktop virou rail lateral fixo — reserva o espaço à esquerda do conteúdo via CSS global
  // (html[data-seller-sidebar], ver globals.css). Não se aplica ao modo calcOnly (topo+baixo).
  useEffect(() => {
    if (calcOnly) return;
    document.documentElement.setAttribute("data-seller-sidebar", "1");
    return () => {
      document.documentElement.removeAttribute("data-seller-sidebar");
    };
  }, [calcOnly]);

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

  const mobileMaisActive = (NAV_MAIS_MENU_KEYS_MOBILE as readonly string[]).includes(active);
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
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={supportHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Suporte no WhatsApp"
                title="Suporte no WhatsApp"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              >
                <IconSuporte />
              </a>
              <AppBarEndDesktopAuth context="seller" onLogout={sairCalculadoraNav} />
            </div>
          </div>
        </nav>
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-chrome-up)] pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-lg mx-auto grid grid-cols-3 items-stretch min-h-[52px]">
            <Link
              href="/seller/calculadora"
              className={`${mobileLinkClass("calculadora")} border-t-0 border-b-0 py-2 touch-manipulation min-h-[52px]`}
            >
              <IconCalculator active={active === "calculadora"} />
              <span className="text-[10px] font-medium leading-tight text-center">Calculadora</span>
            </Link>
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-0.5 border-l border-[var(--card-border)] py-2 px-1 min-h-[52px] touch-manipulation text-[var(--muted)] hover:text-[var(--foreground)] active:bg-[var(--surface-hover)] transition-colors"
              aria-label="Suporte no WhatsApp"
            >
              <IconSuporte />
              <span className="text-[10px] font-medium leading-tight">Ajuda</span>
            </a>
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
      <header className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm">
        <div className="flex w-full min-w-0 items-center justify-between gap-3 px-4 sm:px-6">
          <DropCoreLogo variant="horizontal" href="/seller/dashboard" className="shrink-0" />
          <AppBarEndDesktopAuth context="seller" onLogout={sair} iconVariant="plain" />
        </div>
      </header>

      <nav
        aria-label="Navegação do seller"
        className="hidden md:flex fixed left-0 top-14 bottom-0 z-40 w-16 flex-col items-center gap-1 border-r border-[var(--card-border)] bg-[var(--background)] py-3 text-[var(--foreground)]"
      >
        <SellerNavRailItem href="/seller/dashboard" label="Dashboard" isActive={active === "dashboard"}>
          <IconHome active={active === "dashboard"} />
        </SellerNavRailItem>
        <SellerNavRailItem href="/seller/pedidos" label="Pedidos" isActive={active === "pedidos"}>
          <IconTruck active={active === "pedidos"} />
        </SellerNavRailItem>
        <SellerNavRailItem href="/seller/produtos" label="Produtos" isActive={active === "produtos"}>
          <IconPackage active={active === "produtos"} />
        </SellerNavRailItem>
        <SellerNavRailItem href="/seller/catalogo" label="Fornecedores" isActive={active === "fornecedores"}>
          <IconStorefront active={active === "fornecedores"} />
        </SellerNavRailItem>
        <SellerNavRailItem href="/seller/calculadora" label="Calculadora" isActive={active === "calculadora"}>
          <IconCalculator active={active === "calculadora"} />
        </SellerNavRailItem>
        <div className="my-1 h-px w-6 shrink-0 bg-[var(--card-border)]" aria-hidden />
        <SellerNavRailItem href="/seller/integracoes-erp" label="ERP" isActive={active === "integracoes"}>
          <IconPlug active={active === "integracoes"} />
        </SellerNavRailItem>
        <SellerNavRailItem href="/seller/plano" label="Plano" isActive={active === "plano"}>
          <IconPlano active={active === "plano"} />
        </SellerNavRailItem>

        <div className="mt-auto flex flex-col items-center gap-1 pb-1">
          <div className="my-1 h-px w-6 shrink-0 bg-[var(--card-border)]" aria-hidden />
          <SellerNavHelpMenu supportHref={supportHref} />
          <SellerNavRailItem href="/seller/cadastro" label="Configurações" isActive={active === "cadastro"}>
            <IconGear active={active === "cadastro"} />
          </SellerNavRailItem>
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
              href="/seller/catalogo"
              role="menuitem"
              className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                active === "fornecedores"
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                  : "text-[var(--foreground)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
              }`}
              onClick={() => setMobileMaisOpen(false)}
            >
              <IconStorefront active={active === "fornecedores"} />
              Fornecedores
            </Link>
            <Link
              href="/seller/calculadora"
              role="menuitem"
              className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                active === "calculadora"
                  ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                  : "text-[var(--foreground)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
              }`}
              onClick={() => setMobileMaisOpen(false)}
            >
              <IconCalculator active={active === "calculadora"} />
              Calculadora
            </Link>
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
        <div className={`mx-auto grid w-full ${wide ? "max-w-6xl" : "max-w-4xl"} grid-cols-4 items-stretch min-h-[52px]`}>
          <Link href="/seller/dashboard" className={mobileLinkClass("dashboard")}>
            <IconHome active={active === "dashboard"} />
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Painel</span>
          </Link>
          <Link href="/seller/pedidos" className={mobileLinkClass("pedidos")}>
            <IconTruck active={active === "pedidos"} />
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Pedidos</span>
          </Link>
          <Link href="/seller/produtos" className={mobileLinkClass("produtos")}>
            <IconPackage active={active === "produtos"} />
            <span className="truncate text-[10px] font-medium leading-none sm:text-[11px]">Produtos</span>
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
