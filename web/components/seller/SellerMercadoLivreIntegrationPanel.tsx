"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { HelpBubble } from "@/components/HelpBubble";
import { Skeleton } from "@/components/ui/Skeleton";

type MercadoLivreStatus = {
  connected: boolean;
  ml_user_id: string | null;
  access_token_expires_at: string | null;
  updated_at: string | null;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

export function SellerMercadoLivreIntegrationPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<MercadoLivreStatus | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const exchangedCode = useRef<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      router.replace("/seller/login");
      return;
    }
    const res = await fetch("/api/seller/mercadolivre", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as MercadoLivreStatus & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Erro ao carregar integração Mercado Livre.");
      setLoading(false);
      return;
    }
    setStatus(json);
    setError(null);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    async function bootstrap() {
      if (code && exchangedCode.current !== code) {
        exchangedCode.current = code;
        const token = await getAccessToken();
        if (token) {
          try {
            const res = await fetch("/api/seller/mercadolivre/oauth", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(json.error ?? "Não foi possível concluir a conexão com o Mercado Livre.");
            }
          } catch {
            setError("Não foi possível concluir a conexão com o Mercado Livre.");
          }
        }
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        router.replace(url.pathname + url.search, { scroll: false });
      }
      await load();
    }

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = Boolean(status?.connected);

  return (
    <section className="relative rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
      {loading ? (
        <div
          className="absolute inset-0 z-10 space-y-4 rounded-2xl bg-[var(--card)] p-5 sm:p-6"
          role="status"
          aria-live="polite"
        >
          <Skeleton className="h-7 w-32 rounded-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : null}

      {error ? (
        <div className={cn("mb-4 rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <p className="font-medium text-[var(--foreground)]">Conta Mercado Livre</p>
          <HelpBubble
            ariaLabel="Como funciona a conexão com o Mercado Livre"
            open={helpOpen}
            onOpen={() => setHelpOpen(true)}
            onClose={() => setHelpOpen(false)}
          >
            <p>
              Conecta a conta do Mercado Livre pra alimentar os gestores de IA com dado real do seu
              anúncio. É só leitura — o DropCore nunca publica nem altera nada sozinho na sua conta.
            </p>
          </HelpBubble>
          {connected ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
              Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--muted)]/15 px-2 py-1 text-[11px] font-medium text-[var(--muted)]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
              Não conectado
            </span>
          )}
        </div>
      </div>

      {connected ? (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm">
          {status?.ml_user_id ? (
            <p className="text-[var(--foreground)]">
              Conta ML: <span className="font-mono text-xs">{status.ml_user_id}</span>
            </p>
          ) : null}
          {status?.access_token_expires_at ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Acesso válido até {new Date(status.access_token_expires_at).toLocaleString("pt-BR")} — renova sozinho.
            </p>
          ) : null}
        </div>
      ) : (
        <a
          href="/api/seller/mercadolivre/connect"
          className="inline-flex rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Conectar Mercado Livre
        </a>
      )}
    </section>
  );
}
