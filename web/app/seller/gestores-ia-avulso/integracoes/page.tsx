"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { HelpBubble } from "@/components/HelpBubble";

type Access = "loading" | "liberado" | "sem_pacote" | "denied";

type MlStatus = { connected: boolean; ml_user_id: string | null; access_token_expires_at: string | null };

type ByokStatus = { configurado: boolean };

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
  const [mlHelpOpen, setMlHelpOpen] = useState(false);

  const [byokStatus, setByokStatus] = useState<ByokStatus | null>(null);
  const [byokLoading, setByokLoading] = useState(false);
  const [byokErro, setByokErro] = useState<string | null>(null);
  const [byokInput, setByokInput] = useState("");

  const [geminiStatus, setGeminiStatus] = useState<ByokStatus | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiErro, setGeminiErro] = useState<string | null>(null);
  const [geminiInput, setGeminiInput] = useState("");
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; mensagem: string; onConfirmar: () => void } | null>(
    null
  );

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
      setMlStatus({
        connected: Boolean(j.connected),
        ml_user_id: j.ml_user_id ?? null,
        access_token_expires_at: j.access_token_expires_at ?? null,
      });
    } catch (e: unknown) {
      setMlErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setMlStatusLoading(false);
    }
  }, []);

  function confirmarDesconectarMl() {
    setConfirmacao({
      titulo: "Desconectar Mercado Livre?",
      mensagem: "Os gestores param de funcionar com dado real até você reconectar.",
      onConfirmar: () => void desconectarMl(),
    });
  }

  async function desconectarMl() {
    setConfirmacao(null);
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
      setMlStatus({ connected: false, ml_user_id: null, access_token_expires_at: null });
    } catch (e: unknown) {
      setMlErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setMlStatusLoading(false);
    }
  }

  const refreshByokStatus = useCallback(async () => {
    setByokLoading(true);
    setByokErro(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/byok", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao conferir chave BYOK.");
      setByokStatus({ configurado: Boolean(j.configurado) });
    } catch (e: unknown) {
      setByokErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setByokLoading(false);
    }
  }, []);

  async function salvarByok() {
    if (!byokInput.trim()) return;
    setByokLoading(true);
    setByokErro(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/byok", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: byokInput.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar a chave.");
      setByokInput("");
      setByokStatus({ configurado: true });
    } catch (e: unknown) {
      setByokErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setByokLoading(false);
    }
  }

  function confirmarRemoverByok() {
    setConfirmacao({
      titulo: "Remover chave da Anthropic?",
      mensagem: "Os gestores voltam a usar a chave da casa, com teto diário de R$4.",
      onConfirmar: () => void removerByok(),
    });
  }

  async function removerByok() {
    setConfirmacao(null);
    setByokLoading(true);
    setByokErro(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/byok", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao remover a chave.");
      setByokStatus({ configurado: false });
    } catch (e: unknown) {
      setByokErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setByokLoading(false);
    }
  }

  const refreshGeminiStatus = useCallback(async () => {
    setGeminiLoading(true);
    setGeminiErro(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/byok-gemini", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao conferir chave do Gemini.");
      setGeminiStatus({ configurado: Boolean(j.configurado) });
    } catch (e: unknown) {
      setGeminiErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setGeminiLoading(false);
    }
  }, []);

  async function salvarGemini() {
    if (!geminiInput.trim()) return;
    setGeminiLoading(true);
    setGeminiErro(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/byok-gemini", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: geminiInput.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao salvar a chave.");
      setGeminiInput("");
      setGeminiStatus({ configurado: true });
    } catch (e: unknown) {
      setGeminiErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setGeminiLoading(false);
    }
  }

  function confirmarRemoverGemini() {
    setConfirmacao({
      titulo: "Remover chave do Gemini?",
      mensagem: "A geração de imagem do Design para de funcionar até você cadastrar outra chave.",
      onConfirmar: () => void removerGemini(),
    });
  }

  async function removerGemini() {
    setConfirmacao(null);
    setGeminiLoading(true);
    setGeminiErro(null);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/byok-gemini", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Erro ao remover a chave.");
      setGeminiStatus({ configurado: false });
    } catch (e: unknown) {
      setGeminiErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setGeminiLoading(false);
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
    if (access === "liberado") {
      void refreshMlStatus();
      void refreshByokStatus();
      void refreshGeminiStatus();
    }
  }, [access, refreshMlStatus, refreshByokStatus, refreshGeminiStatus]);

  if (access === "denied") {
    return (
      <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
        <div className="dropcore-shell-6xl space-y-3 py-10 text-center text-sm text-[var(--muted)]">
          <p>Não foi possível validar seu acesso.</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
          >
            Tentar de novo
          </button>
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
              Conecte suas contas pra liberar e rodar os Gestores de IA com dado real.
            </p>
          </div>
        </header>

        {access === "loading" ? (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm">
            <Skeleton className="mx-auto h-4 w-3/4 max-w-sm" />
          </div>
        ) : (
        <div className="flex flex-col flex-wrap gap-5 sm:flex-row sm:items-stretch">
          <div className="flex w-full flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:w-80 sm:shrink-0">
            {mlStatusLoading && !mlStatus ? (
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
                        open={mlHelpOpen}
                        onOpen={() => setMlHelpOpen(true)}
                        onClose={() => setMlHelpOpen(false)}
                      >
                        <p>
                          Conecta a conta do Mercado Livre pra alimentar os gestores com dado real do seu anúncio.
                          É só leitura — o DropCore nunca publica nem altera nada sozinho na sua conta.
                        </p>
                      </HelpBubble>
                    </div>
                  </div>
                  {mlStatus?.connected ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                      Conectado
                    </span>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-[var(--foreground)]">
                  {["Diagnóstico de anúncios", "Reputação e atendimento", "Margem em tempo real"].map((item) => (
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
                  {mlStatus?.connected ? (
                    <>
                      <p className="text-xs text-[var(--muted)]">Conta #{mlStatus.ml_user_id}</p>
                      {mlStatus.access_token_expires_at ? (
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          Acesso válido até {new Date(mlStatus.access_token_expires_at).toLocaleString("pt-BR")} —
                          renova sozinho.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={confirmarDesconectarMl}
                        disabled={mlStatusLoading}
                        className="mt-3 w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-50"
                      >
                        Desconectar
                      </button>
                    </>
                  ) : (
                    <a
                      href="/api/gestores-ia-avulso/mercadolivre/connect"
                      className="flex w-full items-center justify-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                      Conectar
                    </a>
                  )}
                </div>
              </>
            )}
            {mlErro && <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "mt-3 text-center text-xs")}>{mlErro}</p>}
          </div>

          <div className="flex w-full flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:w-80 sm:shrink-0">
            {byokLoading && !byokStatus ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/anthropic.png" alt="Anthropic" className="h-8 w-8 rounded-lg" />
                    <p className="font-semibold text-[var(--foreground)]">Anthropic</p>
                  </div>
                  {byokStatus?.configurado ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                      Chave própria
                    </span>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-[var(--foreground)]">
                  {["Gasto direto na sua conta Anthropic", "Resposta mais rápida, sem concorrer com outros assinantes"].map(
                    (item) => (
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
                    )
                  )}
                </ul>

                <div className="mt-auto pt-4">
                  {byokStatus?.configurado ? (
                    <button
                      type="button"
                      onClick={confirmarRemoverByok}
                      disabled={byokLoading}
                      className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-50"
                    >
                      Remover
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400"
                      >
                        Não tem chave ainda? Criar na Anthropic ↗
                      </a>
                      <input
                        type="password"
                        value={byokInput}
                        onChange={(e) => setByokInput(e.target.value)}
                        placeholder="sk-ant-..."
                        className="h-8 w-full rounded-md border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                      />
                      <button
                        type="button"
                        onClick={salvarByok}
                        disabled={byokLoading || !byokInput.trim()}
                        className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {byokLoading ? "Validando…" : "Salvar"}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
            {byokErro && <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "mt-3 text-center text-xs")}>{byokErro}</p>}
          </div>

          <div className="flex w-full flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:w-80 sm:shrink-0">
            {geminiLoading && !geminiStatus ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/gemini.webp" alt="Google Gemini" className="h-8 w-8 rounded-lg" />
                    <p className="font-semibold text-[var(--foreground)]">Google Gemini</p>
                  </div>
                  {geminiStatus?.configurado ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                      Chave própria
                    </span>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-[var(--foreground)]">
                  {["O Design gera foto nova do seu produto", "O gasto da geração sai direto da sua conta Google"].map(
                    (item) => (
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
                    )
                  )}
                </ul>

                <div className="mt-auto pt-4">
                  {geminiStatus?.configurado ? (
                    <button
                      type="button"
                      onClick={confirmarRemoverGemini}
                      disabled={geminiLoading}
                      className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-50"
                    >
                      Remover
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-emerald-600 underline hover:text-emerald-700 dark:text-emerald-400"
                      >
                        Não tem chave ainda? Criar no Google AI Studio ↗
                      </a>
                      <input
                        type="password"
                        value={geminiInput}
                        onChange={(e) => setGeminiInput(e.target.value)}
                        placeholder="AIza..."
                        className="h-8 w-full rounded-md border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
                      />
                      <button
                        type="button"
                        onClick={salvarGemini}
                        disabled={geminiLoading || !geminiInput.trim()}
                        className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {geminiLoading ? "Validando…" : "Salvar"}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
            {geminiErro && <p className={cn(DANGER_PREMIUM_TEXT_PRIMARY, "mt-3 text-center text-xs")}>{geminiErro}</p>}
          </div>
        </div>
        )}
      </div>
      <SellerNav active="integracoes" calcOnly produto="gestores_ia_avulso" />
      {confirmacao ? (
        <ModalOverlay onBackdropClick={() => setConfirmacao(null)}>
          <div className={cn(MODAL_PANEL_BODY_CLASS, "p-5")}>
            <p className="font-semibold text-[var(--foreground)]">{confirmacao.titulo}</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{confirmacao.mensagem}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmacao(null)}
                className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmacao.onConfirmar}
                className="rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:ring-1 dark:ring-inset dark:ring-white/20"
              >
                Confirmar
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}
    </div>
  );
}
