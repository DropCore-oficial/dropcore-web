"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import { Skeleton } from "@/components/ui/Skeleton";
import { IconArrowRight, IconPlus, IconCheck, IconClock, IconX } from "@/components/seller/Icons";
import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS } from "@/lib/modalOverlay";

type Mensagem = { id: string; role: "user" | "assistant"; content: string; criado_em: string };
type Sessao = { id: string; titulo: string | null; criado_em: string; atualizado_em: string };
/** Gate real de bloqueio (mês, em R$) — segue existindo no backend, só não aparece cru na
 * tela (ver uso_tokens_hoje pro que é mostrado). */
type Orcamento = { usado: number; teto: number };
type UsoTokensHoje = { tokens: number; cota: number };
const TOKENS_FMT = new Intl.NumberFormat("pt-BR");
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const PACOTES_CREDITO = [10, 20, 25, 50];

const MIN_CREDITO_CUSTOM = 5;
const MAX_CREDITO_CUSTOM = 200;

const PERGUNTAS_RAPIDAS = [
  { label: "Risco de ruptura?", pergunta: "Tem algum SKU em risco de ruptura de estoque?" },
  { label: "Anúncio com pergunta parada?", pergunta: "Tem algum anúncio com pergunta de cliente sem resposta?" },
  { label: "Promoção furando margem?", pergunta: "Alguma promoção ou desconto ativo está furando a margem mínima?" },
  { label: "Resumo geral de hoje", pergunta: "Me dá um resumo geral: estoque, anúncios, reputação e promoções." },
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

export function SellerGestorTiagoChatPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liberado, setLiberado] = useState(true);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [sessaoAtivaId, setSessaoAtivaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [nomeResponsavel, setNomeResponsavel] = useState<string | null>(null);
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [usoTokensHoje, setUsoTokensHoje] = useState<UsoTokensHoje | null>(null);
  const [bloqueadoHoje, setBloqueadoHoje] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement | null>(null);

  const [modalCredito, setModalCredito] = useState(false);
  const [creditoSelecionado, setCreditoSelecionado] = useState<number | "outro" | null>(null);
  const [creditoValorCustom, setCreditoValorCustom] = useState("");
  const [creditoLoading, setCreditoLoading] = useState(false);
  const [creditoErro, setCreditoErro] = useState<string | null>(null);
  const [creditoQr, setCreditoQr] = useState<string | null>(null);
  const [creditoCopia, setCreditoCopia] = useState<string | null>(null);
  const [creditoCopiado, setCreditoCopiado] = useState(false);
  const [creditoExpiraEm, setCreditoExpiraEm] = useState<string | null>(null);
  const [creditoRestSec, setCreditoRestSec] = useState<number | null>(null);

  async function carregar(sessionId?: string | null) {
    setLoading(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setError("Sessão expirada, faça login de novo.");
      setLoading(false);
      return;
    }
    const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
    const res = await fetch(`/api/seller/gestores-ia/tiago/historico${qs}`, {
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
    setOrcamento(json.orcamento ?? null);
    setUsoTokensHoje(json.uso_tokens_hoje ?? null);
    setBloqueadoHoje(json.bloqueado_hoje === true);
    setNomeResponsavel(json.nome_responsavel ?? null);
    setLoading(false);
  }

  useEffect(() => {
    void carregar();
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, enviando]);

  useEffect(() => {
    if (!creditoExpiraEm || !creditoQr) return;
    const tick = () => {
      const rest = Math.max(0, Math.floor((new Date(creditoExpiraEm).getTime() - Date.now()) / 1000));
      setCreditoRestSec(rest);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [creditoExpiraEm, creditoQr]);

  useEffect(() => {
    if (!creditoQr) return;
    const poll = async () => {
      const token = await getAccessToken();
      if (!token) return;
      const syncRes = await fetch("/api/seller/deposito-pix/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const syncJson = await syncRes.json().catch(() => ({}));
      if (syncJson.ok && syncJson.aprovados > 0) {
        await carregar(sessaoAtivaId);
        setModalCredito(false);
        setCreditoQr(null);
        setCreditoCopia(null);
        setCreditoExpiraEm(null);
        setCreditoErro(null);
      }
    };
    const id = setInterval(poll, 10000);
    void poll();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditoQr]);

  function fecharModalCredito() {
    setModalCredito(false);
    setCreditoSelecionado(null);
    setCreditoValorCustom("");
    setCreditoErro(null);
    setCreditoLoading(false);
    setCreditoQr(null);
    setCreditoCopia(null);
    setCreditoCopiado(false);
    setCreditoExpiraEm(null);
    setCreditoRestSec(null);
  }

  async function gerarPixCredito(valor: number) {
    if (!Number.isFinite(valor) || valor < MIN_CREDITO_CUSTOM || valor > MAX_CREDITO_CUSTOM) {
      setCreditoErro(`Valor deve ser entre ${BRL.format(MIN_CREDITO_CUSTOM)} e ${BRL.format(MAX_CREDITO_CUSTOM)}.`);
      return;
    }
    setCreditoLoading(true);
    setCreditoErro(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setCreditoErro("Sessão expirada, faça login de novo.");
        return;
      }
      const res = await fetch("/api/seller/gestores-ia/tiago/credito-extra-pix", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ valor }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setCreditoErro(json?.error ?? "Erro ao gerar PIX.");
        return;
      }
      setCreditoQr(json.qr_code_base64 ?? null);
      setCreditoCopia(json.qr_code ?? null);
      setCreditoExpiraEm(json.expira_em ?? null);
    } finally {
      setCreditoLoading(false);
    }
  }

  async function novaConversa() {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch("/api/seller/gestores-ia/tiago/nova-sessao", {
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
      const res = await fetch("/api/seller/gestores-ia/tiago/nova-sessao", {
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

    try {
      const token = await getAccessToken();
      if (!token) {
        setErroEnvio("Sessão expirada, faça login de novo.");
        return;
      }
      const res = await fetch("/api/seller/gestores-ia/tiago/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, mensagem }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroEnvio(json?.error ?? "Erro ao falar com o Tiago Silva.");
        if (json?.bloqueado_hoje === true) setBloqueadoHoje(true);
        return;
      }
      setMensagens((prev) => [
        ...prev,
        { id: `local-resp-${Date.now()}`, role: "assistant", content: json.resposta, criado_em: new Date().toISOString() },
      ]);
      await carregar(sessionId);
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return (
      <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-40 w-full" />
      </section>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>{error}</div>
    );
  }

  if (!liberado) {
    return (
      <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8">
        <p className="font-medium text-[var(--foreground)]">🔒 Tiago Silva exige o add-on Gestores de IA</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
          O chat com o Gestor Mestre já está pronto, mas exige o add-on Gestores de IA.{" "}
          <Link href="/seller/plano" className="font-semibold underline">
            Ver planos e add-on
          </Link>
          .
        </p>
      </section>
    );
  }

  const orcamentoEstourado = orcamento ? orcamento.usado >= orcamento.teto : false;
  const chatBloqueado = bloqueadoHoje || orcamentoEstourado;

  const creditoValorFinal =
    creditoSelecionado === "outro" ? Number(creditoValorCustom.replace(",", ".")) : creditoSelecionado;
  const creditoValorFinalValido =
    typeof creditoValorFinal === "number" &&
    Number.isFinite(creditoValorFinal) &&
    creditoValorFinal >= MIN_CREDITO_CUSTOM &&
    creditoValorFinal <= MAX_CREDITO_CUSTOM;

  return (
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

      {usoTokensHoje && (() => {
        const pct = Math.min(100, Math.round((usoTokensHoje.tokens / usoTokensHoje.cota) * 100));
        return (
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-[var(--foreground)]">Uso do chat hoje</span>
              <span className={cn("font-semibold", bloqueadoHoje ? DANGER_PREMIUM_TEXT_PRIMARY : "text-[var(--muted)]")}>
                {pct}% usado · {TOKENS_FMT.format(usoTokensHoje.tokens)} de {TOKENS_FMT.format(usoTokensHoje.cota)} tokens
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
      })()}

      <section className="flex min-h-[420px] flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm">
        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {mensagens.length === 0 ? (
            <div className="space-y-3">
              <p className="text-lg font-semibold text-[var(--foreground)]">
                {saudacaoPorHorario()}
                {nomeResponsavel ? `, ${nomeResponsavel.split(" ")[0]}` : ""}
              </p>
              <p className="text-sm text-[var(--muted)]">
                Pergunta pro Tiago Silva o que a equipe (Diogo, Andrey, Amanda, Ulisses) já encontrou, ou escolhe uma
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
          {enviando && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-sm text-[var(--muted)]">
                Tiago Silva está digitando…
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
            <div className={cn("mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs", AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_PRIMARY)}>
              <span>
                {bloqueadoHoje
                  ? "Cota diária do chat esgotada — libera de novo à meia-noite."
                  : "Orçamento mensal do chat esgotado — volta a liberar no início do próximo mês."}
              </span>
              {bloqueadoHoje && (
                <button
                  type="button"
                  onClick={() => setModalCredito(true)}
                  className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  Comprar mais crédito
                </button>
              )}
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

      {modalCredito && (
        <div className={MODAL_OVERLAY_CLASS}>
          <div className={cn(MODAL_PANEL_CLASS, "overflow-y-auto")}>
            <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 pb-4 pt-5">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Crédito extra do chat — PIX</h2>
              <button
                type="button"
                onClick={fecharModalCredito}
                className="-m-1 rounded p-1 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                aria-label="Fechar"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {!creditoQr ? (
                <>
                  <p className="text-sm text-[var(--muted)]">
                    Vale só por hoje — libera mais uso do chat com o Tiago Silva até a meia-noite. Não acumula pro dia seguinte.
                  </p>
                  {creditoErro && (
                    <p className={cn("rounded-xl px-3 py-2 text-xs", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
                      {creditoErro}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {PACOTES_CREDITO.map((valor) => (
                      <button
                        key={valor}
                        type="button"
                        disabled={creditoLoading}
                        onClick={() => setCreditoSelecionado(valor)}
                        className={cn(
                          "rounded-xl border bg-[var(--card)] px-3 py-3 text-center disabled:cursor-not-allowed disabled:opacity-50",
                          creditoSelecionado === valor
                            ? "border-emerald-500 ring-1 ring-emerald-500"
                            : "border-[var(--card-border)] hover:border-emerald-400"
                        )}
                      >
                        <span className="text-sm font-semibold text-[var(--foreground)]">{BRL.format(valor)}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={creditoLoading}
                      onClick={() => setCreditoSelecionado("outro")}
                      className={cn(
                        "rounded-xl border bg-[var(--card)] px-3 py-3 text-center disabled:cursor-not-allowed disabled:opacity-50",
                        creditoSelecionado === "outro"
                          ? "border-emerald-500 ring-1 ring-emerald-500"
                          : "border-[var(--card-border)] hover:border-emerald-400"
                      )}
                    >
                      <span className="text-sm font-semibold text-[var(--foreground)]">Outro</span>
                    </button>
                  </div>

                  {creditoSelecionado === "outro" && (
                    <input
                      type="number"
                      inputMode="decimal"
                      min={MIN_CREDITO_CUSTOM}
                      max={MAX_CREDITO_CUSTOM}
                      value={creditoValorCustom}
                      onChange={(e) => setCreditoValorCustom(e.target.value)}
                      placeholder={`Valor entre ${MIN_CREDITO_CUSTOM} e ${MAX_CREDITO_CUSTOM}`}
                      autoFocus
                      className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-emerald-500"
                    />
                  )}

                  {creditoSelecionado !== null && (
                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-4 py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--muted)]">Total a pagar</span>
                        <span className="font-semibold text-[var(--foreground)]">
                          {creditoValorFinalValido ? BRL.format(creditoValorFinal as number) : "—"}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={fecharModalCredito}
                      className="flex-1 rounded-md border border-[var(--card-border)] bg-[var(--card)] py-1.5 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--muted)]/10"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={creditoLoading || !creditoValorFinalValido}
                      onClick={() => void gerarPixCredito(creditoValorFinal as number)}
                      className="flex-1 rounded-md bg-emerald-600 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {creditoLoading
                        ? "Gerando…"
                        : creditoValorFinalValido
                          ? `Pagar ${BRL.format(creditoValorFinal as number)} agora`
                          : "Escolha um valor"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <IconCheck className="h-5 w-5" />
                    <p className="text-sm font-semibold text-[var(--foreground)]">PIX gerado — pague no app do banco</p>
                  </div>
                  <p className="text-xs text-[var(--muted)]">Libera o crédito extra assim que o pagamento for confirmado.</p>
                  {creditoRestSec !== null && (
                    <div
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium",
                        creditoRestSec <= 60 ? cn(AMBER_PREMIUM_SURFACE, AMBER_PREMIUM_TEXT_PRIMARY) : "bg-[var(--surface-subtle)] text-[var(--muted)]"
                      )}
                    >
                      <IconClock className={`h-4 w-4 shrink-0 ${creditoRestSec <= 60 ? "animate-pulse" : ""}`} />
                      Válido por {Math.floor(creditoRestSec / 60)}:{(creditoRestSec % 60).toString().padStart(2, "0")}
                    </div>
                  )}
                  <div className="flex justify-center rounded-xl bg-[var(--card)] p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`data:image/png;base64,${creditoQr}`} alt="QR Code PIX" className="h-40 w-40" />
                  </div>
                  {creditoCopia && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--muted)]">Copia e cola</p>
                      <div className="max-h-20 overflow-y-auto break-all rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
                        {creditoCopia}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(creditoCopia);
                          setCreditoCopiado(true);
                          setTimeout(() => setCreditoCopiado(false), 2000);
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
                      >
                        {creditoCopiado ? "Copiado!" : "Copiar código PIX"}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={fecharModalCredito}
                    className="w-full rounded-md bg-emerald-600 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    Fechar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
