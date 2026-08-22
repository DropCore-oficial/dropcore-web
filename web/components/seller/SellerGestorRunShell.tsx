"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { HelpBubble } from "@/components/HelpBubble";

export type SellerAiRunStatus = "pendente" | "ok" | "erro";

export type SellerAiRun<TResultado> = {
  id: string;
  status: SellerAiRunStatus;
  resultado: TResultado | null;
  erro_mensagem: string | null;
  executado_em: string;
};

/** Retorna mensagem de erro (string) se falhar, ou null se deu certo. */
export type DispararRodada = () => Promise<string | null>;

function BotaoRodarAgora({ onRodarAgora }: { onRodarAgora: DispararRodada }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function clicar() {
    setCarregando(true);
    setErro(null);
    const erroMsg = await onRodarAgora();
    setErro(erroMsg);
    setCarregando(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void clicar()}
        disabled={carregando}
        className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-60"
      >
        {carregando ? "Rodando…" : "Rodar de novo agora"}
      </button>
      {erro ? <span className="text-xs text-[var(--danger)]">{erro}</span> : null}
    </div>
  );
}

/**
 * Casca comum dos painéis de gestor de IA na tela /seller/gestores-ia: mesmos estados
 * (upsell Pro, sem rodada ainda, processando, erro) pros dois gestores hoje (Ruptura &
 * Fulfillment, Anúncios & SEO) — só o conteúdo de "resultado ok" muda por gestor.
 */
export function SellerGestorRunShell<TResultado>({
  pro,
  run,
  titulo,
  ajuda,
  onRodarAgora,
  children,
}: {
  pro: boolean;
  run: SellerAiRun<TResultado> | null;
  titulo: string;
  ajuda: ReactNode;
  /** Dispara uma rodada manual (botão "Rodar de novo agora") — omitir esconde o botão. */
  onRodarAgora?: DispararRodada;
  children: (resultado: TResultado, executadoEm: string) => ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  if (!pro) {
    return (
      <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-center shadow-sm sm:p-6">
        <p className="font-medium text-[var(--foreground)]">{titulo} é exclusivo do plano Pro</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Faça upgrade pra receber recomendações automáticas dessa análise.
        </p>
        <Link
          href="/seller/plano"
          className="mt-4 inline-flex rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Ver planos
        </Link>
      </section>
    );
  }

  if (!run) {
    return (
      <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-center shadow-sm sm:p-6">
        <p className="font-medium text-[var(--foreground)]">Ainda não processamos sua loja</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Assim que a primeira rodada rodar, as recomendações aparecem aqui.
        </p>
        {onRodarAgora ? (
          <div className="mt-4 flex justify-center">
            <BotaoRodarAgora onRodarAgora={onRodarAgora} />
          </div>
        ) : null}
      </section>
    );
  }

  if (run.status === "pendente") {
    return (
      <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-center shadow-sm sm:p-6">
        <p className="font-medium text-[var(--foreground)]">Processando…</p>
        <p className="mt-1 text-sm text-[var(--muted)]">A análise está em andamento, volte em alguns minutos.</p>
      </section>
    );
  }

  if (run.status === "erro" || !run.resultado) {
    return (
      <div className={cn("rounded-2xl p-4 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>
        <p>{run.erro_mensagem ?? "Erro ao processar a última rodada."}</p>
        {onRodarAgora ? (
          <div className="mt-3">
            <BotaoRodarAgora onRodarAgora={onRodarAgora} />
          </div>
        ) : null}
      </div>
    );
  }

  const executadoEm = new Date(run.executado_em).toLocaleString("pt-BR");

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="font-medium text-[var(--foreground)]">{titulo}</p>
        <HelpBubble
          ariaLabel={`Como funciona ${titulo}`}
          open={helpOpen}
          onOpen={() => setHelpOpen(true)}
          onClose={() => setHelpOpen(false)}
        >
          {ajuda}
        </HelpBubble>
        <span className="text-xs text-[var(--muted)]">Atualizado em {executadoEm}</span>
        {onRodarAgora ? (
          <span className="ml-auto">
            <BotaoRodarAgora onRodarAgora={onRodarAgora} />
          </span>
        ) : null}
      </div>
      {children(run.resultado, executadoEm)}
    </section>
  );
}
