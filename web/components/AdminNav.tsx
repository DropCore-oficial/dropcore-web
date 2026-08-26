"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppBarEndDesktopAuth, AppBarEndMobileAuth } from "@/components/AppBarEndAuth";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { MobileAppBar } from "@/components/MobileAppBar";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const MAIS_GRUPOS = [
  {
    label: "Financeiro",
    items: [
      { href: "/admin/devolucoes", label: "Devoluções" },
      { href: "/admin/disputas-fornecedor", label: "Disputas com fornecedor" },
      { href: "/admin/mensalidades", label: "Mensalidades" },
      { href: "/admin/depositos-pix", label: "Depósitos PIX" },
    ],
  },
  {
    label: "Cadastro",
    items: [
      { href: "/org/membros", label: "Membros" },
      { href: "/admin/catalogo", label: "Catálogo" },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/admin/alteracoes-produtos", label: "Alterações de produtos" },
      { href: "/admin/integracoes-erp", label: "Integrações ERP" },
      { href: "/admin/enviar-pedido", label: "Enviar pedido" },
      { href: "/admin/relatorio-entrada-saida", label: "Relatório entrada/saída" },
      { href: "/admin/auditoria", label: "Auditoria" },
    ],
  },
] as const;

const MAIS_PATHS = MAIS_GRUPOS.flatMap((g) => g.items.map((i) => i.href));

/**
 * Menu do admin/dono — mesma barra em todas as páginas /admin/* e /org/membros.
 * Largura padrão `dropcore-shell-6xl`, igual ao conteúdo de todas as páginas
 * admin (mesmo padrão da dashboard) — não trocar sem alinhar o container da página.
 */
export function AdminNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [maisOpen, setMaisOpen] = useState(false);
  const maisRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!maisOpen) return;
    function onDoc(e: MouseEvent) {
      if (maisRef.current?.contains(e.target as Node)) return;
      setMaisOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMaisOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [maisOpen]);

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/login");
  }

  const maisActive = MAIS_PATHS.some((p) => pathname?.startsWith(p));
  const navLinkClass = (activeCond: boolean) =>
    `flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border-b-2 -mb-px transition-colors ${
      activeCond
        ? "text-emerald-600 dark:text-emerald-400 border-emerald-600 hover:bg-emerald-600/10 dark:hover:bg-emerald-500/15"
        : "text-[var(--muted)] border-transparent hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
    }`;

  return (
    <>
      <MobileAppBar
        logoHref="/dashboard"
        end={<AppBarEndMobileAuth context="admin" onLogout={sair} />}
      />

      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-40 h-14 items-center border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/98 dark:bg-neutral-950/98 backdrop-blur-xl shadow-sm">
        <div className="dropcore-shell-6xl flex w-full min-w-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-1">
            <DropCoreLogo variant="horizontal" href="/dashboard" className="shrink-0 mr-6" />
            <Link href="/dashboard" className={navLinkClass(pathname === "/dashboard")}>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Dashboard
            </Link>
            <Link href="/admin/pedidos" className={navLinkClass(pathname?.startsWith("/admin/pedidos") ?? false)}>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
              </svg>
              Pedidos
            </Link>
            <Link href="/admin/repasse-fornecedor" className={navLinkClass(pathname?.startsWith("/admin/repasse-fornecedor") ?? false)}>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17 2 21 6 17 10" /><path d="M3 12v-2a4 4 0 0 1 4-4h14" />
                <path d="M7 22 3 18 7 14" /><path d="M21 12v2a4 4 0 0 1-4 4H3" />
              </svg>
              Repasse
            </Link>
            <Link href="/admin/a-pagar-fornecedores" className={navLinkClass(pathname?.startsWith("/admin/a-pagar-fornecedores") ?? false)}>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v10M9.5 9.5c0-1.1 1.1-2 2.5-2s2.5.7 2.5 1.8-1 1.7-2.5 1.9c-1.5.2-2.5.8-2.5 1.9S10.9 15 12.3 15s2.2-.6 2.2-1.6" />
              </svg>
              A pagar
            </Link>
            <Link href="/admin/empresas" className={navLinkClass(pathname?.startsWith("/admin/empresas") ?? false)}>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
              </svg>
              Empresas
            </Link>

            <div className="relative shrink-0" ref={maisRef}>
              <button
                type="button"
                onClick={() => setMaisOpen((v) => !v)}
                aria-expanded={maisOpen}
                aria-haspopup="menu"
                className={navLinkClass(maisActive) + " gap-1.5"}
              >
                Mais
                <svg className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${maisOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {maisOpen && (
                <div className="absolute left-0 top-full z-[100] mt-1 w-64 rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1.5 shadow-lg ring-1 ring-[var(--foreground)]/[0.06]" role="menu">
                  {MAIS_GRUPOS.map((grupo) => (
                    <div key={grupo.label} className="py-1 first:pt-0 last:pb-0">
                      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{grupo.label}</p>
                      {grupo.items.map((it) => (
                        <Link
                          key={it.href}
                          href={it.href}
                          role="menuitem"
                          onClick={() => setMaisOpen(false)}
                          className={`mx-1 flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            pathname?.startsWith(it.href)
                              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
                              : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                          }`}
                        >
                          {it.label}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <AppBarEndDesktopAuth context="admin" onLogout={sair} />
        </div>
      </nav>
    </>
  );
}
