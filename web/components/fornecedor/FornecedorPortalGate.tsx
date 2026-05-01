"use client";

import { type ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const PUBLIC_PREFIXES = ["/fornecedor/login", "/fornecedor/register"];

/**
 * Garante que só contas de armazém fiquem em rotas /fornecedor/*.
 * Seller ou admin cai fora do painel do fornecedor.
 */
export function FornecedorPortalGate({ children }: { children: ReactNode }) {
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
        if (!cancelled) router.replace("/fornecedor/login");
        return;
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [orgRes, fornRes] = await Promise.all([
        fetch("/api/org/me", { headers, cache: "no-store" }),
        fetch("/api/fornecedor/me", { headers, cache: "no-store" }),
      ]);
      if (cancelled) return;
      const org = orgRes.ok
        ? ((await orgRes.json().catch(() => ({}))) as {
            fornecedor_id?: string | null;
            seller_id?: string | null;
            role_base?: string | null;
          })
        : null;

      if (org?.seller_id && !org?.fornecedor_id) {
        router.replace("/seller/dashboard");
        return;
      }
      const role = String(org?.role_base ?? "");
      if (fornRes.ok || org?.fornecedor_id) {
        if (!cancelled) setOk(true);
        return;
      }
      if (role === "owner" || role === "admin") {
        router.replace("/dashboard");
        return;
      }
      if (org?.seller_id) {
        router.replace("/seller/dashboard");
        return;
      }
      router.replace("/fornecedor/login");
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
