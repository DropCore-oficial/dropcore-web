"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppBarEndDesktopAuth, AppBarEndMobileAuth } from "@/components/AppBarEndAuth";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { MobileAppBar } from "@/components/MobileAppBar";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { buildSellerSupportWhatsAppHref, getSellerSupportWhatsAppPrefill } from "@/lib/sellerSupportWhatsAppPrefill";
import { useGestoresIaPermitido } from "@/lib/ai/useGestoresIaPermitido";

const activeClass = "text-emerald-600 dark:text-emerald-400 border-emerald-500";
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
function IconSparkles({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 shrink-0 ${active ? "text-emerald-500" : "text-current"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
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

function IconSair() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

function IconChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${className}`}
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
  );
}

/** Painel com seta — recolhe/expande a rail (só o avulso tem esse botão hoje). */
function IconPanelToggle({ expanded }: { expanded: boolean }) {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      {expanded ? <path d="m14 9-3 3 3 3" /> : <path d="m12 9 3 3-3 3" />}
    </svg>
  );
}

type NavKey = "dashboard" | "pedidos" | "fornecedores" | "produtos" | "calculadora" | "gestores_ia" | "plano" | "cadastro" | "integracoes";

/** Rotas agrupadas no menu “Mais” (só mobile agora — desktop mostra tudo direto na rail). */
const NAV_MAIS_MENU_KEYS = ["integracoes", "plano", "cadastro"] as const satisfies readonly NavKey[];
/** No mobile a barra de baixo só mostra 3 categorias — Calculadora, Gestores de IA e
 * Fornecedores saem de lá e entram no "Mais" (só no mobile; no desktop todos os itens são
 * ícones próprios na rail). */
const NAV_MAIS_MENU_KEYS_MOBILE = [...NAV_MAIS_MENU_KEYS, "calculadora", "gestores_ia", "fornecedores"] as const satisfies readonly NavKey[];

const railActive = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400";
const railInactive =
  "text-[var(--muted)] transition-colors duration-200 hover:bg-gradient-to-r hover:from-emerald-500/10 hover:to-emerald-400/10 hover:text-[var(--foreground)]";

const railActiveGlow = "bg-gradient-to-br from-emerald-500 to-emerald-400 text-white shadow-sm shadow-emerald-600/20";

/** Ícone da rail lateral (desktop): mostra o nome num tooltip ao passar o mouse.
 * `glow`: item ativo vira ladrilho com gradiente emerald + halo desfocado atrás, em vez do
 * fundo chapado `railActive` padrão — usado hoje só no menu do pacote avulso.
 * `animateIcon`: o próprio desenho do ícone (não o fundo) respira (escala + opacidade, mesmo
 * keyframe `pulse-glow` já usado na landing) devagar —
 * reservado pro ícone que representa IA de verdade (Gestor de IA), não genérico pra todo `glow`.
 * `hoverEffect`: o ícone se mexe enquanto o mouse estiver em cima (independe de estar ativo,
 * combina com `animateIcon` — são propriedades CSS diferentes, uma não corta a outra) —
 * `"bounce"` pula (Calculadora), `"spin"` gira (Meus dados/engrenagem), `"wiggle"` balança
 * como encaixando (Integrações/plugue), `"sparkle"` cresce+gira um pouco (Gestor de IA) —
 * os dois últimos são `.animate-dc-*` custom em `globals.css`.
 * `expanded`: rail aberta (ver toggle no topo do nav do avulso) — vira linha cheia com o
 * rótulo ao lado do ícone, sem tooltip (o texto já fica visível o tempo todo). */
function SellerNavRailItem({
  href,
  label,
  isActive,
  glow = false,
  animateIcon = false,
  hoverEffect,
  expanded = false,
  children,
}: {
  href: string;
  label: string;
  isActive: boolean;
  glow?: boolean;
  animateIcon?: boolean;
  hoverEffect?: "bounce" | "spin" | "wiggle" | "sparkle";
  expanded?: boolean;
  children: ReactNode;
}) {
  const className = expanded
    ? `group relative flex w-full shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
        isActive ? (glow ? railActiveGlow : railActive) : railInactive
      }`
    : `group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
        isActive ? (glow ? railActiveGlow : railActive) : railInactive
      }`;
  return (
    <Link href={href} aria-label={label} className={className}>
      {isActive && glow ? (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-0 scale-125 rounded-xl bg-emerald-400/30 blur-md" />
          <span
            aria-hidden
            className="pointer-events-none absolute -left-1.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-emerald-500 to-emerald-400"
          />
        </>
      ) : null}
      {(() => {
        const withHover =
          hoverEffect === "bounce" ? (
            <span className="group-hover:animate-bounce motion-reduce:group-hover:animate-none">{children}</span>
          ) : hoverEffect === "spin" ? (
            <span className="group-hover:animate-spin motion-reduce:group-hover:animate-none">{children}</span>
          ) : hoverEffect === "wiggle" ? (
            <span className="animate-dc-wiggle">{children}</span>
          ) : hoverEffect === "sparkle" ? (
            <span className="animate-dc-sparkle">{children}</span>
          ) : (
            children
          );
        return isActive && animateIcon ? (
          <span className="motion-safe:animate-[pulse-glow_1.8s_ease-in-out_infinite]">{withHover}</span>
        ) : (
          withHover
        );
      })()}
      {expanded ? (
        <span className="truncate text-sm font-medium">{label}</span>
      ) : (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[var(--foreground)] opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
          {label}
        </span>
      )}
    </Link>
  );
}

/** Botão "Ajuda" da rail lateral (desktop): dropdown com os canais de suporte — pensado pra crescer com mais itens. */
function SellerNavHelpMenu({ supportHref, expanded = false }: { supportHref: string; expanded?: boolean }) {
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
    <div className={`relative ${expanded ? "w-full" : ""}`} ref={rootRef}>
      <button
        type="button"
        aria-label="Ajuda"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={
          expanded
            ? `group relative flex w-full shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                open ? railActive : railInactive
              }`
            : `group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                open ? railActive : railInactive
              }`
        }
      >
        <IconHelp active={open} />
        {expanded ? (
          <span className="truncate text-sm font-medium">Ajuda</span>
        ) : (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[var(--foreground)] opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
            Ajuda
          </span>
        )}
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

/** Subcontas do pacote avulso — aparecem dentro do item "Gestor de IA" da rail, não como
 * ícones próprios. "Visão geral" é o Portal (/seller/gestores-ia-avulso exato). */
const GESTORES_IA_SUBITENS = [
  { href: "/seller/gestores-ia-avulso", label: "Visão geral" },
  { href: "/seller/gestores-ia-avulso/andrey", label: "Anúncio" },
  { href: "/seller/gestores-ia-avulso/amanda", label: "SAC" },
  { href: "/seller/gestores-ia-avulso/ulisses", label: "ADS" },
  { href: "/seller/gestores-ia-avulso/tiago", label: "Gestor" },
] as const;

function gestorSubitemAtivo(pathname: string, href: string): boolean {
  if (href === "/seller/gestores-ia-avulso") return pathname === href;
  return pathname.startsWith(href);
}

/** Item "Gestor de IA" da rail do avulso: não navega mais sozinho — é um disclosure com as
 * subcontas (Andrey/Amanda/Ulisses/Tiago Silva + Visão geral) dentro dele.
 * Expandido (`expanded`): clique abre/fecha a lista indentada embaixo do próprio item.
 * Recolhido (só ícone): passar o mouse abre um menu flutuante com a lista — clique no ícone
 * nesse estado expande a rail inteira (`onExpandRail`) pra dar um caminho igual por teclado/toque. */
function SellerNavGestorIaItem({
  expanded,
  pathname,
  isActive,
  open,
  onToggle,
  onExpandRail,
}: {
  expanded: boolean;
  pathname: string;
  isActive: boolean;
  open: boolean;
  onToggle: () => void;
  onExpandRail: () => void;
}) {
  if (expanded) {
    return (
      <div className="w-full shrink-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
            isActive ? railActiveGlow : railInactive
          }`}
        >
          {isActive ? (
            <>
              <span aria-hidden className="pointer-events-none absolute inset-0 scale-125 rounded-xl bg-emerald-400/30 blur-md" />
              <span
                aria-hidden
                className="pointer-events-none absolute -left-1.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-emerald-500 to-emerald-400"
              />
            </>
          ) : null}
          <span className={isActive ? "motion-safe:animate-[pulse-glow_1.8s_ease-in-out_infinite]" : ""}>
            <span className="animate-dc-sparkle">
              <IconSparkles active={false} />
            </span>
          </span>
          <span className="flex-1 truncate text-left text-sm font-medium">Gestor de IA</span>
          <IconChevronDown className={open ? "rotate-180" : ""} />
        </button>
        {open ? (
          <div className="mt-1 flex flex-col gap-0.5 border-l border-[var(--card-border)] pl-4">
            {GESTORES_IA_SUBITENS.map((item) => {
              const ativo = gestorSubitemAtivo(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`truncate rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                    ativo
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onExpandRail}
        aria-haspopup="menu"
        aria-label="Gestor de IA"
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          isActive ? railActiveGlow : railInactive
        }`}
      >
        {isActive ? (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-0 scale-125 rounded-xl bg-emerald-400/30 blur-md" />
            <span
              aria-hidden
              className="pointer-events-none absolute -left-1.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-emerald-500 to-emerald-400"
            />
          </>
        ) : null}
        <span className={isActive ? "motion-safe:animate-[pulse-glow_1.8s_ease-in-out_infinite]" : ""}>
          <span className="animate-dc-sparkle">
            <IconSparkles active={false} />
          </span>
        </span>
      </button>
      <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 opacity-0 shadow-lg transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <div className="w-44 rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg ring-1 ring-[var(--foreground)]/[0.06]">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Gestor de IA</div>
          {GESTORES_IA_SUBITENS.map((item) => {
            const ativo = gestorSubitemAtivo(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mx-1 flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                  ativo ? railActive : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SellerNav({
  active,
  calcOnly = false,
  temGestoresIa = false,
  wide = false,
}: {
  /** Sem valor = nenhuma aba destacada (ex.: páginas institucionais fora do menu principal). */
  active?: NavKey;
  /** Só assinatura calculadora: esconde Dashboard e ERP */
  calcOnly?: boolean;
  /** No modo calcOnly, assinante também tem o pacote "Gestores de IA" avulso — mostra a aba extra. */
  temGestoresIa?: boolean;
  /** Página já migrada pro padrão largo (dropcore-shell-6xl) — usado pra escalar a largura da barra inferior no mobile junto com o conteúdo. Não afeta mais o desktop (virou rail lateral de largura fixa). */
  wide?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const supportHref = buildSellerSupportWhatsAppHref(getSellerSupportWhatsAppPrefill(pathname));
  const [mobileMaisOpen, setMobileMaisOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [gestoresAbertos, setGestoresAbertos] = useState(active === "gestores_ia");
  const gestoresIaPermitido = useGestoresIaPermitido();

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
  // (html[data-seller-sidebar], ver globals.css). Vale pros dois modos (hub e calcOnly).
  useEffect(() => {
    document.documentElement.setAttribute("data-seller-sidebar", "1");
    return () => {
      document.documentElement.removeAttribute("data-seller-sidebar");
    };
  }, []);

  // Rail do avulso pode expandir (mostrar rótulo) — segunda reserva de espaço, só enquanto
  // aberta (ver `html[data-seller-sidebar-expanded]` em globals.css).
  useEffect(() => {
    if (!calcOnly) return;
    if (railExpanded) {
      document.documentElement.setAttribute("data-seller-sidebar-expanded", "1");
    } else {
      document.documentElement.removeAttribute("data-seller-sidebar-expanded");
    }
    return () => {
      document.documentElement.removeAttribute("data-seller-sidebar-expanded");
    };
  }, [calcOnly, railExpanded]);

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/seller/login");
  }

  async function sairCalculadoraNav() {
    await supabaseBrowser.auth.signOut();
    router.replace("/calculadora/login");
  }

  const mobileLinkClass = (key: NavKey) =>
    `flex min-w-0 flex-1 flex-row items-center justify-center gap-1 overflow-hidden px-0.5 py-2 transition-all duration-200 border-t-2 touch-manipulation relative ${
      active === key ? activeClass + " bg-emerald-100 dark:bg-emerald-900" : inactiveMobile
    }`;

  const mobileMaisActive = active != null && (NAV_MAIS_MENU_KEYS_MOBILE as readonly string[]).includes(active);
  const mobileMaisBtnClass =
    `flex min-w-0 flex-1 flex-row items-center justify-center gap-1 overflow-hidden px-0.5 py-2 transition-all duration-200 border-t-2 touch-manipulation relative ` +
    (mobileMaisActive
      ? activeClass + " bg-emerald-100 dark:bg-emerald-900"
      : inactiveMobile + (mobileMaisOpen ? " bg-[var(--surface-hover)]" : ""));

  if (calcOnly) {
    const homeHref = temGestoresIa ? "/seller/gestores-ia-avulso" : "/seller/calculadora";
    const calcMaisActive = active === "integracoes" || active === "cadastro";
    const calcMaisBtnClass =
      `flex min-w-0 flex-1 flex-row items-center justify-center gap-1 overflow-hidden px-0.5 py-2 transition-all duration-200 border-t-2 touch-manipulation relative ` +
      (calcMaisActive
        ? activeClass + " bg-emerald-100 dark:bg-emerald-900"
        : inactiveMobile + (mobileMaisOpen ? " bg-[var(--surface-hover)]" : ""));

    return (
      <>
        <MobileAppBar
          logoHref={homeHref}
          end={<AppBarEndMobileAuth context="seller" onLogout={sairCalculadoraNav} logoutLabel="Sair" />}
        />
        <header className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm">
          <div className="flex w-full min-w-0 items-center justify-between gap-3 px-4 sm:px-6">
            <DropCoreLogo variant="horizontal" href={homeHref} className="shrink-0" />
            <AppBarEndDesktopAuth context="seller" onLogout={sairCalculadoraNav} iconVariant="plain" />
          </div>
        </header>

        <nav
          aria-label="Navegação do assinante"
          className={`hidden md:flex fixed left-0 top-14 bottom-0 z-40 flex-col gap-3 overflow-x-hidden border-r border-[var(--card-border)] bg-[var(--background)] py-3 text-[var(--foreground)] transition-[width] duration-200 ${
            railExpanded ? "w-60 items-stretch px-3" : "w-16 items-center"
          }`}
        >
          <div className={`mb-1 flex shrink-0 items-center ${railExpanded ? "justify-between px-1" : "justify-center"}`}>
            {railExpanded ? (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Menu</span>
            ) : null}
            <button
              type="button"
              onClick={() => setRailExpanded((v) => !v)}
              aria-label={railExpanded ? "Recolher menu" : "Expandir menu"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            >
              <IconPanelToggle expanded={railExpanded} />
            </button>
          </div>

          {temGestoresIa && (
            <SellerNavGestorIaItem
              expanded={railExpanded}
              pathname={pathname}
              isActive={active === "gestores_ia"}
              open={gestoresAbertos}
              onToggle={() => setGestoresAbertos((v) => !v)}
              onExpandRail={() => {
                setRailExpanded(true);
                setGestoresAbertos(true);
              }}
            />
          )}
          <SellerNavRailItem
            href="/seller/calculadora"
            label="Calculadora"
            isActive={active === "calculadora"}
            glow
            hoverEffect="bounce"
            expanded={railExpanded}
          >
            <IconCalculator active={false} />
          </SellerNavRailItem>
          {temGestoresIa && (
            <>
              <SellerNavRailItem
                href="/seller/gestores-ia-avulso/integracoes"
                label="Integrações"
                isActive={active === "integracoes"}
                glow
                hoverEffect="wiggle"
                expanded={railExpanded}
              >
                <IconPlug active={false} />
              </SellerNavRailItem>
            </>
          )}
          <SellerNavRailItem
            href="/seller/meus-dados"
            label="Meus dados"
            isActive={active === "cadastro"}
            glow
            hoverEffect="spin"
            expanded={railExpanded}
          >
            <IconGear active={false} />
          </SellerNavRailItem>

          <div className={`mt-auto flex flex-col gap-3 pb-1 ${railExpanded ? "items-stretch" : "items-center"}`}>
            <div className={`my-1 h-px shrink-0 bg-[var(--card-border)] ${railExpanded ? "w-full" : "w-6"}`} aria-hidden />
            <button
              type="button"
              onClick={() => void sairCalculadoraNav()}
              aria-label="Sair"
              className={
                railExpanded
                  ? `flex w-full shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${railInactive}`
                  : `group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${railInactive}`
              }
            >
              <IconSair />
              {railExpanded ? (
                <span className="truncate text-sm font-medium">Sair</span>
              ) : (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-[var(--foreground)] opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
                  Sair
                </span>
              )}
            </button>
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
              aria-label="Mais opções"
            >
              {temGestoresIa && (
                <Link
                  href="/seller/gestores-ia-avulso/integracoes"
                  role="menuitem"
                  className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                    active === "integracoes"
                      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                      : "text-[var(--foreground)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
                  }`}
                  onClick={() => setMobileMaisOpen(false)}
                >
                  <IconPlug active={active === "integracoes"} />
                  Integrações
                </Link>
              )}
              <Link
                href="/seller/meus-dados"
                role="menuitem"
                className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                  active === "cadastro"
                    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                    : "text-[var(--foreground)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
                }`}
                onClick={() => setMobileMaisOpen(false)}
              >
                <IconGear active={active === "cadastro"} />
                Meus dados
              </Link>
            </div>
          </>
        ) : null}

        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] shadow-[var(--shadow-chrome-up)] pb-[env(safe-area-inset-bottom)]">
          <div className={`max-w-lg mx-auto grid items-stretch min-h-[52px] ${temGestoresIa ? "grid-cols-3" : "grid-cols-2"}`}>
            {temGestoresIa && (
              <Link
                href="/seller/gestores-ia-avulso"
                className={`${mobileLinkClass("gestores_ia")} border-t-0 border-b-0 py-2 touch-manipulation min-h-[52px]`}
              >
                <IconSparkles active={active === "gestores_ia"} />
                <span className="text-[10px] font-medium leading-tight text-center">Gestor de IA</span>
              </Link>
            )}
            <Link
              href="/seller/calculadora"
              className={`${mobileLinkClass("calculadora")} border-t-0 border-b-0 py-2 touch-manipulation min-h-[52px]`}
            >
              <IconCalculator active={active === "calculadora"} />
              <span className="text-[10px] font-medium leading-tight text-center">Calculadora</span>
            </Link>
            {temGestoresIa ? (
              <button
                type="button"
                className={calcMaisBtnClass}
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
                <span className="text-[10px] font-medium leading-tight text-center">Mais</span>
              </button>
            ) : (
              <Link
                href="/seller/meus-dados"
                className={`${mobileLinkClass("cadastro")} border-t-0 border-b-0 py-2 touch-manipulation min-h-[52px]`}
              >
                <IconGear active={active === "cadastro"} />
                <span className="text-[10px] font-medium leading-tight text-center">Meus dados</span>
              </Link>
            )}
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
        {gestoresIaPermitido ? (
          <SellerNavRailItem href="/seller/gestores-ia" label="Gestores de IA" isActive={active === "gestores_ia"}>
            <IconSparkles active={active === "gestores_ia"} />
          </SellerNavRailItem>
        ) : null}
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
            {gestoresIaPermitido ? (
              <Link
                href="/seller/gestores-ia"
                role="menuitem"
                className={`mx-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                  active === "gestores_ia"
                    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                    : "text-[var(--foreground)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
                }`}
                onClick={() => setMobileMaisOpen(false)}
              >
                <IconSparkles active={active === "gestores_ia"} />
                Gestores de IA
              </Link>
            ) : null}
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
