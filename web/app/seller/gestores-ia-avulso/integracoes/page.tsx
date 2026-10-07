"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

type Access = "loading" | "liberado" | "sem_pacote" | "denied";

type MlStatus = { connected: boolean; ml_user_id: string | null };

/**
 * Integrações do pacote avulso "Gestores de IA" — hoje só o Mercado Livre. Separado da
 * lista de gestores (/seller/gestores-ia-avulso) de propósito, mesmo padrão do hub (ERP
 * fica numa tela própria, não dentro de cada gestor).
 */
export default function GestoresIaAvulsoIntegracoesPage() {
  const router = useRouter();
  const [access, setAccess] = useState<Access>("loading");
  const [mlStatus, setMlStatus] = useState<MlStatus | null>(null);
  const [mlStatusLoading, setMlStatusLoading] = useState(false);
  const [mlErro, setMlErro] = useState<string | null>(null);

  const refreshMlStatus = useCallback(async () => {
    setMlStatusLoading(true);
    setMlErro(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/mercadolivre", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao conferir conexão com o Mercado Livre.");
      setMlStatus({ connected: Boolean(j.connected), ml_user_id: j.ml_user_id ?? null });
    } catch (e: unknown) {
      setMlErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setMlStatusLoading(false);
    }
  }, []);

  async function desconectarMl() {
    if (!confirm("Desconectar sua conta do Mercado Livre? Os gestores param de funcionar até reconectar.")) return;
    setMlStatusLoading(true);
    setMlErro(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/mercadolivre", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao desconectar.");
      setMlStatus({ connected: false, ml_user_id: null });
    } catch (e: unknown) {
      setMlErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setMlStatusLoading(false);
    }
  }

  const refresh = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const res = await fetch(`/api/calculadora/me?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAccess("denied");
      return;
    }
    if (j.access === "calc_only" && j.inclui_gestores_ia === true) {
      setAccess("liberado");
    } else if (j.access === "calc_only") {
      setAccess("sem_pacote");
    } else {
      router.replace("/seller/calculadora");
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (access === "liberado") void refreshMlStatus();
  }, [access, refreshMlStatus]);

  if (access === "denied") {
    return (
      <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
        <div className="dropcore-shell-6xl py-10 text-center text-sm text-[var(--muted)]">
          Não foi possível validar seu acesso.
        </div>
      </div>
    );
  }

  if (access === "sem_pacote") {
    router.replace("/seller/calculadora");
    return null;
  }

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Integrações
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Conecte sua conta do Mercado Livre pra liberar os Gestores de IA.
            </p>
          </div>
        </header>

        {access === "loading" ? (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
            <Skeleton className="mx-auto h-4 w-3/4 max-w-sm" />
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
            {mlStatusLoading && !mlStatus ? (
              <Skeleton className="mx-auto h-4 w-3/4 max-w-sm" />
            ) : mlStatus?.connected ? (
              <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">Mercado Livre conectado</p>
                  <p className="text-xs text-[var(--muted)]">Conta #{mlStatus.ml_user_id}</p>
                </div>
                <button
                  type="button"
                  onClick={desconectarMl}
                  disabled={mlStatusLoading}
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-50"
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-[var(--muted)]">
                  Conecte sua conta do Mercado Livre pra começar a usar os gestores.
                </p>
                <a
                  href="/api/gestores-ia-avulso/mercadolivre/connect"
                  className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  Conectar Mercado Livre
                </a>
              </div>
            )}
            {mlErro && <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "mt-3 text-center text-xs")}>{mlErro}</p>}
          </div>
        )}
      </div>
      <SellerNav active="integracoes" calcOnly temGestoresIa />
    </div>
  );
}
