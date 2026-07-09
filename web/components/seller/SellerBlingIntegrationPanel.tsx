"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { SellerBlingConnectGuidePanel } from "@/components/seller/SellerBlingConnectGuidePanel";

type BlingStatus = {
  bling_unavailable: boolean;
  webhook_url: string;
  bling_company_id: string | null;
  oauth_connected: boolean;
  access_token_expires_at: string | null;
  bling_events: Array<{ id: string; event_type: string | null; criado_em: string }>;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

export function SellerBlingIntegrationPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BlingStatus | null>(null);
  const [companyIdInput, setCompanyIdInput] = useState("");
  const [saving, setSaving] = useState(false);
  const exchangedCode = useRef<string | null>(null);

  const load = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch("/api/seller/bling", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as BlingStatus & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Erro ao carregar integração Bling.");
      setLoading(false);
      return;
    }
    setStatus(json);
    setCompanyIdInput(json.bling_company_id ?? "");
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    async function bootstrap() {
      if (code && exchangedCode.current !== code) {
        exchangedCode.current = code;
        const token = await getAccessToken();
        if (token) {
          try {
            const res = await fetch("/api/seller/bling/oauth", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(json.error ?? "Não foi possível concluir a conexão com o Bling.");
            }
          } catch {
            setError("Não foi possível concluir a conexão com o Bling.");
          }
        }
        url.searchParams.delete("code");
        router.replace(url.pathname + url.search, { scroll: false });
      }
      await load();
    }

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salvarCompanyId = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/seller/bling", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bling_company_id: companyIdInput }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Erro ao salvar o companyId.");
      } else {
        await load();
      }
    } finally {
      setSaving(false);
    }
  }, [companyIdInput, load]);

  const desconectar = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/seller/bling", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clear_company_id: true }),
      });
      if (res.ok) await load();
    } finally {
      setSaving(false);
    }
  }, [load]);

  const copiarWebhookUrl = useCallback(() => {
    if (status?.webhook_url) void navigator.clipboard.writeText(status.webhook_url);
  }, [status]);

  return (
    <section className="relative rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
      {loading ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-[var(--card)]/95 px-6" role="status" aria-live="polite">
          <span className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--card-border)] border-t-emerald-500" />
          <p className="text-sm text-[var(--muted)]">Carregando...</p>
        </div>
      ) : null}

      {error ? (
        <div className={cn("mb-4 rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--foreground)]">Integração Bling</h2>
          {status?.oauth_connected ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Conectado
            </span>
          ) : (
            <span className="rounded-full bg-[var(--muted)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">
              Pendente
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
        >
          Atualizar
        </button>
      </div>

      {status?.bling_unavailable ? (
        <p className="text-sm text-[var(--muted)]">
          Integração Bling ainda não disponível neste ambiente (scripts de banco pendentes).
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
              URL do webhook (cole no Bling)
            </label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs text-[var(--foreground)]">
                {status?.webhook_url ?? "—"}
              </code>
              <button
                type="button"
                onClick={copiarWebhookUrl}
                className="shrink-0 rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
              >
                Copiar URL
              </button>
            </div>
          </div>

          {status?.oauth_connected ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
              <span>
                Empresa vinculada: <strong className="text-[var(--foreground)]">{status.bling_company_id ?? "—"}</strong>
              </span>
              <button
                type="button"
                onClick={() => void desconectar()}
                disabled={saving}
                className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
              >
                Desconectar
              </button>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                ID da empresa no Bling (companyId)
              </label>
              <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">
                Depois de autorizar pelo Link de convite (guia abaixo), o companyId aparece sozinho. Só cole aqui manualmente se
                precisar corrigir.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={companyIdInput}
                  onChange={(e) => setCompanyIdInput(e.target.value)}
                  placeholder="companyId da empresa no Bling"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                />
                <button
                  type="button"
                  onClick={() => void salvarCompanyId()}
                  disabled={saving || !companyIdInput.trim()}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-[var(--card-border)] pt-4">
            <SellerBlingConnectGuidePanel />
          </div>
        </div>
      )}
    </section>
  );
}
