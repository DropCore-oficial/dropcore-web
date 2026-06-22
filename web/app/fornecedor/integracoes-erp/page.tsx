"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import {
  SUCCESS_PREMIUM_SURFACE_TRANSPARENT,
  SUCCESS_PREMIUM_TEXT_PRIMARY,
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_BODY,
} from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

export default function FornecedorIntegracoesErpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [olistUnavailable, setOlistUnavailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const [tokenUsable, setTokenUsable] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenPrefix, setTokenPrefix] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [syncLastAt, setSyncLastAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncUpdated, setSyncUpdated] = useState<number | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const applyPayload = useCallback((json: Record<string, unknown>) => {
    setOlistUnavailable(Boolean(json.olist_unavailable));
    setConnected(Boolean(json.connected));
    setTokenUsable(json.token_usable !== false);
    setTokenError(typeof json.token_error === "string" ? json.token_error : null);
    setTokenPrefix(typeof json.token_prefix === "string" ? json.token_prefix : null);
    setAccountName(typeof json.account_name === "string" ? json.account_name : null);
    setValidatedAt(typeof json.validated_at === "string" ? json.validated_at : null);

    const sync = json.estoque_sync && typeof json.estoque_sync === "object" ? (json.estoque_sync as Record<string, unknown>) : null;
    setSyncLastAt(sync && typeof sync.last_at === "string" ? sync.last_at : null);
    setSyncStatus(sync && typeof sync.status === "string" ? sync.status : null);
    setSyncError(sync && typeof sync.error === "string" ? sync.error : null);
    setSyncUpdated(sync && typeof sync.updated === "number" ? sync.updated : null);
  }, []);

  const loadOlist = useCallback(async (token: string) => {
    const res = await fetch("/api/fornecedor/olist", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar integração Olist.");
    applyPayload(json);
  }, [applyPayload]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          router.replace("/fornecedor/login");
          return;
        }
        await loadOlist(session.access_token);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, loadOlist]);

  async function withSession(fn: (token: string) => Promise<void>) {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      router.replace("/fornecedor/login");
      return;
    }
    await fn(session.access_token);
  }

  async function salvarToken() {
    setSaving(true);
    setError(null);
    try {
      await withSession(async (accessToken) => {
        const res = await fetch("/api/fornecedor/olist", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ olist_api_token: tokenInput.trim() }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Erro ao salvar token.");
        setTokenInput("");
        await loadOlist(accessToken);
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar token.");
    } finally {
      setSaving(false);
    }
  }

  async function removerToken() {
    setSaving(true);
    setError(null);
    try {
      await withSession(async (accessToken) => {
        const res = await fetch("/api/fornecedor/olist", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Erro ao remover token.");
        setTokenInput("");
        await loadOlist(accessToken);
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover token.");
    } finally {
      setSaving(false);
    }
  }

  async function sincronizarEstoque() {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      await withSession(async (accessToken) => {
        const res = await fetch("/api/fornecedor/olist/sync-estoque", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Erro ao sincronizar estoque.");
        const r = json.result as Record<string, unknown> | undefined;
        const updated = typeof r?.updated === "number" ? r.updated : 0;
        const unchanged = typeof r?.unchanged === "number" ? r.unchanged : 0;
        setSyncResult(`${updated} SKU(s) atualizado(s), ${unchanged} já estavam iguais.`);
        await loadOlist(accessToken);
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao sincronizar estoque.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <FornecedorNav active="integracoes" />
      <div className="dropcore-shell-4xl space-y-5 py-5 md:py-7">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] md:text-2xl">Integração ERP (Olist/Tiny)</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Conecte a Olist do seu armazém. O estoque entra no DropCore e segue automaticamente para os sellers ligados a você.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Carregando…</p>
        ) : olistUnavailable ? (
          <AmberPremiumCallout title="Integração ainda não disponível no banco">
            Peça ao admin para executar o script <code className="text-xs">add-fornecedor-olist-integration.sql</code> no Supabase.
          </AmberPremiumCallout>
        ) : (
          <>
            {error ? (
              <div className={cn("rounded-xl border px-4 py-3 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
                {error}
              </div>
            ) : null}

            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--foreground)]">Olist/Tiny do fornecedor</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Use o token API da <strong className="text-[var(--foreground)]">sua</strong> conta Olist (ERP do armazém), não a do seller.
                  </p>
                </div>
                {connected && tokenUsable ? (
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", SUCCESS_PREMIUM_SURFACE_TRANSPARENT, SUCCESS_PREMIUM_TEXT_PRIMARY)}>
                    Conectado
                  </span>
                ) : (
                  <span className="rounded-full border border-[var(--card-border)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                    Desconectado
                  </span>
                )}
              </div>

              {connected ? (
                <div className="text-sm space-y-1 text-[var(--muted)]">
                  {accountName ? <p>Conta: <span className="text-[var(--foreground)]">{accountName}</span></p> : null}
                  {tokenPrefix ? <p>Token: <span className="font-mono text-[var(--foreground)]">{tokenPrefix}…</span></p> : null}
                  {validatedAt ? (
                    <p>Validado em: {new Date(validatedAt).toLocaleString("pt-BR")}</p>
                  ) : null}
                  {tokenError ? <p className="text-[var(--danger)]">{tokenError}</p> : null}
                </div>
              ) : null}

              {!connected || !tokenUsable ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[var(--muted)]">Token API Olist/Tiny</label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Cole o token gerado na Olist"
                    className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    disabled={saving || !tokenInput.trim()}
                    onClick={() => void salvarToken()}
                    className="rounded-lg bg-[var(--primary-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-blue-hover)] disabled:opacity-50"
                  >
                    {saving ? "Salvando…" : "Salvar e validar"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void sincronizarEstoque()}
                    className="rounded-lg bg-[var(--primary-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-blue-hover)] disabled:opacity-50"
                  >
                    {syncing ? "Sincronizando estoque…" : "Sincronizar estoque agora"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void removerToken()}
                    className="rounded-lg border border-[var(--card-border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                  >
                    Desconectar
                  </button>
                </div>
              )}

              {syncResult ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-300">{syncResult}</p>
              ) : null}

              {syncLastAt ? (
                <div className="border-t border-[var(--card-border)] pt-3 text-xs text-[var(--muted)] space-y-0.5">
                  <p>Último sync automático/manual: {new Date(syncLastAt).toLocaleString("pt-BR")}</p>
                  {syncStatus ? <p>Status: {syncStatus}{syncUpdated != null ? ` · ${syncUpdated} SKU(s) alterados` : ""}</p> : null}
                  {syncError ? <p className="text-[var(--danger)]">{syncError}</p> : null}
                </div>
              ) : null}
            </div>

            <AmberPremiumCallout title="Como funciona" className="rounded-2xl px-4 py-3.5">
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm">
                <li>Você mantém o estoque na <strong className="text-[var(--foreground)]">Olist do Djulios</strong> (mesmos SKUs do DropCore).</li>
                <li>O DropCore puxa o saldo para o catálogo (a cada ~15 min ou no botão acima).</li>
                <li>Os sellers ligados recebem o estoque na Olist deles automaticamente.</li>
              </ol>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Pedidos e NF continuam na Olist do seller. Cadastro fiscal (NCM/CEST) continua no DropCore → export do seller.
              </p>
            </AmberPremiumCallout>
          </>
        )}
      </div>
    </div>
  );
}
