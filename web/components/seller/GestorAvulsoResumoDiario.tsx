"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { cn } from "@/lib/utils";
import { ModalOverlay } from "@/components/ui/ModalOverlay";
import { MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";

type PropostaResumoDiario = {
  gestor: "estoque" | "reputacao_atendimento" | "ads" | "anuncios_seo";
  gestor_nome: string;
  item_ou_sku: string;
  acao: string;
  motivo: string;
  severidade: number;
};
type ResumoDiario = { top3: PropostaResumoDiario[]; total_candidatas: number; gestores_sem_rodada: string[] };

const ROTA_POR_GESTOR: Record<PropostaResumoDiario["gestor"], string> = {
  estoque: "/seller/gestores-ia-avulso/estoque",
  ads: "/seller/gestores-ia-avulso/ulisses",
  anuncios_seo: "/seller/gestores-ia-avulso/andrey",
  reputacao_atendimento: "/seller/gestores-ia-avulso/amanda",
};

const BADGE_SEVERIDADE: Record<"urgente" | "atencao" | "oportunidade", string> = {
  urgente: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  atencao: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  oportunidade: "bg-[var(--muted)]/15 text-[var(--muted)]",
};

function rotuloSeveridade(severidade: number): "urgente" | "atencao" | "oportunidade" {
  if (severidade >= 2.5) return "urgente";
  if (severidade >= 1) return "atencao";
  return "oportunidade";
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

/** Mesmo chip neutro de ícone dos itens da lista de gestores (`GestorAvulsoPendenciasLista`)
 * — esse teaser é uma linha a mais na mesma lista, não um bloco à parte. */
const ICON_CHIP_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] text-[var(--foreground)]";

function IconResumo() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

/**
 * Teaser compacto do resumo diário (top 3 ações da equipe) na tela inicial dos gestores —
 * card clicável que abre modal com o detalhe completo. Antes ficava expandido inline na
 * página do Gestor (chat), ocupando espaço grande antes mesmo da conversa começar; o Sr
 * Stark pediu pra mover pra cá, compacto (2026-10-16).
 */
export function GestorAvulsoResumoDiario() {
  const [resumo, setResumo] = useState<ResumoDiario | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/gestores-ia-avulso/tiago/resumo-diario", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.liberado !== false) setResumo(json);
    })();
  }, []);

  if (!resumo || resumo.top3.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 text-left transition-all hover:border-emerald-300 hover:shadow-sm dark:hover:border-emerald-700"
      >
        <span className={ICON_CHIP_CLASS}>
          <IconResumo />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--foreground)]">Resultado da reunião</p>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {resumo.top3.length === 1 ? "1 ação encontrada pela equipe" : `${resumo.top3.length} ações encontradas pela equipe`}
          </p>
        </div>
        <svg className="h-4 w-4 shrink-0 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {aberto ? (
        <ModalOverlay onBackdropClick={() => setAberto(false)} panelClassName="max-w-lg md:max-w-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--card-border)] p-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Resultado da reunião — as 3 ações mais importantes</h2>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--muted)]/10"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          <div className={cn(MODAL_PANEL_BODY_CLASS, "space-y-2.5 p-4")}>
            {resumo.top3.map((p, i) => {
              const rotulo = rotuloSeveridade(p.severidade);
              return (
                <article key={`${p.gestor}-${i}`} className="rounded-xl border border-[var(--card-border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--foreground)]">{p.item_ou_sku}</p>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
                        BADGE_SEVERIDADE[rotulo]
                      )}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                      {p.gestor_nome}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--foreground)]">{p.acao}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{p.motivo}</p>
                  <Link
                    href={ROTA_POR_GESTOR[p.gestor]}
                    className="mt-1.5 inline-block text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Resolver no {p.gestor_nome} →
                  </Link>
                </article>
              );
            })}
            {resumo.gestores_sem_rodada.length > 0 ? (
              <p className="text-xs text-[var(--muted)]">
                {resumo.gestores_sem_rodada.join(", ")} ainda não rodou — o resumo fica mais completo depois.
              </p>
            ) : null}
          </div>
        </ModalOverlay>
      ) : null}
    </>
  );
}
