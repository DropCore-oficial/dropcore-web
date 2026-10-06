"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/**
 * Callback do OAuth do Mercado Livre (app próprio do avulso) — é o `redirect_uri` cadastrado
 * no DevCenter. Troca o `code` por token (POST /api/gestores-ia-avulso/mercadolivre/oauth) e
 * volta pro portal.
 */
export default function ConectarMlAvulsoPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const exchangedCode = useRef<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code || exchangedCode.current === code) {
      if (!code) router.replace("/seller/gestores-ia-avulso");
      return;
    }
    exchangedCode.current = code;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          router.replace("/gestores-ia/login");
          return;
        }
        const res = await fetch("/api/gestores-ia-avulso/mercadolivre/oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ code }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error ?? "Erro ao conectar o Mercado Livre.");
        router.replace("/seller/gestores-ia-avulso?ml=conectado");
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : "Erro inesperado.");
      }
    })();
  }, [router]);

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg flex min-h-screen items-center justify-center p-4">
      <div className="max-w-sm text-center text-sm text-[var(--muted)]">
        {erro ? (
          <>
            <p className="text-[var(--foreground)] font-medium">Não foi possível conectar.</p>
            <p className="mt-1">{erro}</p>
          </>
        ) : (
          "Conectando sua conta do Mercado Livre…"
        )}
      </div>
    </div>
  );
}
