"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const PUBLIC_PREFIXES = ["/seller/login", "/seller/register", "/seller/reset-password", "/seller/calculadora"];

/**
 * Garante que só contas com linha em `sellers` usem o painel /seller/*.
 * Fornecedor ou equipe admin é redirecionado para o portal correto.
 */
export function SellerPortalGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ok, setOk] = useState(PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)));

  useEffect(() => {
    if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
      setOk(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) router.replace("/seller/login");
        return;
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [orgRes, fornRes, sellRes] = await Promise.all([
        fetch("/api/org/me", { headers, cache: "no-store" }),
        fetch("/api/fornecedor/me", { headers, cache: "no-store" }),
        fetch("/api/seller/me", { headers, cache: "no-store" }),
      ]);
      if (cancelled) return;

      if (fornRes.ok) {
        router.replace("/fornecedor/dashboard");
        return;
      }

      const org = orgRes.ok
        ? ((await orgRes.json().catch(() => ({}))) as {
            fornecedor_id?: string | null;
            seller_id?: string | null;
            role_base?: string | null;
          })
        : null;
      if (org?.fornecedor_id) {
        router.replace("/fornecedor/dashboard");
        return;
      }

      if (sellRes.ok) {
        if (!cancelled) setOk(true);
        return;
      }

      const role = String(org?.role_base ?? "");
      if (role === "owner" || role === "admin") {
        router.replace("/dashboard");
        return;
      }
      router.replace("/seller/login");
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ok) {
    return (
      <div className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
        Verificando acesso…
      </div>
    );
  }

  return <>{children}</>;
}
