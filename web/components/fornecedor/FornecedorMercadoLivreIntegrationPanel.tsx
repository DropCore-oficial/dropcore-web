"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { HelpBubble } from "@/components/HelpBubble";
import { Skeleton } from "@/components/ui/Skeleton";
import { AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";

type SyncSummary = {
  updated?: number;
  missing_ml?: number;
  errors?: number;
};

type MercadoLivreStatus = {
  connected: boolean;
  ml_user_id: string | null;
  access_token_expires_at: string | null;
  updated_at: string | null;
  last_sync_at: string | null;
  last_sync_status: "ok" | "parcial" | "erro" | null;
  last_sync_error: string | null;
  last_sync_summary: SyncSummary | null;
};

const BENEFICIOS = ["Estoque sempre atualizado", "Evita overselling nos seus sellers", "Sem token manual pra copiar e colar"];

/** Badge de status do último sync — mesmo formato de "Badge de status" da skill de layout
 * (sem borda, bolinha + rounded-md + font-medium), exceto "parcial" que reaproveita o token
 * de pílula âmbar oficial (`AMBER_PREMIUM_SHELL`, com borda — é o padrão documentado pra
 * chip âmbar, diferente do badge verde/vermelho que não leva borda). */
function SyncStatusBadge({ status }: { status: "ok" | "parcial" | "erro" }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        Sincronizado
      </span>
    );
  }
  if (status === "parcial") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
          AMBER_PREMIUM_SHELL,
          AMBER_PREMIUM_TEXT_PRIMARY,
        )}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        Sincronizado com ressalva
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-red-100 px-2 py-1 text-[11px] font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      Erro no último sync
    </span>
  );
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

export function FornecedorMercadoLivreIntegrationPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<MercadoLivreStatus | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const exchangedCode = useRef<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      router.replace("/fornecedor/login");
      return;
    }
    const res = await fetch("/api/fornecedor/mercadolivre", {
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
    const state = url.searchParams.get("state");

    async function bootstrap() {
      if (code && exchangedCode.current !== code) {
        exchangedCode.current = code;
        const token = await getAccessToken();
        if (token) {
          try {
            const res = await fetch("/api/fornecedor/mercadolivre/oauth", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ code, state }),
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

  async function desconectar() {
    setDisconnecting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        router.replace("/fornecedor/login");
        return;
      }
      const res = await fetch("/api/fornecedor/mercadolivre", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Não foi possível desconectar o Mercado Livre.");
        return;
      }
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex w-full flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm">
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/marketplaces/mercado-livre.png" alt="Mercado Livre" className="h-8 w-8 rounded-lg" />
              <div className="flex items-center gap-1">
                <p className="font-semibold text-[var(--foreground)]">Mercado Livre</p>
                <HelpBubble
                  ariaLabel="Como funciona a conexão com o Mercado Livre"
                  open={helpOpen}
                  onOpen={() => setHelpOpen(true)}
                  onClose={() => setHelpOpen(false)}
                >
                  <p>
                    Conecta a sua conta do Mercado Livre pra manter o estoque do DropCore sempre batendo com o que
                    você tem de verdade — não importa se a venda foi aqui ou direto no seu anúncio. É só leitura, o
                    DropCore nunca publica nem altera nada sozinho na sua conta.
                  </p>
                </HelpBubble>
              </div>
            </div>
            {connected ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                Conectado
              </span>
            ) : null}
          </div>

          <ul className="mt-3 space-y-1.5 text-sm text-[var(--foreground)]">
            {BENEFICIOS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L9 10.94 7.28 9.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z"
                    clipRule="evenodd"
                  />
                </svg>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-4">
            {connected ? (
              <>
                {status?.ml_user_id ? <p className="text-xs text-[var(--muted)]">Conta #{status.ml_user_id}</p> : null}
                {status?.access_token_expires_at ? (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Acesso válido até {new Date(status.access_token_expires_at).toLocaleString("pt-BR")} — renova
                    sozinho.
                  </p>
                ) : null}
                {status?.last_sync_status ? (
                  <div className="mt-2 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <SyncStatusBadge status={status.last_sync_status} />
                      {status.last_sync_at ? (
                        <span className="text-xs text-[var(--muted)]">
                          Último sync: {new Date(status.last_sync_at).toLocaleString("pt-BR")}
                        </span>
                      ) : null}
                    </div>
                    {status.last_sync_status !== "ok" && status.last_sync_error ? (
                      <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "text-xs")}>{status.last_sync_error}</p>
                    ) : null}
                    {status.last_sync_summary ? (
                      <p className="text-xs text-[var(--muted)]">
                        {status.last_sync_summary.updated ?? 0} SKU(s) atualizado(s)
                        {status.last_sync_summary.missing_ml
                          ? ` · ${status.last_sync_summary.missing_ml} sem SKU correspondente no ML`
                          : ""}
                        {status.last_sync_summary.errors ? ` · ${status.last_sync_summary.errors} erro(s)` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <a
                    href="/api/fornecedor/mercadolivre/connect"
                    className="inline-flex flex-1 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                  >
                    Reconectar
                  </a>
                  <button
                    type="button"
                    onClick={() => void desconectar()}
                    disabled={disconnecting}
                    className="inline-flex flex-1 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-60"
                  >
                    {disconnecting ? "Desconectando..." : "Desconectar"}
                  </button>
                </div>
              </>
            ) : (
              <a
                href="/api/fornecedor/mercadolivre/connect"
                className="flex w-full items-center justify-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Conectar
              </a>
            )}
          </div>
        </>
      )}
      {error ? <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "mt-3 text-center text-xs")}>{error}</p> : null}
    </div>
  );
}
