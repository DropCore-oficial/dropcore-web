"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/**
 * Redireciona sellers com dados comerciais incompletos para /seller/cadastro.
 * A escolha de plano fica no dashboard (onboarding), não aqui.
 */
export function SellerCadastroRedirect({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (
      pathname.startsWith("/seller/login") ||
      pathname.startsWith("/seller/register") ||
      pathname.startsWith("/seller/reset-password") ||
      pathname.startsWith("/seller/calculadora") ||
      pathname.startsWith("/seller/cadastro")
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token || cancelled) return;
      const res = await fetch("/api/seller/cadastro", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { cadastro_dados_pendente?: boolean; cadastro_pendente?: boolean };
      if (cancelled) return;
      const dadosPendente = j.cadastro_dados_pendente ?? j.cadastro_pendente;
      if (dadosPendente) {
        router.replace("/seller/cadastro");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}
