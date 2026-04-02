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
        <header className="border-b border-[var(--border-subtle)] bg-[var(--card)]/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <DropCoreLogo variant="horizontal" href="/dashboard" className="h-7" />
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Início da dash
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
