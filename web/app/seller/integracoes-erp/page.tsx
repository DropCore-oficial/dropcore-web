"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { AMBER_PREMIUM_TEXT_BODY, AMBER_PREMIUM_TEXT_SOFT } from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_BODY,
} from "@/lib/semanticPremium";
import { SellerOlistIntegracaoChecklist } from "@/components/seller/SellerOlistIntegracaoChecklist";
import { OlistModoOperacaoPainel } from "@/components/olist/OlistModoOperacaoPainel";
import {
  buildSellerPedidosSaudeLinhas,
  OlistIntegracaoSaudeCard,
} from "@/components/olist/OlistIntegracaoSaudeCard";
import { OLIST_CRON_PEDIDOS_MIN, OLIST_CRON_PRECOS_MIN, isOlistSyncStale, resolveSellerPedidosSaude } from "@/lib/olistModoOperacaoUi";
import { cn } from "@/lib/utils";
import { useVisibilityAwareInterval } from "@/lib/useVisibilityAwareInterval";

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
  const [olistSyncWarningsList, setOlistSyncWarningsList] = useState<string[]>([]);
  const [olistSyncErrorsList, setOlistSyncErrorsList] = useState<string[]>([]);
  const [catalogoProbeLastAt, setCatalogoProbeLastAt] = useState<string | null>(null);
  const [catalogoProbeTotal, setCatalogoProbeTotal] = useState<number | null>(null);
  const [catalogoProbeEncontrados, setCatalogoProbeEncontrados] = useState<number | null>(null);
  const [catalogoProbeAusentes, setCatalogoProbeAusentes] = useState<number | null>(null);
  const [catalogoProbeAmostra, setCatalogoProbeAmostra] = useState<string[]>([]);
  const [catalogoVerificando, setCatalogoVerificando] = useState(false);
  const [pedidosSyncNow, setPedidosSyncNow] = useState(false);
  const [precosSyncLastAt, setPrecosSyncLastAt] = useState<string | null>(null);
  const [precosSyncStatus, setPrecosSyncStatus] = useState<string | null>(null);
  const [precosSyncError, setPrecosSyncError] = useState<string | null>(null);
  const [precosSyncOk, setPrecosSyncOk] = useState<number | null>(null);
  const [precosSyncFalhas, setPrecosSyncFalhas] = useState<number | null>(null);
  const [precosSyncGruposOk, setPrecosSyncGruposOk] = useState<number | null>(null);
  const [precosSyncNow, setPrecosSyncNow] = useState(false);
  const [olistWebhookPedidosUrl, setOlistWebhookPedidosUrl] = useState<string | null>(null);
  const [olistWebhookCnpjReady, setOlistWebhookCnpjReady] = useState(false);
  const [olistWebhookLastAt, setOlistWebhookLastAt] = useState<string | null>(null);
  const [olistTokenInput, setOlistTokenInput] = useState("");
  const [olistSaving, setOlistSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ingestRegenerating, setIngestRegenerating] = useState(false);

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
    setOlistSyncWarningsList(
      sync && Array.isArray(sync.warnings_list)
        ? sync.warnings_list.filter((w): w is string => typeof w === "string")
        : []
    );
    setOlistSyncErrorsList(
      sync && Array.isArray(sync.errors_list)
        ? sync.errors_list.filter((e): e is string => typeof e === "string")
        : []
    );

    const probe =
      json.catalogo_probe && typeof json.catalogo_probe === "object"
        ? (json.catalogo_probe as Record<string, unknown>)
        : null;
    setCatalogoProbeLastAt(probe && typeof probe.last_at === "string" ? probe.last_at : null);
    setCatalogoProbeTotal(probe && typeof probe.total === "number" ? probe.total : null);
    setCatalogoProbeEncontrados(probe && typeof probe.encontrados === "number" ? probe.encontrados : null);
    setCatalogoProbeAusentes(probe && typeof probe.ausentes === "number" ? probe.ausentes : null);
    setCatalogoProbeAmostra(
      probe && Array.isArray(probe.amostra_ausentes)
        ? probe.amostra_ausentes.filter((s): s is string => typeof s === "string")
        : [],
    );

    const precos =
      json.precos_sync && typeof json.precos_sync === "object"
        ? (json.precos_sync as Record<string, unknown>)
        : null;
    setPrecosSyncLastAt(precos && typeof precos.last_at === "string" ? precos.last_at : null);
    setPrecosSyncStatus(precos && typeof precos.status === "string" ? precos.status : null);
    setPrecosSyncError(precos && typeof precos.error === "string" ? precos.error : null);
    setPrecosSyncOk(precos && typeof precos.ok === "number" ? precos.ok : null);
    setPrecosSyncFalhas(precos && typeof precos.falhas === "number" ? precos.falhas : null);
    setPrecosSyncGruposOk(precos && typeof precos.grupos_ok === "number" ? precos.grupos_ok : null);

    setOlistWebhookPedidosUrl(typeof json.webhook_pedidos_url === "string" ? json.webhook_pedidos_url : null);
    setOlistWebhookCnpjReady(Boolean(json.olist_webhook_cnpj_ready));
    setOlistWebhookLastAt(
      typeof json.webhook_last_received_at === "string" ? json.webhook_last_received_at : null
    );
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
    !olistConnected || !olistTokenUsable || loading
  );

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

  async function regenerarWebhookIngest() {
    setIngestRegenerating(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/olist/ingest-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "Erro ao gerar novo link do webhook.");
      }
      if (typeof json.webhook_pedidos_url === "string") {
        setOlistWebhookPedidosUrl(json.webhook_pedidos_url);
      }
      await loadOlist(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao gerar novo link do webhook.");
    } finally {
      setIngestRegenerating(false);
    }
  }

  async function sincronizarPrecosOlist() {
    setPrecosSyncNow(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/catalogo/sync-olist-custos", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao sincronizar preços na Olist.");
      await loadOlist(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao sincronizar preços.");
    } finally {
      setPrecosSyncNow(false);
    }
  }

  async function sincronizarPedidosOlist() {
    setPedidosSyncNow(true);
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
      if (!res.ok) throw new Error(json?.error ?? "Erro ao sincronizar pedidos.");
      await loadOlist(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao sincronizar pedidos.");
    } finally {
      setPedidosSyncNow(false);
    }
  }

  async function verificarCatalogoOlist() {
    setCatalogoVerificando(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) {
        router.replace("/seller/login");
        return;
      }
      const res = await fetch("/api/seller/olist/verificar-catalogo", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Erro ao verificar catálogo na Olist.");
      await loadOlist(session.access_token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao verificar catálogo.");
    } finally {
      setCatalogoVerificando(false);
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
      olistSyncWarningsList={olistSyncWarningsList}
      olistSyncErrorsList={olistSyncErrorsList}
      catalogoProbeLastAt={catalogoProbeLastAt}
      catalogoProbeTotal={catalogoProbeTotal}
      catalogoProbeEncontrados={catalogoProbeEncontrados}
      catalogoProbeAusentes={catalogoProbeAusentes}
      catalogoProbeAmostra={catalogoProbeAmostra}
      catalogoVerificando={catalogoVerificando}
      onVerificarCatalogoOlist={() => void verificarCatalogoOlist()}
      pedidosSyncNow={pedidosSyncNow}
      onSincronizarPedidosOlist={() => void sincronizarPedidosOlist()}
      precosSyncLastAt={precosSyncLastAt}
      precosSyncStatus={precosSyncStatus}
      precosSyncError={precosSyncError}
      precosSyncOk={precosSyncOk}
      precosSyncFalhas={precosSyncFalhas}
      precosSyncGruposOk={precosSyncGruposOk}
      precosSyncNow={precosSyncNow}
      onSincronizarPrecosOlist={() => void sincronizarPrecosOlist()}
      olistWebhookPedidosUrl={olistWebhookPedidosUrl}
      olistWebhookCnpjReady={olistWebhookCnpjReady}
      olistWebhookLastAt={olistWebhookLastAt}
      olistTokenInput={olistTokenInput}
      setOlistTokenInput={setOlistTokenInput}
      olistSaving={olistSaving}
      refreshing={refreshing}
      ingestRegenerating={ingestRegenerating}
      onSalvarOlistToken={() => void salvarOlistToken()}
      onRemoverOlistToken={() => void removerOlistToken()}
      onAtualizar={() => void atualizar()}
      onRegenerarWebhookIngest={() => void regenerarWebhookIngest()}
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
  olistSyncWarningsList: string[];
  olistSyncErrorsList: string[];
  catalogoProbeLastAt: string | null;
  catalogoProbeTotal: number | null;
  catalogoProbeEncontrados: number | null;
  catalogoProbeAusentes: number | null;
  catalogoProbeAmostra: string[];
  catalogoVerificando: boolean;
  onVerificarCatalogoOlist: () => void;
  pedidosSyncNow: boolean;
  onSincronizarPedidosOlist: () => void;
  precosSyncLastAt: string | null;
  precosSyncStatus: string | null;
  precosSyncError: string | null;
  precosSyncOk: number | null;
  precosSyncFalhas: number | null;
  precosSyncGruposOk: number | null;
  precosSyncNow: boolean;
  onSincronizarPrecosOlist: () => void;
  olistWebhookPedidosUrl: string | null;
  olistWebhookCnpjReady: boolean;
  olistWebhookLastAt: string | null;
  olistTokenInput: string;
  setOlistTokenInput: (value: string) => void;
  olistSaving: boolean;
  refreshing: boolean;
  ingestRegenerating: boolean;
  onSalvarOlistToken: () => void;
  onRemoverOlistToken: () => void;
  onAtualizar: () => void;
  onRegenerarWebhookIngest: () => void;
};

function IntegracoesErpPageView(props: IntegracoesPageProps) {
  const pedidosSaude =
    props.olistConnected && props.olistTokenUsable
      ? resolveSellerPedidosSaude({
          webhookLastAt: props.olistWebhookLastAt,
          syncLastAt: props.olistSyncLastAt,
        })
      : null;

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
            . Você gera o <strong className="text-[var(--foreground)]">token API</strong> na Olist/Tiny e cola aqui. Antes dos pedidos,
            exporte o catálogo em{" "}
            <Link href="/seller/produtos" className="font-semibold text-[var(--foreground)] underline underline-offset-2">
              Produtos → Exportar para Olist (por produto)
            </Link>{" "}
            e importe a planilha no ERP.
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
                    <p className="mt-3 text-pretty text-xs leading-relaxed text-[var(--muted)]">
                      <strong className="text-[var(--foreground)]">O que fazer:</strong> no projeto{" "}
                      <code className="font-mono text-[10px]">dropcore-web</code> (Production), confira{" "}
                      <code className="font-mono text-[10px]">SELLER_ERP_CREDENTIALS_KEY</code>. Se a chave mudou ou estava vazia em
                      algum deploy, o token antigo não abre mais. Gere um token novo na Olist/Tiny se precisar,{" "}
                      <strong className="text-[var(--foreground)]">cole aqui embaixo e salve</strong> para recriptografar com a chave
                      atual; em seguida use <strong className="text-[var(--foreground)]">Atualizar</strong>.
                    </p>
                  </AmberPremiumCallout>
                ) : null}

                {pedidosSaude ? (
                  <OlistIntegracaoSaudeCard
                    nivel={pedidosSaude.nivel}
                    titulo={pedidosSaude.titulo}
                    detalhe={pedidosSaude.detalhe}
                    linhas={buildSellerPedidosSaudeLinhas({
                      webhookLastAt: props.olistWebhookLastAt,
                      syncLastAt: props.olistSyncLastAt,
                      precosLastAt: props.precosSyncLastAt,
                    })}
                  />
                ) : null}

                <OlistModoOperacaoPainel
                  papel="seller"
                  connected={props.olistConnected}
                  tokenUsable={props.olistTokenUsable}
                  webhookLastAt={props.olistWebhookLastAt}
                  syncLastAt={props.olistSyncLastAt}
                  syncIntervalMinutes={OLIST_CRON_PEDIDOS_MIN}
                  syncLabel="Sync de pedidos"
                />

                <SellerOlistIntegracaoChecklist
                  connected={props.olistConnected}
                  tokenUsable={props.olistTokenUsable}
                  cnpjReady={props.olistWebhookCnpjReady}
                  webhookUrl={props.olistWebhookPedidosUrl}
                  webhookLastReceivedAt={props.olistWebhookLastAt}
                  syncLastAt={props.olistSyncLastAt}
                />

                <OlistWebhookPedidosPanel
                  webhookUrl={props.olistWebhookPedidosUrl}
                  connected={props.olistConnected}
                  cnpjReady={props.olistWebhookCnpjReady}
                  tokenUsable={props.olistTokenUsable}
                  ingestRegenerating={props.ingestRegenerating}
                  onRegenerarIngest={props.onRegenerarWebhookIngest}
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
                      <div>
                        <p className="font-medium text-[var(--foreground)]">Sincronização automática de pedidos</p>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                          O DropCore consulta a Olist/Tiny <strong className="text-[var(--foreground)]">a cada ~1 minuto</strong>.
                          Com webhook (planos Impulsione+), pedidos entram na hora; sem webhook, este cron é a via principal.
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <OlistSyncStatusBadge status={props.olistSyncStatus} hasLastSync={Boolean(props.olistSyncLastAt)} />
                        {props.olistSyncLastAt ? (
                          <span className="text-xs text-[var(--muted)]">
                            Última execução: {new Date(props.olistSyncLastAt).toLocaleString("pt-BR")}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">
                            Aguardando primeira execução automática (em até 1 minuto após salvar o token).
                          </span>
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
                      {props.olistSyncErrorsList.length > 0 ? (
                        <ul className={cn("mt-2 space-y-1 text-xs list-disc pl-4", DANGER_PREMIUM_TEXT_BODY)}>
                          {props.olistSyncErrorsList.map((msg) => (
                            <li key={msg}>{msg}</li>
                          ))}
                        </ul>
                      ) : null}
                      {props.olistSyncWarningsList.length > 0 ? (
                        <ul className={cn("mt-2 space-y-1 text-xs list-disc pl-4", AMBER_PREMIUM_TEXT_BODY)}>
                          {props.olistSyncWarningsList.map((msg) => (
                            <li key={msg}>{msg}</li>
                          ))}
                        </ul>
                      ) : null}
                      {props.olistConnected && props.olistTokenUsable ? (
                        <button
                          type="button"
                          disabled={props.pedidosSyncNow || props.olistSaving}
                          onClick={props.onSincronizarPedidosOlist}
                          className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)] disabled:opacity-50"
                        >
                          {props.pedidosSyncNow ? "Buscando pedidos na Olist…" : "Sincronizar pedidos agora"}
                        </button>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm">
                      <p className="font-medium text-[var(--foreground)]">Preços e custos na Olist</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                        O DropCore envia preço de venda e custo para a Olist{" "}
                        <strong className="text-[var(--foreground)]">a cada ~10 minutos</strong> (cron). Quando o custo muda no
                        catálogo, também dispara sync — pode levar alguns minutos sem webhook.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <OlistSyncStatusBadge
                          status={props.precosSyncStatus}
                          hasLastSync={Boolean(props.precosSyncLastAt)}
                        />
                        {props.precosSyncLastAt ? (
                          <span className="text-xs text-[var(--muted)]">
                            Última execução: {new Date(props.precosSyncLastAt).toLocaleString("pt-BR")}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">
                            Aguardando primeira execução (até ~10 min após conectar o token).
                          </span>
                        )}
                      </div>
                      {isOlistSyncStale(props.precosSyncLastAt, OLIST_CRON_PRECOS_MIN) ? (
                        <p className={cn("mt-2 text-xs", DANGER_PREMIUM_TEXT_BODY)}>
                          Sync de preços não roda há mais de ~30 min — confira o cron no Supabase ou use o botão abaixo.
                        </p>
                      ) : null}
                      {props.precosSyncOk != null || props.precosSyncFalhas != null ? (
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          Último resultado:{" "}
                          <strong className="text-[var(--foreground)]">{props.precosSyncOk ?? 0}</strong> SKU(s) ok
                          {props.precosSyncGruposOk != null ? ` · ${props.precosSyncGruposOk} grupo(s) ok` : ""}
                          {props.precosSyncFalhas != null && props.precosSyncFalhas > 0
                            ? ` · ${props.precosSyncFalhas} falha(s)`
                            : ""}
                        </p>
                      ) : null}
                      {props.precosSyncError ? (
                        <p className={cn("mt-2 text-xs", DANGER_PREMIUM_TEXT_BODY)}>{props.precosSyncError}</p>
                      ) : null}
                      {props.olistConnected && props.olistTokenUsable ? (
                        <button
                          type="button"
                          disabled={props.precosSyncNow || props.olistSaving}
                          onClick={props.onSincronizarPrecosOlist}
                          className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)] disabled:opacity-50"
                        >
                          {props.precosSyncNow ? "Enviando preços para Olist…" : "Sincronizar preços agora"}
                        </button>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm">
                      <p className="font-medium text-[var(--foreground)]">Catálogo na Olist (SKUs)</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                        Confere se os SKUs ativos do DropCore existem na Olist deste seller — o mesmo tipo de checagem
                        do armazém. Use depois de{" "}
                        <strong className="text-[var(--foreground)]">Exportar para Olist</strong> e importar a planilha.
                      </p>
                      {props.catalogoProbeLastAt ? (
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          Última verificação: {new Date(props.catalogoProbeLastAt).toLocaleString("pt-BR")}
                        </p>
                      ) : null}
                      {props.catalogoProbeTotal != null ? (
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          Resultado:{" "}
                          <strong className="text-[var(--foreground)]">{props.catalogoProbeEncontrados ?? 0}</strong>{" "}
                          encontrado(s)
                          {props.catalogoProbeAusentes != null && props.catalogoProbeAusentes > 0 ? (
                            <>
                              {" "}
                              ·{" "}
                              <strong className="text-[var(--foreground)]">{props.catalogoProbeAusentes}</strong> sem
                              par na Olist
                            </>
                          ) : props.catalogoProbeAusentes === 0 ? (
                            <> · todos com par na Olist</>
                          ) : null}
                        </p>
                      ) : null}
                      {props.catalogoProbeAusentes != null && props.catalogoProbeAusentes > 0 ? (
                        <p className={cn("mt-2 text-xs leading-relaxed", AMBER_PREMIUM_TEXT_SOFT)}>
                          {props.catalogoProbeEncontrados === 0 ? (
                            <>
                              A API não listou produtos nesta conta Olist — confira se importou o CSV na mesma conta do
                              token.
                            </>
                          ) : (
                            <>
                              Exemplos sem par:{" "}
                              <span className="font-mono text-[11px]">
                                {props.catalogoProbeAmostra.join(", ") || "—"}
                              </span>
                              . Reexporte o grupo e importe na Olist.
                            </>
                          )}
                        </p>
                      ) : null}
                      {props.catalogoProbeAusentes === 0 && props.catalogoProbeTotal != null && props.catalogoProbeTotal > 0 ? (
                        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                          Catálogo alinhado — sync de estoque e preços pode usar estes SKUs.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        disabled={props.catalogoVerificando || props.olistSaving || !props.olistTokenUsable}
                        onClick={props.onVerificarCatalogoOlist}
                        className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)] disabled:opacity-50"
                      >
                        {props.catalogoVerificando ? "Verificando na Olist…" : "Verificar SKUs na Olist"}
                      </button>
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
          <p className="font-medium text-[var(--foreground)]">Webhook de pedidos (Olist/Tiny)</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            <strong className="text-[var(--foreground)]">Link próprio por seller:</strong> o parâmetro <code className="font-mono text-[10px]">?w=</code>{" "}
            é um token só seu (gravado no DropCore). A Olist continua mandando o <strong className="text-[var(--foreground)]">CNPJ</strong>{" "}
            da conta no JSON; o servidor exige que bata com o CNPJ salvo aqui — assim, mesmo que alguém veja a URL, não consegue
            simular outra conta. Legado: ainda aceitamos <code className="font-mono text-[10px]">?secret=</code> global da Vercel se
            você ainda não migrou a URL na Olist.
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
            rows={4}
            spellCheck={false}
            className="mt-3 min-h-[5rem] w-full resize-y rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-2 font-mono text-[11px] leading-snug text-[var(--foreground)] break-all whitespace-pre-wrap"
            aria-label="URL do webhook de pedidos"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
            O campo pode quebrar a URL em várias linhas; use <strong className="text-[var(--foreground)]">Copiar URL</strong> para pegar
            o texto inteiro (nada fica cortado na área de transferência).
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Preferimos <code className="font-mono text-[10px]">?w=</code> (token por seller). O <code className="font-mono text-[10px]">OLIST_WEBHOOK_SECRET</code>{" "}
            na Vercel vira opcional (só legado). Se você trocou o segredo global, faça <strong className="text-[var(--foreground)]">Redeploy</strong>{" "}
            do <code className="font-mono text-[10px]">dropcore-web</code> e use a URL que esta página mostrar após{" "}
            <strong className="text-[var(--foreground)]">Atualizar</strong> — idealmente já com <code className="font-mono text-[10px]">?w=</code> após rodar o SQL{" "}
            <code className="font-mono text-[10px]">add-seller-olist-ingest-token.sql</code> no Supabase.
          </p>
        </>
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
