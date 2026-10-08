"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "@/components/seller/SellerGestorRunShell";
import { CopiarSugestaoBotao } from "@/components/seller/SellerGestorCopiarBotao";
import { ReputacaoTermometro } from "@/components/seller/ReputacaoTermometro";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";

type Diagnostico = "saudavel" | "atencao" | "critica";
type Urgencia = "alta" | "media" | "baixa";

type Pergunta = {
  pergunta_id: number;
  item_id: string;
  titulo_anuncio: string;
  pergunta: string;
  dias_pendente: number;
  urgencia: Urgencia;
  resposta_sugerida: string;
};

type AmandaResultado = {
  diagnostico: Diagnostico;
  observacao: string;
  nivel: string | null;
  status_vendedor: string | null;
  taxa_reclamacoes: number;
  qtd_reclamacoes: number;
  taxa_atraso_manuseio: number;
  qtd_atraso_manuseio: number;
  taxa_cancelamento: number;
  periodo_metrica: string;
  perguntas: Pergunta[];
};

type Acesso = "loading" | "liberado" | "negado";
type UsoTokensHoje = { tokens: number; cota: number };
const TOKENS_FMT = new Intl.NumberFormat("pt-BR");

const DIAGNOSTICO_BADGE: Record<Diagnostico, string> = {
  saudavel: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  atencao: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  critica: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};
const DIAGNOSTICO_LABEL: Record<Diagnostico, string> = {
  saudavel: "Reputação saudável",
  atencao: "Atenção",
  critica: "Crítica",
};

function DiagnosticoBadge({ diagnostico }: { diagnostico: Diagnostico }) {
  return (
    <span
      className={cn(
        "inline-flex w-40 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        DIAGNOSTICO_BADGE[diagnostico]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {DIAGNOSTICO_LABEL[diagnostico]}
    </span>
  );
}

const URGENCIA_BADGE: Record<Urgencia, string> = {
  alta: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  media: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  baixa: "bg-[var(--muted)]/15 text-[var(--muted)]",
};
const URGENCIA_LABEL: Record<Urgencia, string> = { alta: "Urgente", media: "Moderada", baixa: "Baixa" };

function UrgenciaBadge({ urgencia }: { urgencia: Urgencia }) {
  return (
    <span
      className={cn(
        "inline-flex w-20 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        URGENCIA_BADGE[urgencia]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {URGENCIA_LABEL[urgencia]}
    </span>
  );
}

function formatarPct(taxa: number): string {
  return `${(taxa * 100).toFixed(1)}%`;
}

function ReputacaoResumo({ r }: { r: AmandaResultado }) {
  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1.5">
          {r.status_vendedor ? (
            <p className="text-sm font-medium text-[var(--foreground)]">{r.status_vendedor}</p>
          ) : null}
          <ReputacaoTermometro nivel={r.nivel} />
        </div>
        <DiagnosticoBadge diagnostico={r.diagnostico} />
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        <div>
          <dt className="inline">Reclamações: </dt>
          <dd className="inline font-medium text-[var(--foreground)]">
            {formatarPct(r.taxa_reclamacoes)} ({r.qtd_reclamacoes})
          </dd>
        </div>
        <div>
          <dt className="inline">Atraso no envio: </dt>
          <dd className="inline font-medium text-[var(--foreground)]">
            {formatarPct(r.taxa_atraso_manuseio)} ({r.qtd_atraso_manuseio})
          </dd>
        </div>
        <div>
          <dt className="inline">Cancelamentos: </dt>
          <dd className="inline font-medium text-[var(--foreground)]">{formatarPct(r.taxa_cancelamento)}</dd>
        </div>
        <div>
          <dt className="inline">Período: </dt>
          <dd className="inline font-medium text-[var(--foreground)]">{r.periodo_metrica}</dd>
        </div>
      </dl>
      <p className="mt-2 text-sm text-[var(--foreground)]">{r.observacao}</p>
    </article>
  );
}

type AplicarPerguntaEstado = "idle" | "confirmando" | "aplicando" | "aplicado" | "bloqueado" | "erro";

function AplicarRespostaPerguntaBotao({ perguntaId, respostaSugerida }: { perguntaId: number; respostaSugerida: string }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(respostaSugerida);
  const [estado, setEstado] = useState<AplicarPerguntaEstado>("idle");
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function aplicar() {
    setEstado("aplicando");
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/amanda/aplicar-resposta-pergunta", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta_id: perguntaId, resposta: texto }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (res.status === 409) {
      setMensagem(json.error ?? "Essa pergunta não está mais disponível.");
      setEstado("bloqueado");
      return;
    }
    if (!res.ok || !json.ok) {
      setMensagem(json.error ?? "Erro ao responder a pergunta.");
      setEstado("erro");
      return;
    }
    setMensagem(null);
    setEstado("aplicado");
  }

  if (estado === "aplicado") {
    return <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Resposta enviada ✓</p>;
  }

  return (
    <div className="mt-2">
      {editando ? (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-sm text-[var(--foreground)]"
        />
      ) : (
        <p className="text-sm text-[var(--foreground)]">
          <span className="text-[var(--muted)]">Resposta sugerida: </span>
          {texto}
        </p>
      )}

      {(estado === "bloqueado" || estado === "erro") && mensagem ? (
        <p className={cn("mt-1 text-xs", DANGER_PREMIUM_TEXT_PRIMARY)}>{mensagem}</p>
      ) : null}

      {estado === "confirmando" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-[var(--muted)]">Enviar essa resposta pro comprador agora?</p>
          <button
            type="button"
            onClick={() => void aplicar()}
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Sim, enviar
          </button>
          <button
            type="button"
            onClick={() => setEstado("idle")}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {editando ? (
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            >
              Salvar edição
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            >
              Editar
            </button>
          )}
          <button
            type="button"
            onClick={() => setEstado("confirmando")}
            disabled={editando || estado === "aplicando" || !texto.trim()}
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {estado === "aplicando" ? "Enviando…" : "Aplicar resposta"}
          </button>
          <CopiarSugestaoBotao texto={texto} rotulo="Copiar resposta" />
        </div>
      )}
    </div>
  );
}

function PerguntaCard({ p }: { p: Pergunta }) {
  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-medium text-[var(--foreground)]">{p.titulo_anuncio}</p>
          <a
            href={mlItemPermalink(p.item_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Ver anúncio ↗
          </a>
        </div>
        <UrgenciaBadge urgencia={p.urgencia} />
      </div>
      <p className="mt-2 text-sm text-[var(--foreground)]">&ldquo;{p.pergunta}&rdquo;</p>
      <p className="mt-1 text-xs text-[var(--muted)]">Pendente há {p.dias_pendente} dia(s)</p>
      <AplicarRespostaPerguntaBotao perguntaId={p.pergunta_id} respostaSugerida={p.resposta_sugerida} />
    </article>
  );
}

export default function AmandaAvulsoPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [run, setRun] = useState<SellerAiRun<AmandaResultado> | null>(null);
  const [usoTokensHoje, setUsoTokensHoje] = useState<UsoTokensHoje | null>(null);
  const [bloqueadoHoje, setBloqueadoHoje] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/amanda", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 403) {
      setAcesso("negado");
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAcesso("negado");
      return;
    }
    setMlConectado(Boolean(json.ml_conectado));
    setRun(json.run ?? null);
    setUsoTokensHoje(json.uso_tokens_hoje ?? null);
    setBloqueadoHoje(json.bloqueado_hoje === true);
    setAcesso("liberado");
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const dispararRodada: DispararRodada = async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "Sessão expirada, faça login de novo.";
    const res = await fetch("/api/gestores-ia-avulso/amanda/rodar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return json.error ?? "Erro ao rodar a Amanda.";
    await carregar();
    return null;
  };

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
                Amanda — Reputação &amp; Atendimento
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Analisa suas métricas de reputação no Mercado Livre (reclamação, atraso no envio, cancelamento) e lista
              perguntas de comprador sem resposta com uma sugestão de texto pronta pra você revisar e enviar.
            </p>
          </div>
        </header>

        {acesso === "loading" ? (
          <section className="space-y-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-24 w-full" />
          </section>
        ) : acesso === "negado" ? (
          <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
            Não foi possível validar seu acesso.
          </div>
        ) : !mlConectado ? (
          <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center shadow-sm sm:p-8">
            <p className="font-medium text-[var(--foreground)]">Conecte sua conta do Mercado Livre primeiro</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
              A Amanda precisa ler sua reputação e suas perguntas pendentes pra analisar — conecte sua conta pra
              liberar essa rodada.
            </p>
            <Link
              href="/seller/gestores-ia-avulso/integracoes"
              className="mt-4 inline-flex rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              Conectar Mercado Livre
            </Link>
          </section>
        ) : (
          <>
            {usoTokensHoje
              ? (() => {
                  const pct = Math.min(100, Math.round((usoTokensHoje.tokens / usoTokensHoje.cota) * 100));
                  return (
                    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-[var(--foreground)]">Uso dos Gestores de IA hoje</span>
                        <span className={cn("font-semibold", bloqueadoHoje ? "text-[var(--danger)]" : "text-[var(--muted)]")}>
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

            <SellerGestorRunShell<AmandaResultado>
              pro
              run={run}
              titulo="Reputação & Atendimento"
              ajuda={
                <p>
                  Analisa suas métricas de reputação (reclamação, atraso no envio, cancelamento) e lista perguntas de
                  comprador sem resposta com uma sugestão de texto pronta pra você revisar e enviar.
                </p>
              }
              onRodarAgora={dispararRodada}
            >
              {(resultado) => (
                <div className="space-y-4">
                  <ReputacaoResumo r={resultado} />
                  {resultado.perguntas.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Perguntas sem resposta ({resultado.perguntas.length})
                      </p>
                      <div className="space-y-2.5">
                        {resultado.perguntas.map((p) => (
                          <PerguntaCard key={p.pergunta_id} p={p} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-4 text-center text-sm text-[var(--muted)]">
                      Nenhuma pergunta pendente agora.
                    </div>
                  )}
                </div>
              )}
            </SellerGestorRunShell>
          </>
        )}
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
