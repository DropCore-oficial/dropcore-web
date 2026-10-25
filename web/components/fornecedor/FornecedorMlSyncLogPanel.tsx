"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Skeleton } from "@/components/ui/Skeleton";

type MlSyncLogEntrada = {
  id: string;
  seller_id: string;
  seller_nome: string;
  sku: string;
  ml_item_id: string | null;
  estoque_enviado: number | null;
  sucesso: boolean;
  erro: string | null;
  criado_em: string;
};

export function FornecedorMlSyncLogPanel() {
  const [itens, setItens] = useState<MlSyncLogEntrada[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/fornecedor/ml-sync-log", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar histórico.");
      setItens(Array.isArray(json.itens) ? json.itens : []);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar histórico.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <details className="group min-w-0 overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">
          Últimos envios de estoque pro Mercado Livre
        </span>
        <span className="shrink-0 text-xs text-[var(--muted)]">
          {loaded ? `${itens.length} recente(s)` : "ver histórico"}
        </span>
      </summary>

      <div className="border-t border-[var(--card-border)] px-4 py-3 sm:px-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : error ? (
          <p className="text-sm text-[var(--muted)]">{error}</p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nenhum envio registrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {itens.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--foreground)]">
                    {item.sku} · {item.seller_nome}
                  </p>
                  <p className="text-[var(--muted)]">
                    {new Date(item.criado_em).toLocaleString("pt-BR")}
                    {item.estoque_enviado != null ? <> · enviado: {item.estoque_enviado}</> : null}
                  </p>
                  {!item.sucesso && item.erro ? (
                    <p className="mt-0.5 text-red-700 dark:text-red-400">{item.erro}</p>
                  ) : null}
                </div>
                {item.sucesso ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                    Enviado
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-red-100 px-2 py-1 text-[11px] font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                    Erro
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => void carregar()}
          disabled={loading}
          className="mt-3 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-50"
        >
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
    </details>
  );
}
