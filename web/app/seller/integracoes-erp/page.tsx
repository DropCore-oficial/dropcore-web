"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_BODY,
} from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

export default function SellerIntegracoesErpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [olistUnavailable, setOlistUnavailable] = useState(false);
  const [olistConnected, setOlistConnected] = useState(false);
  const [olistTokenUsable, setOlistTokenUsable] = useState(true);
  const [olistTokenError, setOlistTokenError] = useState<string | null>(null);
  const [olistTokenPrefix, setOlistTokenPrefix] = useState<string | null>(null);
  const [olistAccountName, setOlistAccountName] = useState<string | null>(null);
  const [olistValidatedAt, setOlistValidatedAt] = useState<string | null>(null);
  const [olistSyncLastAt, setOlistSyncLastAt] = useState<string | null>(null);
  const [olistSyncStatus, setOlistSyncStatus] = useState<string | null>(null);
  const [olistSyncError, setOlistSyncError] = useState<string | null>(null);
  const [olistSyncImported, setOlistSyncImported] = useState<number | null>(null);
  const [olistSyncSkipped, setOlistSyncSkipped] = useState<number | null>(null);
  const [olistSyncWarnings, setOlistSyncWarnings] = useState<number | null>(null);
  const [olistWebhookPedidosUrl, setOlistWebhookPedidosUrl] = useState<string | null>(null);
  const [olistWebhookCnpjReady, setOlistWebhookCnpjReady] = useState(false);
  const [olistTokenInput, setOlistTokenInput] = useState("");
  const [olistSaving, setOlistSaving] = useState(false);
  const [olistSyncing, setOlistSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const applyOlistPayload = useCallback((json: Record<string, unknown>) => {
    setOlistUnavailable(Boolean(json.olist_unavailable));
    setOlistConnected(Boolean(json.connected));
    setOlistTokenUsable(json.token_usable !== false);
    setOlistTokenError(typeof json.token_error === "string" ? json.token_error : null);
    setOlistTokenPrefix(typeof json.token_prefix === "string" ? json.token_prefix : null);
    setOlistAccountName(typeof json.account_name === "string" ? json.account_name : null);
    setOlistValidatedAt(typeof json.validated_at === "string" ? json.validated_at : null);

    const sync = json.sync && typeof json.sync === "object" ? (json.sync as Record<string, unknown>) : null;
    setOlistSyncLastAt(sync && typeof sync.last_at === "string" ? sync.last_at : null);
    setOlistSyncStatus(sync && typeof sync.status === "string" ? sync.status : null);
    setOlistSyncError(sync && typeof sync.error === "string" ? sync.error : null);
    setOlistSyncImported(sync && typeof sync.imported === "number" ? sync.imported : null);
    setOlistSyncSkipped(sync && typeof sync.skipped === "number" ? sync.skipped : null);
    setOlistSyncWarnings(sync && typeof sync.warnings === "number" ? sync.warnings : null);

    setOlistWebhookPedidosUrl(typeof json.webhook_pedidos_url === "string" ? json.webhook_pedidos_url : null);
    setOlistWebhookCnpjReady(Boolean(json.olist_webhook_cnpj_ready));
  }, []);

  const loadOlist = useCallback(async (token: string) => {
    const res = await fetch("/api/seller/olist", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar integração Olist/Tiny.");
    applyOlistPayload(json);
  }, [applyOlistPayload]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
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

  async function salvarOlistToken() {
    setOlistSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/olist", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ olist_api_token: olistTokenInput.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao salvar o token da Olist/Tiny.");
      setOlistTokenInput("");
      await loadOlist(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao salvar o token da Olist/Tiny.");
    } finally {
      setOlistSaving(false);
    }
  }

  async function removerOlistToken() {
    setOlistSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/olist", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao remover o token.");
      applyOlistPayload({
        olist_unavailable: false,
        connected: false,
        token_usable: false,
        token_error: null,
        token_prefix: null,
        account_name: null,
        validated_at: null,
        sync: {
          last_at: null,
          status: null,
          error: null,
          imported: null,
          skipped: null,
          warnings: null,
        },
      });
      setOlistTokenInput("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao remover o token.");
    } finally {
      setOlistSaving(false);
    }
  }

  async function sincronizarPedidosAgora() {
    setOlistSyncing(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/olist/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const retry =
          typeof json?.retry_after_seconds === "number" && Number.isFinite(json.retry_after_seconds)
            ? Math.max(1, Math.ceil(json.retry_after_seconds))
            : null;
        const base =
          typeof json?.error === "string" && json.error.trim()
            ? json.error.trim()
            : "Erro ao sincronizar pedidos da Olist/Tiny.";
        throw new Error(retry ? `${base} Tente de novo em cerca de ${retry} segundos.` : base);
      }
      await loadOlist(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao sincronizar pedidos da Olist/Tiny.");
    } finally {
      setOlistSyncing(false);
    }
  }

  async function atualizar() {
    setRefreshing(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      await loadOlist(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <IntegracoesErpPageView
      loading={loading}
      error={error}
      olistUnavailable={olistUnavailable}
      olistConnected={olistConnected}
      olistTokenUsable={olistTokenUsable}
      olistTokenError={olistTokenError}
      olistTokenPrefix={olistTokenPrefix}
      olistAccountName={olistAccountName}
      olistValidatedAt={olistValidatedAt}
      olistSyncLastAt={olistSyncLastAt}
      olistSyncStatus={olistSyncStatus}
      olistSyncError={olistSyncError}
      olistSyncImported={olistSyncImported}
      olistSyncSkipped={olistSyncSkipped}
      olistSyncWarnings={olistSyncWarnings}
      olistWebhookPedidosUrl={olistWebhookPedidosUrl}
      olistWebhookCnpjReady={olistWebhookCnpjReady}
      olistTokenInput={olistTokenInput}
      setOlistTokenInput={setOlistTokenInput}
      olistSaving={olistSaving}
      olistSyncing={olistSyncing}
      refreshing={refreshing}
      onSalvarOlistToken={() => void salvarOlistToken()}
      onRemoverOlistToken={() => void removerOlistToken()}
      onSincronizarPedidos={() => void sincronizarPedidosAgora()}
      onAtualizar={() => void atualizar()}
    />
  );
}

type IntegracoesPageProps = {
  loading: boolean;
  error: string | null;
  olistUnavailable: boolean;
  olistConnected: boolean;
  olistTokenUsable: boolean;
  olistTokenError: string | null;
  olistTokenPrefix: string | null;
  olistAccountName: string | null;
  olistValidatedAt: string | null;
  olistSyncLastAt: string | null;
  olistSyncStatus: string | null;
  olistSyncError: string | null;
  olistSyncImported: number | null;
  olistSyncSkipped: number | null;
  olistSyncWarnings: number | null;
  olistWebhookPedidosUrl: string | null;
  olistWebhookCnpjReady: boolean;
  olistTokenInput: string;
  setOlistTokenInput: (value: string) => void;
  olistSaving: boolean;
  olistSyncing: boolean;
  refreshing: boolean;
  onSalvarOlistToken: () => void;
  onRemoverOlistToken: () => void;
  onSincronizarPedidos: () => void;
  onAtualizar: () => void;
};

function IntegracoesErpPageView(props: IntegracoesPageProps) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <SellerNav active="integracoes" />
      <div className="dropcore-shell-4xl space-y-5 py-5 md:space-y-6 md:py-7">
        <SellerPageHeader
          surface="hero"
          title="Integração ERP (Olist/Tiny)"
          right={
            <Link
              href="/seller/integracoes-erp/como-conectar"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] shadow-sm transition hover:border-emerald-500/40 hover:bg-[var(--surface-hover)] dark:hover:border-emerald-400/35"
            >
              <span className="hidden sm:inline">Como conectar</span>
              <span className="sm:hidden">Guia</span>
              <svg className="h-4 w-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          }
        />

        <AmberPremiumCallout title="Primeira vez na Olist/Tiny?" className="rounded-2xl px-3 py-3.5 sm:px-5">
          <p className="text-pretty leading-relaxed">
            O passo a passo fica em{" "}
            <Link
              href="/seller/integracoes-erp/como-conectar"
              className="font-semibold text-[var(--foreground)] underline underline-offset-2"
            >
              Como conectar
            </Link>
            . Você gera o <strong className="text-[var(--foreground)]">token API</strong> na Olist/Tiny e cola aqui. Webhook na Olist/Tiny
            não é obrigatório para começar.
          </p>
        </AmberPremiumCallout>

        <section className="relative rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
          {props.loading ? (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-[var(--card)]/95 px-6"
              role="status"
              aria-live="polite"
            >
              <span className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--card-border)] border-t-emerald-500" />
              <p className="text-sm text-[var(--muted)]">Carregando...</p>
            </div>
          ) : null}

          {props.error ? (
            <div className={cn("mb-4 rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
              {props.error}
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--foreground)]">Conta Olist/Tiny</h2>
                {props.olistConnected ? (
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
                onClick={props.onAtualizar}
                disabled={props.refreshing}
                className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
              >
                {props.refreshing ? "Atualizando..." : "Atualizar"}
              </button>
            </div>

            {props.olistUnavailable ? (
              <p className={cn("text-sm", AMBER_PREMIUM_TEXT_SOFT)}>
                Tabela Olist/Tiny não encontrada. Execute o script <code className="text-xs">add-seller-olist-integration.sql</code> no
                Supabase.
              </p>
            ) : (
              <div className="space-y-4">
                {props.olistConnected && !props.olistTokenUsable && props.olistTokenError ? (
                  <AmberPremiumCallout title="Token salvo, mas inacessível neste servidor" className="rounded-2xl px-3 py-3.5 sm:px-5">
                    <p className="text-pretty leading-relaxed">{props.olistTokenError}</p>
                  </AmberPremiumCallout>
                ) : null}

                <OlistWebhookPedidosPanel
                  webhookUrl={props.olistWebhookPedidosUrl}
                  connected={props.olistConnected}
                  cnpjReady={props.olistWebhookCnpjReady}
                />

                {props.olistConnected && (
                  <div className="mb-4 space-y-4">
                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm">
                      {props.olistAccountName && (
                        <p className="text-[var(--foreground)]">
                          Conta: <strong>{props.olistAccountName}</strong>
                        </p>
                      )}
                      {props.olistTokenPrefix && (
                        <p className="mt-1 text-[var(--muted)]">
                          Token salvo: <span className="font-mono text-xs">{props.olistTokenPrefix}</span>
                        </p>
                      )}
                      {props.olistValidatedAt && (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Validado em {new Date(props.olistValidatedAt).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>

                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-[var(--foreground)]">Sincronização de pedidos</p>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                            O DropCore consulta pedidos atualizados na Olist/Tiny, cria o pedido no hub e alinha o estoque.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={props.onSincronizarPedidos}
                          disabled={props.olistSyncing || props.olistSaving || !props.olistTokenUsable}
                          className="rounded-xl bg-[var(--primary-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-blue-hover)] disabled:opacity-60"
                        >
                          {props.olistSyncing ? "Sincronizando..." : "Sincronizar agora"}
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <OlistSyncStatusBadge status={props.olistSyncStatus} hasLastSync={Boolean(props.olistSyncLastAt)} />
                        {props.olistSyncLastAt ? (
                          <span className="text-xs text-[var(--muted)]">
                            Última execução: {new Date(props.olistSyncLastAt).toLocaleString("pt-BR")}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">Ainda não houve sincronização automática.</span>
                        )}
                      </div>

                      {(props.olistSyncImported != null ||
                        props.olistSyncSkipped != null ||
                        props.olistSyncWarnings != null) && (
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          Último resultado:{" "}
                          {props.olistSyncImported != null ? `${props.olistSyncImported} importado(s)` : "—"}
                          {props.olistSyncSkipped != null ? ` · ${props.olistSyncSkipped} ignorado(s)` : ""}
                          {props.olistSyncWarnings != null && props.olistSyncWarnings > 0
                            ? ` · ${props.olistSyncWarnings} aviso(s)`
                            : ""}
                        </p>
                      )}

                      {props.olistSyncError ? (
                        <p className={cn("mt-2 text-xs", DANGER_PREMIUM_TEXT_BODY)}>{props.olistSyncError}</p>
                      ) : null}
                    </div>
                  </div>
                )}

                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Token API da Olist/Tiny
                </label>
                <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">
                  Cole o token gerado em Configurações → Token API. O DropCore valida com a Olist/Tiny antes de salvar.
                </p>
                <OlistTokenForm {...props} />
              </div>
            )}
        </section>
      </div>
    </div>
  );
}

function OlistWebhookPedidosPanel(props: {
  webhookUrl: string | null;
  connected: boolean;
  cnpjReady: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const url = props.webhookUrl?.trim() ?? "";

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
          <p className="font-medium text-[var(--foreground)]">Webhook de pedidos (Olist/Tiny)</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            URL única do DropCore: a Olist envia o CNPJ da conta no corpo do evento; o sistema associa ao seu token salvo. Plano com
            extensão de Webhooks na Olist/Tiny. Se você estiver em <code className="text-[11px]">localhost</code>, a URL abaixo usa o
            domínio público do DropCore — a Olist não consegue chamar o seu computador diretamente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copiar()}
          disabled={!url}
          className="shrink-0 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          {copied ? "Copiado" : "Copiar URL"}
        </button>
      </div>

      {url ? (
        <input
          readOnly
          value={url}
          className="mt-3 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-2 font-mono text-[11px] text-[var(--foreground)]"
          aria-label="URL do webhook de pedidos"
        />
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">URL indisponível neste ambiente.</p>
      )}

      {props.connected && !props.cnpjReady ? (
        <AmberPremiumCallout title="Webhook ainda não associa esta conta" className="mt-3 rounded-xl px-3 py-3 sm:px-4">
          <p className="text-pretty text-xs leading-relaxed">
            Rode o script <code className="font-mono text-[11px]">add-seller-olist-webhook.sql</code> no Supabase (coluna de CNPJ +
            log). Depois <strong className="text-[var(--foreground)]">salve o token de novo</strong> aqui para gravar o CNPJ da
            Olist/Tiny — sem isso o DropCore não sabe qual seller recebeu o evento.
          </p>
        </AmberPremiumCallout>
      ) : null}

      {props.connected && props.cnpjReady ? (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
          CNPJ da conta gravado: eventos de pedido desta Olist/Tiny podem ser roteados para o seu hub.
        </p>
      ) : null}

      {!props.connected ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Conecte salvando o token; em seguida confira se o aviso de CNPJ sumiu antes de cadastrar o webhook na Olist/Tiny.
        </p>
      ) : null}
    </div>
  );
}

function OlistSyncStatusBadge(props: { status: string | null; hasLastSync: boolean }) {
  const normalized = props.status?.trim().toLowerCase() ?? "";
  if (!props.hasLastSync) {
    return (
      <span className="rounded-full bg-[var(--muted)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">
        Aguardando primeira sync
      </span>
    );
  }
  if (normalized === "ok") {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        Sync ok
      </span>
    );
  }
  if (normalized === "parcial") {
    return (
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", AMBER_PREMIUM_TEXT_SOFT, "bg-[var(--muted)]/10")}>
        Sync parcial
      </span>
    );
  }
  if (normalized === "erro") {
    return (
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", DANGER_PREMIUM_TEXT_BODY, "bg-[var(--danger)]/10")}>
        Sync com erro
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[var(--muted)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">
      Sem status
    </span>
  );
}

function OlistTokenForm(props: IntegracoesPageProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <input
        type="password"
        value={props.olistTokenInput}
        onChange={(e) => props.setOlistTokenInput(e.target.value)}
        placeholder={props.olistConnected ? "Cole um novo token para substituir" : "Cole o token API da Olist/Tiny"}
        autoComplete="off"
        className="min-w-0 flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
      />
      <button
        type="button"
        onClick={props.onSalvarOlistToken}
        disabled={props.olistSaving || !props.olistTokenInput.trim()}
        className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {props.olistSaving ? "Salvando..." : "Salvar token"}
      </button>
      {props.olistConnected ? (
        <button
          type="button"
          onClick={props.onRemoverOlistToken}
          disabled={props.olistSaving}
          className="shrink-0 rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
        >
          Remover
        </button>
      ) : null}
    </div>
  );
}
