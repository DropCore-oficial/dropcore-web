"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { IconArrowRight, IconPlus } from "@/components/seller/Icons";

type Mensagem = { id: string; role: "user" | "assistant"; content: string; criado_em: string };
type Sessao = { id: string; titulo: string | null; criado_em: string; atualizado_em: string };
type UsoTokensHoje = { tokens: number; cota: number };
const TOKENS_FMT = new Intl.NumberFormat("pt-BR");

const PERGUNTAS_RAPIDAS = [
  { label: "Anúncio com pergunta parada?", pergunta: "Tem algum anúncio com pergunta de cliente sem resposta?" },
  { label: "Margem furando o mínimo?", pergunta: "Algum anúncio está com margem abaixo do mínimo configurado?" },
  { label: "Resumo geral de hoje", pergunta: "Me dá um resumo geral: anúncios, reputação e margem." },
];

function saudacaoPorHorario(): string {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

export default function TiagoAvulsoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liberado, setLiberado] = useState(true);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [sessaoAtivaId, setSessaoAtivaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [usoTokensHoje, setUsoTokensHoje] = useState<UsoTokensHoje | null>(null);
  const [bloqueadoHoje, setBloqueadoHoje] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [streamingTexto, setStreamingTexto] = useState<string | null>(null);
  const [statusFerramenta, setStatusFerramenta] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement | null>(null);

  const carregar = useCallback(
    async (sessionId?: string | null) => {
      setLoading(true);
      setError(null);
      const token = await getAccessToken();
      if (!token) {
        router.replace("/gestores-ia/login");
        return;
      }
      const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
      const res = await fetch(`/api/gestores-ia-avulso/tiago/historico${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Erro ao carregar a conversa.");
        setLoading(false);
        return;
      }
      setLiberado(json.liberado !== false);
      setSessoes(json.sessoes ?? []);
      setSessaoAtivaId(json.sessao_ativa_id ?? null);
      setMensagens(json.mensagens ?? []);
      setUsoTokensHoje(json.uso_tokens_hoje ?? null);
      setBloqueadoHoje(json.bloqueado_hoje === true);
      setLoading(false);
    },
    [router]
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, enviando]);

  async function novaConversa() {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch("/api/gestores-ia-avulso/tiago/nova-sessao", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.session_id) {
      await carregar(json.session_id);
    }
  }

  async function enviar(mensagemOverride?: string) {
    const mensagem = (mensagemOverride ?? texto).trim();
    if (!mensagem || enviando) return;

    let sessionId = sessaoAtivaId;
    if (!sessionId) {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/tiago/nova-sessao", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.session_id) {
        setErroEnvio(json?.error ?? "Erro ao iniciar conversa.");
        return;
      }
      sessionId = json.session_id;
      setSessaoAtivaId(sessionId);
    }

    setErroEnvio(null);
    setEnviando(true);
    setTexto("");
    setMensagens((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: mensagem, criado_em: new Date().toISOString() },
    ]);
    setStreamingTexto(null);
    setStatusFerramenta(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setErroEnvio("Sessão expirada, faça login de novo.");
        return;
      }
      const res = await fetch("/api/gestores-ia-avulso/tiago/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, mensagem }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErroEnvio(json?.error ?? "Erro ao falar com o Tiago Silva.");
        if (json?.bloqueado_hoje === true) setBloqueadoHoje(true);
        return;
      }
      if (!res.body) {
        setErroEnvio("Erro ao falar com o Tiago Silva.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let respostaFinal: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let quebraIdx: number;
        while ((quebraIdx = buffer.indexOf("\n")) >= 0) {
          const linha = buffer.slice(0, quebraIdx).trim();
          buffer = buffer.slice(quebraIdx + 1);
          if (!linha) continue;
          const evento = JSON.parse(linha) as
            | { type: "delta"; text: string }
            | { type: "tool_status"; label: string }
            | { type: "error"; error: string }
            | { type: "done"; resposta: string };

          if (evento.type === "delta") {
            setStatusFerramenta(null);
            setStreamingTexto((prev) => (prev ?? "") + evento.text);
          } else if (evento.type === "tool_status") {
            setStatusFerramenta(evento.label);
          } else if (evento.type === "error") {
            setErroEnvio(evento.error);
          } else if (evento.type === "done") {
            respostaFinal = evento.resposta;
          }
        }
      }

      if (respostaFinal) {
        setMensagens((prev) => [
          ...prev,
          { id: `local-resp-${Date.now()}`, role: "assistant", content: respostaFinal as string, criado_em: new Date().toISOString() },
        ]);
      }
      await carregar(sessionId);
    } finally {
      setStreamingTexto(null);
      setStatusFerramenta(null);
      setEnviando(false);
    }
  }

  const chatBloqueado = bloqueadoHoje;

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <Link href="/seller/gestores-ia-avulso" className="text-xs font-medium text-[var(--muted)] hover:underline">
            ← Gestor de IA
          </Link>
          <div className="mt-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                Tiago Silva — Gestor Mestre
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Converse com o Tiago Silva — ele consulta o Andrey, a Amanda e o Ulisses pra responder com dado real,
              nunca inventa número e nunca executa ação sozinho.
            </p>
          </div>
        </header>

        {loading ? (
          <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-40 w-full" />
          </section>
        ) : error ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>{error}</div>
        ) : !liberado ? (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8">
            <p className="text-sm text-[var(--muted)]">Recurso não disponível pro seu pacote.</p>
          </section>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {sessoes.length > 1 && (
                  <select
                    value={sessaoAtivaId ?? ""}
                    onChange={(e) => void carregar(e.target.value)}
                    className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--foreground)]"
                  >
                    {sessoes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.titulo ?? new Date(s.criado_em).toLocaleDateString("pt-BR")}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => void novaConversa()}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  Nova conversa
                </button>
              </div>
            </div>

            {usoTokensHoje
              ? (() => {
                  const pct = Math.min(100, Math.round((usoTokensHoje.tokens / usoTokensHoje.cota) * 100));
                  return (
                    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-[var(--foreground)]">Uso dos Gestores de IA hoje</span>
                        <span className={cn("font-semibold", bloqueadoHoje ? DANGER_PREMIUM_TEXT_PRIMARY : "text-[var(--muted)]")}>
                          {pct}% usado · {TOKENS_FMT.format(usoTokensHoje.tokens)} de {TOKENS_FMT.format(usoTokensHoje.cota)}{" "}
                          tokens
                        </span>
                      </div>
                      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutral-200/80 ring-1 ring-inset ring-neutral-300/30 dark:bg-neutral-800 dark:ring-neutral-700/50">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700 ease-out",
                            bloqueadoHoje
                              ? "bg-gradient-to-r from-red-500 to-red-600"
                              : pct >= 80
                                ? "bg-gradient-to-r from-amber-500 to-amber-600"
                                : "bg-gradient-to-r from-emerald-500 to-emerald-600"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-[var(--muted)]">Redefine às 00:00</p>
                    </div>
                  );
                })()
              : null}

            <section className="flex min-h-[420px] flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
              <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
                {mensagens.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-lg font-semibold text-[var(--foreground)]">{saudacaoPorHorario()}</p>
                    <p className="text-sm text-[var(--muted)]">
                      Pergunta pro Tiago Silva o que a equipe (Andrey, Amanda, Ulisses) já encontrou, ou escolhe uma
                      pergunta pronta:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {PERGUNTAS_RAPIDAS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          disabled={enviando || chatBloqueado}
                          onClick={() => void enviar(p.pergunta)}
                          className="rounded-full border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-emerald-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  mensagens.map((m) => (
                    <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[75%]",
                          m.role === "user"
                            ? "bg-emerald-600 text-white"
                            : "border border-[var(--card-border)] bg-[var(--surface-subtle)] text-[var(--foreground)]"
                        )}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
                {enviando && streamingTexto !== null && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-sm leading-relaxed text-[var(--foreground)] sm:max-w-[75%]">
                      {streamingTexto}
                      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[var(--muted)]/60 align-text-bottom" aria-hidden />
                    </div>
                  </div>
                )}
                {enviando && streamingTexto === null && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-sm text-[var(--muted)]">
                      {statusFerramenta ?? "Tiago Silva está digitando…"}
                    </div>
                  </div>
                )}
                <div ref={fimRef} />
              </div>

              <div className="border-t border-[var(--card-border)] p-3 sm:p-4">
                {erroEnvio && (
                  <p className={cn("mb-2 rounded-xl px-3 py-2 text-xs", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
                    {erroEnvio}
                  </p>
                )}
                {chatBloqueado && (
                  <div className={cn("mb-2 rounded-xl px-3 py-2 text-xs", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
                    Cota diária dos Gestores de IA esgotada — libera de novo à meia-noite.
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviar();
                      }
                    }}
                    disabled={enviando || chatBloqueado}
                    rows={1}
                    maxLength={4000}
                    placeholder="Escreva pro Tiago Silva…"
                    className="max-h-32 flex-1 resize-none rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-emerald-500 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => void enviar()}
                    disabled={enviando || !texto.trim() || chatBloqueado}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Enviar"
                  >
                    <IconArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
