"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DropCoreLogo } from "@/components/DropCoreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationToasts } from "@/components/NotificationToasts";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) router.replace("/login");
        return;
      }

      const res = await fetch("/api/org/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();

      if (cancelled) return;
      if (!res.ok || !json?.org_id) {
        router.replace("/login");
        return;
      }

      const role = json.role_base;
      if (role !== "owner" && role !== "admin") {
        router.replace("/dashboard");
        return;
      }

      setChecking(false);
    }

    check();
    return () => { cancelled = true; };
  }, [router, pathname]);

  if (checking) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        Verificando permissão…
      </div>
    );
  }

  const hasOwnHeader =
    pathname.startsWith("/admin/empresas") ||
    pathname.startsWith("/admin/catalogo") ||
    pathname.startsWith("/admin/sellers") ||
    pathname.startsWith("/admin/alteracoes-produtos") ||
    pathname.startsWith("/admin/calculadora-convites");

  return (
    <>
      {!hasOwnHeader && (
        <header className="border-b border-[var(--border-subtle)] bg-[var(--card)]/80 backdrop-blur-sm pt-[env(safe-area-inset-top,0px)]">
          <div className="mx-auto flex max-w-5xl min-w-0 items-center justify-between py-3 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]">
            <DropCoreLogo variant="horizontal" href="/dashboard" className="shrink-0 overflow-visible py-0.5" />
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                title="Início do painel"
                aria-label="Início do painel"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <path d="M9 22V12h6v10" />
                </svg>
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}
      {children}
      <NotificationToasts />
    </>
  );
}
