"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "./SellerGestorRunShell";

type Diagnostico = "problema_titulo" | "problema_descricao" | "poucas_fotos" | "sem_problema_aparente";

type AnuncioDiagnostico = {
  item_id: string;
  diagnostico: Diagnostico;
  titulo_sugerido: string;
  observacao: string;
};

export type AnunciosSeoResultado = { anuncios: AnuncioDiagnostico[]; destaque_prioridade: string[] };

const DIAGNOSTICO_BADGE: Record<Diagnostico, string> = {
  problema_titulo: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  problema_descricao: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  poucas_fotos: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  sem_problema_aparente: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};

const DIAGNOSTICO_LABEL: Record<Diagnostico, string> = {
  problema_titulo: "Título fraco",
  problema_descricao: "Descrição fraca",
  poucas_fotos: "Poucas fotos",
  sem_problema_aparente: "Sem problema aparente",
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

function itemPermalink(itemId: string): string {
  return `https://produto.mercadolivre.com.br/${itemId}`;
}

export function SellerGestorAnunciosSeoPanel({
  pro,
  run,
  onRodarAgora,
}: {
  pro: boolean;
  run: SellerAiRun<AnunciosSeoResultado> | null;
  onRodarAgora?: DispararRodada;
}) {
  const [verTodos, setVerTodos] = useState(false);

  return (
    <SellerGestorRunShell
      pro={pro}
      run={run}
      onRodarAgora={onRodarAgora}
      titulo="Anúncios & SEO"
      ajuda={
        <p>
          Analisa uma amostra dos seus anúncios com pior venda (com 30+ dias no ar, pra não julgar
          anúncio novo) e aponta se título, descrição ou fotos parecem estar prejudicando a performance.
          As sugestões de título são só recomendação — você decide se aplica no anúncio.
        </p>
      }
    >
      {(resultado) => {
        const anuncios = resultado.anuncios;
        const comProblema = [...anuncios].filter((a) => a.diagnostico !== "sem_problema_aparente");
        const semProblema = anuncios.filter((a) => a.diagnostico === "sem_problema_aparente");

        return (
          <>
            {comProblema.length === 0 ? (
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-4 text-center text-sm text-[var(--muted)]">
                Nenhum problema aparente nos anúncios analisados.
              </div>
            ) : (
              <div className="space-y-2.5">
                {comProblema.map((a) => (
                  <article
                    key={a.item_id}
                    className="rounded-xl border border-amber-200 p-3.5 dark:border-amber-900/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <a
                        href={itemPermalink(a.item_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm font-medium text-[var(--foreground)] hover:underline"
                      >
                        {a.item_id}
                      </a>
                      <DiagnosticoBadge diagnostico={a.diagnostico} />
                    </div>
                    {a.titulo_sugerido ? (
                      <p className="mt-2 text-sm text-[var(--foreground)]">
                        <span className="text-[var(--muted)]">Título sugerido: </span>
                        {a.titulo_sugerido}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-[var(--muted)]">{a.observacao}</p>
                  </article>
                ))}
              </div>
            )}

            {semProblema.length > 0 ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setVerTodos((v) => !v)}
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                >
                  {verTodos ? "Ocultar" : "Ver"} os outros {semProblema.length} anúncios sem problema aparente
                </button>
                {verTodos ? (
                  <div className="mt-3 divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">
                    {semProblema.map((a) => (
                      <div
                        key={a.item_id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
                      >
                        <a
                          href={itemPermalink(a.item_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[var(--foreground)] hover:underline"
                        >
                          {a.item_id}
                        </a>
                        <DiagnosticoBadge diagnostico={a.diagnostico} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        );
      }}
    </SellerGestorRunShell>
  );
}
