"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
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
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const [ok, setOk] = useState(isPublic);
  const verifiedRef = useRef(isPublic);

  useEffect(() => {
    if (isPublic) {
      verifiedRef.current = true;
      setOk(true);
      return;
    }
    if (verifiedRef.current) {
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
      const orgRes = await fetch("/api/org/me", { headers, cache: "no-store" });
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
      if (org?.fornecedor_id) {
        verifiedRef.current = true;
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
  }, [isPublic, pathname, router]);

  if (!ok) {
    return (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--background)]"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-emerald-500 dark:border-neutral-700 dark:border-t-emerald-400" />
      </div>
    );
  }

  return <>{children}</>;
}
