"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { FornecedorNav } from "../FornecedorNav";
import { FornecedorOlistIntegracaoChecklist } from "@/components/fornecedor/FornecedorOlistIntegracaoChecklist";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_BODY,
} from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";
import { useVisibilityAwareInterval } from "@/lib/useVisibilityAwareInterval";

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
  const [webhookEstoqueUrl, setWebhookEstoqueUrl] = useState<string | null>(null);
  const [webhookCnpjReady, setWebhookCnpjReady] = useState(false);
  const [webhookEstoqueLastAt, setWebhookEstoqueLastAt] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ingestRegenerating, setIngestRegenerating] = useState(false);

  const applyPayload = useCallback((json: Record<string, unknown>) => {
    setOlistUnavailable(Boolean(json.olist_unavailable));
    setConnected(Boolean(json.connected));
    setTokenUsable(json.token_usable !== false);
    setTokenError(typeof json.token_error === "string" ? json.token_error : null);
    setTokenPrefix(typeof json.token_prefix === "string" ? json.token_prefix : null);
    setAccountName(typeof json.account_name === "string" ? json.account_name : null);
    setValidatedAt(typeof json.validated_at === "string" ? json.validated_at : null);
    setWebhookEstoqueUrl(typeof json.webhook_estoque_url === "string" ? json.webhook_estoque_url : null);
    setWebhookCnpjReady(Boolean(json.olist_webhook_cnpj_ready));
    setWebhookEstoqueLastAt(
      typeof json.webhook_estoque_last_at === "string" ? json.webhook_estoque_last_at : null,
    );

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

  const load = useCallback(async () => {
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
  }, [router, loadOlist]);

  useEffect(() => {
    void load();
  }, [load]);

  useVisibilityAwareInterval(
    async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      try {
        await loadOlist(session.access_token);
      } catch {
        /* polling silencioso */
      }
    },
    60_000,
    !connected || !tokenUsable || loading,
  );

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
        if (typeof json.webhook_estoque_url === "string") {
          setWebhookEstoqueUrl(json.webhook_estoque_url);
        }
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

  async function atualizar() {
    setRefreshing(true);
    setError(null);
    try {
      await withSession(async (accessToken) => {
        await loadOlist(accessToken);
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setRefreshing(false);
    }
  }

  async function regenerarWebhookIngest() {
    setIngestRegenerating(true);
    setError(null);
    try {
      await withSession(async (accessToken) => {
        const res = await fetch("/api/fornecedor/olist/ingest-token", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Erro ao gerar novo link do webhook.");
        if (typeof json.webhook_estoque_url === "string") {
          setWebhookEstoqueUrl(json.webhook_estoque_url);
        }
        await loadOlist(accessToken);
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao gerar novo link do webhook.");
    } finally {
      setIngestRegenerating(false);
    }
  }

  const cronBackupLastAt =
    syncLastAt && syncStatus && syncStatus !== "webhook" ? syncLastAt : null;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <FornecedorNav active="integracoes" />
      <div className="dropcore-shell-4xl space-y-5 py-5 md:space-y-6 md:py-7">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)] md:text-2xl">Integração ERP (Olist/Tiny)</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Conecte a Olist do armazém. Estoque entra pelo webhook; o cron no Supabase é rede de segurança se a Olist não avisar.
          </p>
        </div>

        <AmberPremiumCallout title="Olist do armazém (fornecedor)" className="rounded-2xl px-3 py-3.5 sm:px-5">
          <p className="text-pretty leading-relaxed text-sm">
            Gere o <strong className="text-[var(--foreground)]">token API</strong> na Olist/Tiny do Djulios (não use o token do seller),
            cole abaixo e cadastre a <strong className="text-[var(--foreground)]">URL de notificações do estoque</strong> na Olist.
            Você <strong className="text-[var(--foreground)]">não precisa</strong> ficar clicando em sincronizar — webhook + cron automático cuidam disso.
          </p>
        </AmberPremiumCallout>

        <section className="relative rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
          {loading ? (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-[var(--card)]/95 px-6"
              role="status"
              aria-live="polite"
            >
              <span className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--card-border)] border-t-emerald-500" />
              <p className="text-sm text-[var(--muted)]">Carregando…</p>
            </div>
          ) : null}

          {error ? (
            <div className={cn("mb-4 rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
              {error}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--foreground)]">Conta Olist/Tiny</h2>
              {connected && tokenUsable ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Token salvo
                </span>
              ) : (
                <span className="rounded-full bg-[var(--muted)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">
                  Pendente
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void atualizar()}
              disabled={refreshing}
              className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
            >
              {refreshing ? "Atualizando…" : "Atualizar"}
            </button>
          </div>

          {olistUnavailable ? (
            <p className={cn("text-sm", AMBER_PREMIUM_TEXT_SOFT)}>
              Tabela não encontrada. Execute <code className="text-xs">add-fornecedor-olist-integration.sql</code> e{" "}
              <code className="text-xs">add-fornecedor-olist-webhook.sql</code> no Supabase.
            </p>
          ) : (
            <div className="space-y-4">
              {connected && !tokenUsable && tokenError ? (
                <AmberPremiumCallout title="Token salvo, mas inacessível neste servidor" className="rounded-2xl px-3 py-3.5 sm:px-5">
                  <p className="text-pretty leading-relaxed">{tokenError}</p>
                </AmberPremiumCallout>
              ) : null}

              <FornecedorOlistIntegracaoChecklist
                connected={connected}
                tokenUsable={tokenUsable}
                cnpjReady={webhookCnpjReady}
                webhookUrl={webhookEstoqueUrl}
                webhookLastReceivedAt={webhookEstoqueLastAt}
                syncLastAt={cronBackupLastAt}
                syncStatus={syncStatus}
              />

              <OlistWebhookEstoquePanel
                webhookUrl={webhookEstoqueUrl}
                connected={connected}
                cnpjReady={webhookCnpjReady}
                tokenUsable={tokenUsable}
                ingestRegenerating={ingestRegenerating}
                onRegenerarIngest={() => void regenerarWebhookIngest()}
              />

              {connected ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm">
                    {accountName ? (
                      <p className="text-[var(--foreground)]">
                        Conta: <strong>{accountName}</strong>
                      </p>
                    ) : null}
                    {tokenPrefix ? (
                      <p className="mt-1 text-[var(--muted)]">
                        Token salvo: <span className="font-mono text-xs">{tokenPrefix}</span>
                      </p>
                    ) : null}
                    {validatedAt ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Validado em {new Date(validatedAt).toLocaleString("pt-BR")}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm">
                    <p className="font-medium text-[var(--foreground)]">Sincronização automática de estoque (rede de segurança)</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                      O DropCore consulta a Olist do armazém <strong className="text-[var(--foreground)]">a cada ~15 minutos</strong>{" "}
                      (cron no Supabase), caso o webhook não dispare. Movimentações normais entram pelo webhook na hora —{" "}
                      <strong className="text-[var(--foreground)]">não é preciso clicar em sincronizar</strong>.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {cronBackupLastAt ? (
                        <>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            Cron OK
                          </span>
                          <span className="text-xs text-[var(--muted)]">
                            Última execução: {new Date(cronBackupLastAt).toLocaleString("pt-BR")}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">
                          Aguardando primeira execução do cron (até ~15 min após salvar o token).
                        </span>
                      )}
                    </div>
                    {syncUpdated != null && syncStatus && syncStatus !== "webhook" ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Último resultado: {syncUpdated} SKU(s) alterado(s)
                      </p>
                    ) : null}
                    {syncError && syncStatus !== "webhook" ? (
                      <p className={cn("mt-2 text-xs", DANGER_PREMIUM_TEXT_BODY)}>{syncError}</p>
                    ) : null}
                    {webhookEstoqueLastAt ? (
                      <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                        Webhook ativo — último evento: {new Date(webhookEstoqueLastAt).toLocaleString("pt-BR")}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                Token API da Olist/Tiny
              </label>
              <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">
                Cole o token gerado em Configurações → Token API. O DropCore valida com a Olist/Tiny antes de salvar.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Cole o token gerado na Olist"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                  autoComplete="off"
                />
                <button
                  type="button"
                  disabled={saving || !tokenInput.trim()}
                  onClick={() => void salvarToken()}
                  className="shrink-0 rounded-lg bg-[var(--primary-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-blue-hover)] disabled:opacity-50"
                >
                  {saving ? "Salvando…" : "Salvar token"}
                </button>
              </div>
              {connected ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void removerToken()}
                  className="text-xs font-medium text-[var(--muted)] underline hover:text-[var(--foreground)] disabled:opacity-50"
                >
                  Desconectar token
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function OlistWebhookEstoquePanel(props: {
  webhookUrl: string | null;
  connected: boolean;
  cnpjReady: boolean;
  tokenUsable: boolean;
  ingestRegenerating: boolean;
  onRegenerarIngest: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = props.webhookUrl?.trim() ?? "";
  const podeRegenerar = props.connected && props.cnpjReady && props.tokenUsable;

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--foreground)]">Webhook de estoque (Olist/Tiny)</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            <strong className="text-[var(--foreground)]">Canal principal:</strong> a Olist avisa o DropCore quando o saldo muda.
            O parâmetro <code className="font-mono text-[10px]">?w=</code> é um token só seu; o CNPJ no JSON precisa bater com o salvo aqui.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copiar()}
            disabled={!url}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            {copied ? "Copiado" : "Copiar URL"}
          </button>
          <button
            type="button"
            onClick={props.onRegenerarIngest}
            disabled={!podeRegenerar || props.ingestRegenerating}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
            title="Invalida o link atual; atualize a URL na Olist/Tiny"
          >
            {props.ingestRegenerating ? "Gerando…" : "Novo link webhook"}
          </button>
        </div>
      </div>

      {url ? (
        <>
          <textarea
            readOnly
            value={url}
            rows={3}
            spellCheck={false}
            className="mt-3 min-h-[4rem] w-full resize-y rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-2 font-mono text-[11px] leading-snug text-[var(--foreground)] break-all whitespace-pre-wrap"
            aria-label="URL do webhook de estoque"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
            Cadastre em Configurações → Webhooks → <strong className="text-[var(--foreground)]">URL de notificações do estoque</strong>{" "}
            (não é o webhook de pedidos do seller).
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">
          URL indisponível — salve o token para gerar o link (após rodar o SQL de webhook no Supabase).
        </p>
      )}

      {props.connected && !props.cnpjReady ? (
        <AmberPremiumCallout title="Webhook ainda não associa esta conta" className="mt-3 rounded-xl px-3 py-3 sm:px-4">
          <p className="text-pretty text-xs leading-relaxed">
            Rode <code className="font-mono text-[11px]">add-fornecedor-olist-webhook.sql</code> no Supabase e{" "}
            <strong className="text-[var(--foreground)]">salve o token de novo</strong> para gravar o CNPJ da Olist.
          </p>
        </AmberPremiumCallout>
      ) : null}
    </div>
  );
}
