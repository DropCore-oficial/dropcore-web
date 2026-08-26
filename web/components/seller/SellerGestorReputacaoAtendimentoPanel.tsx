"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { mlItemPermalink, mlReclamacaoPermalink } from "@/lib/mercadoLivreApiClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "./SellerGestorRunShell";
import { CopiarSugestaoBotao } from "./SellerGestorCopiarBotao";

type Diagnostico = "saudavel" | "atencao" | "critica";
type Urgencia = "alta" | "media" | "baixa";

type FornecedorAtraso = { fornecedorNome: string; pedidosPostados: number; atrasoMedioDias: number };

type Pergunta = {
  pergunta_id: number;
  item_id: string;
  titulo_anuncio: string;
  pergunta: string;
  dias_pendente: number;
  urgencia: Urgencia;
  resposta_sugerida: string;
};

export type ReputacaoAtendimentoResultado = {
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
  fornecedores_atraso: FornecedorAtraso[];
  perguntas: Pergunta[];
};

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

function ReputacaoResumo({ r }: { r: ReputacaoAtendimentoResultado }) {
  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--foreground)]">
          Nível {r.nivel ?? "sem nível ainda"}
          {r.status_vendedor ? ` · ${r.status_vendedor}` : ""}
        </p>
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
      {r.fornecedores_atraso.length > 0 ? (
        <div className="mt-2.5 divide-y divide-[var(--card-border)] rounded-lg border border-[var(--card-border)]">
          {r.fornecedores_atraso.map((f) => (
            <div
              key={f.fornecedorNome}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 py-2 text-xs"
            >
              <span className="text-[var(--foreground)]">{f.fornecedorNome}</span>
              <span className="text-[var(--muted)]">
                {f.atrasoMedioDias}d em média até postar · {f.pedidosPostados} pedidos no período
              </span>
            </div>
          ))}
        </div>
      ) : null}
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
    const res = await fetch("/api/seller/gestores-ia/aplicar-resposta-pergunta", {
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
        <p className="mt-1 text-xs text-[var(--danger)]">{mensagem}</p>
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

type DisputaCaso = {
  id: string;
  ml_order_id: string | null;
  ml_item_id: string | null;
  ml_claim_id: string | null;
  foto_enviada: boolean;
  criado_em: string;
};

function EnviarFotoBotao({ casoId, onEnviado }: { casoId: string; onEnviado: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(file: File) {
    setEnviando(true);
    setErro(null);
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setErro("Sessão expirada, faça login de novo.");
      setEnviando(false);
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/seller/gestores-ia/disputas/${casoId}/enviar-foto`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErro(json.error ?? "Erro ao enviar a foto.");
      setEnviando(false);
      return;
    }
    onEnviado();
  }

  return (
    <div className="mt-2">
      <label className="inline-flex cursor-pointer items-center rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10">
        {enviando ? "Enviando…" : "Anexar foto"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={enviando}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void enviar(file);
          }}
        />
      </label>
      {erro ? <p className="mt-1 text-xs text-[var(--danger)]">{erro}</p> : null}
    </div>
  );
}

function DisputaCasoCard({ caso, onAtualizado }: { caso: DisputaCaso; onAtualizado: () => void }) {
  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-[var(--foreground)]">Pedido do Mercado Livre {caso.ml_order_id ?? "—"}</p>
        <div className="flex flex-wrap items-center gap-3">
          {caso.ml_order_id && caso.ml_claim_id ? (
            <a
              href={mlReclamacaoPermalink(caso.ml_order_id, caso.ml_claim_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Ver reclamação ↗
            </a>
          ) : null}
          {caso.ml_item_id ? (
            <a
              href={mlItemPermalink(caso.ml_item_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Ver anúncio ↗
            </a>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-sm text-[var(--foreground)]">
        O comprador anexou uma foto na reclamação desse pedido. Clique em &ldquo;Ver reclamação&rdquo; pra
        abrir e conferir — se conseguir ver a foto lá, envie uma cópia aqui pra gente analisar.
      </p>
      {caso.foto_enviada ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Foto enviada ✓</p>
      ) : (
        <EnviarFotoBotao casoId={caso.id} onEnviado={onAtualizado} />
      )}
    </article>
  );
}

function DisputasParaFoto() {
  const [casos, setCasos] = useState<DisputaCaso[]>([]);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    const res = await fetch("/api/seller/gestores-ia/disputas", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { casos?: DisputaCaso[] };
    setCasos((json.casos ?? []).filter((c) => !c.foto_enviada));
    setLoading(false);
  }

  useEffect(() => {
    void carregar();
  }, []);

  if (loading || casos.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Reclamações sinalizadas ({casos.length})
      </p>
      <div className="space-y-2.5">
        {casos.map((c) => (
          <DisputaCasoCard key={c.id} caso={c} onAtualizado={carregar} />
        ))}
      </div>
    </div>
  );
}

export function SellerGestorReputacaoAtendimentoPanel({
  pro,
  run,
  onRodarAgora,
}: {
  pro: boolean;
  run: SellerAiRun<ReputacaoAtendimentoResultado> | null;
  onRodarAgora?: DispararRodada;
}) {
  return (
    <SellerGestorRunShell
      pro={pro}
      run={run}
      onRodarAgora={onRodarAgora}
      titulo="Reputação & Atendimento"
      ajuda={
        <p>
          Analisa suas métricas de reputação (reclamação, atraso no envio, cancelamento) e cruza com o
          atraso real de postagem por fornecedor — só o DropCore vê os dois lados. Também lista perguntas
          de comprador sem resposta com uma sugestão de texto pronta pra você revisar e colar.
        </p>
      }
    >
      {(resultado) => (
        <div className="space-y-4">
          <DisputasParaFoto />
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
  );
}
