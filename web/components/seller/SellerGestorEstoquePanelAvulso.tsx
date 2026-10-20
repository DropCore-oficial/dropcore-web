"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "./SellerGestorRunShell";

type Risco = "alto" | "medio" | "sem_risco" | "dado_insuficiente";

type MembroEstoque = { item_id: string; estoque: number; titulo: string };

type VariacaoCritica = {
  item_id: string;
  nome: string;
  estoque_atual: number;
  vendas_30d: number;
  dias_ate_ruptura: number | null;
  risco: "alto" | "medio";
};

type SkuEstoqueResultado = {
  chave: string;
  item_id_representante: string;
  nome_produto: string;
  estoque_atual: number;
  vendas_30d: number;
  dias_ate_ruptura: number | null;
  risco: Risco;
  acao_recomendada: string;
  no_full: boolean;
  permalink: string | null;
  piorou_desde_ontem: boolean;
  membros: MembroEstoque[];
  variacao_critica: VariacaoCritica | null;
};

export type EstoqueAvulsoResultado = {
  skus: SkuEstoqueResultado[];
  destaque_risco_alto: string[];
  pausas_recentes_confirmado?: { total_pausas_30d: number; hoje_fora_do_risco_alto: number };
};

const RISCO_BADGE: Record<Risco, string> = {
  alto: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  medio: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  sem_risco: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  dado_insuficiente: "bg-[var(--muted)]/15 text-[var(--muted)]",
};

const RISCO_LABEL: Record<Risco, string> = {
  alto: "Risco alto",
  medio: "Risco médio",
  sem_risco: "Sem risco",
  dado_insuficiente: "Dado insuficiente",
};

const RANK_RISCO: Record<Risco, number> = { alto: 0, medio: 1, dado_insuficiente: 2, sem_risco: 3 };

function RiscoBadge({ risco }: { risco: Risco }) {
  return (
    <span
      className={cn(
        "inline-flex w-32 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        RISCO_BADGE[risco]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {RISCO_LABEL[risco]}
    </span>
  );
}

type PausarEstado = "idle" | "confirmando" | "aplicando" | "aplicado" | "erro";

/** Mesmo padrão do hub (`SellerGestorEstoqueFulfillmentPanel.tsx`): confirmação inline no
 * próprio card, sem modal/overlay — ação real no Mercado Livre, replicada 1:1 aqui pra não
 * ter 2 UX diferentes pra mesma ação entre hub e avulso. */
function PausarAnuncioBotao({ itemId }: { itemId: string }) {
  const [estado, setEstado] = useState<PausarEstado>("idle");
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function pausar() {
    setEstado("aplicando");
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/estoque/alterar-status-anuncio", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId, status: "paused" }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setMensagem(json.error ?? "Erro ao pausar o anúncio.");
      setEstado("erro");
      return;
    }
    setEstado("aplicado");
  }

  if (estado === "aplicado") {
    return <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Anúncio pausado ✓</p>;
  }

  if (estado === "erro") {
    return <p className="mt-2 text-xs text-[var(--danger)]">{mensagem}</p>;
  }

  if (estado === "confirmando") {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-xs text-[var(--muted)]">Pausar esse anúncio no Mercado Livre agora?</p>
        <button
          type="button"
          onClick={() => void pausar()}
          className="rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90"
        >
          Sim, pausar
        </button>
        <button
          type="button"
          onClick={() => setEstado("idle")}
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEstado("confirmando")}
      disabled={estado === "aplicando"}
      className="mt-2 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-60"
    >
      {estado === "aplicando" ? "Pausando…" : "Pausar anúncio"}
    </button>
  );
}

function SkuCard({ s }: { s: SkuEstoqueResultado }) {
  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-medium text-[var(--foreground)]">{s.nome_produto}</p>
          {s.permalink ? (
            <a
              href={s.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Ver anúncio ↗
            </a>
          ) : null}
          {s.piorou_desde_ontem ? (
            <span className="inline-flex items-center rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-300">
              piorou desde ontem
            </span>
          ) : null}
        </div>
        <RiscoBadge risco={s.risco} />
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        <div>
          <dt className="inline">Estoque: </dt>
          <dd className="inline font-medium text-[var(--foreground)]">{s.estoque_atual}</dd>
        </div>
        <div>
          <dt className="inline">Vendas 30d: </dt>
          <dd className="inline font-medium text-[var(--foreground)]">{s.vendas_30d}</dd>
        </div>
        {s.dias_ate_ruptura !== null ? (
          <div>
            <dt className="inline">Esgota em: </dt>
            <dd className="inline font-medium text-[var(--foreground)]">{s.dias_ate_ruptura} dias</dd>
          </div>
        ) : null}
      </dl>
      {s.no_full ? <p className="mt-2 text-xs text-[var(--muted)]">Enviado via Full (Mercado Envios)</p> : null}
      <p className="mt-2 text-sm text-[var(--foreground)]">{s.acao_recomendada}</p>
      {s.variacao_critica ? (
        <p className="mt-1 text-sm text-[var(--danger)]">
          {s.variacao_critica.estoque_atual <= 0 ? (
            <>
              A variação <span className="font-medium">{s.variacao_critica.nome}</span> é a que mais vende desse
              anúncio e <span className="font-medium">já esgotou</span> — reponha estoque pra voltar a vender mais,
              mesmo o estoque total do anúncio parecendo saudável.
            </>
          ) : (
            <>
              A variação <span className="font-medium">{s.variacao_critica.nome}</span> é a que mais vende desse
              anúncio e está acabando
              {s.variacao_critica.dias_ate_ruptura !== null
                ? ` (esgota em ~${s.variacao_critica.dias_ate_ruptura} dias)`
                : ""}
              {s.variacao_critica.risco === "alto" ? " — reponha com urgência" : " — vale repor em breve"}.
            </>
          )}
        </p>
      ) : null}
      {(() => {
        const membrosZerados = s.membros.filter((m) => m.estoque <= 1);
        if (membrosZerados.length === 0) return null;
        return (
          <div className="mt-2 space-y-2.5">
            {membrosZerados.map((m) => (
              <div key={m.item_id}>
                {membrosZerados.length > 1 ? (
                  <p className="text-xs text-[var(--muted)]">{m.titulo}</p>
                ) : null}
                <PausarAnuncioBotao itemId={m.item_id} />
              </div>
            ))}
          </div>
        );
      })()}
    </article>
  );
}

export function SellerGestorEstoquePanelAvulso({
  pro,
  run,
  onRodarAgora,
}: {
  pro: boolean;
  run: SellerAiRun<EstoqueAvulsoResultado> | null;
  onRodarAgora?: DispararRodada;
}) {
  const [verTodos, setVerTodos] = useState(false);

  return (
    <SellerGestorRunShell
      pro={pro}
      run={run}
      titulo="Estoque"
      ajuda={
        <p>
          Cruza o estoque disponível de cada anúncio com a velocidade de venda dos últimos 30 dias — direto da sua
          conta do Mercado Livre — pra apontar o que está perto de esgotar. Como esse pacote não controla reposição
          de estoque, a ação sugerida é sempre algo que você mesmo faz no anúncio.
        </p>
      }
      onRodarAgora={onRodarAgora}
    >
      {(resultado) => {
        const skus = resultado.skus;
        // Variação crítica entra em atenção mesmo com risco agregado "sem_risco" — é
        // exatamente o caso que o agregado esconde (soma de todas as variações parece
        // saudável, mas a que mais vende esgotou).
        const emAtencao = [...skus]
          .filter((s) => s.risco === "alto" || s.risco === "medio" || s.variacao_critica !== null)
          .sort((a, b) => {
            if (RANK_RISCO[a.risco] !== RANK_RISCO[b.risco]) return RANK_RISCO[a.risco] - RANK_RISCO[b.risco];
            return (a.dias_ate_ruptura ?? Infinity) - (b.dias_ate_ruptura ?? Infinity);
          });
        const resto = skus.filter(
          (s) => (s.risco === "sem_risco" || s.risco === "dado_insuficiente") && s.variacao_critica === null
        );

        const pausas = resultado.pausas_recentes_confirmado;

        return (
          <>
            {pausas && pausas.total_pausas_30d > 0 ? (
              <div className="mb-4 rounded-xl border border-[var(--card-border)] p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Valor real — pausas aplicadas (últimos 30 dias)
                </p>
                <p className="mt-1.5 text-sm text-[var(--foreground)]">
                  Você pausou <span className="font-semibold">{pausas.total_pausas_30d}</span> anúncio
                  {pausas.total_pausas_30d === 1 ? "" : "s"}, e{" "}
                  <span className="font-semibold">{pausas.hoje_fora_do_risco_alto}</span> já não{" "}
                  {pausas.hoje_fora_do_risco_alto === 1 ? "está" : "estão"} mais em risco alto hoje.
                </p>
              </div>
            ) : null}

            {emAtencao.length === 0 ? (
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-4 text-center text-sm text-[var(--muted)]">
                Nenhum anúncio em risco alto ou médio agora.
              </div>
            ) : (
              <div className="space-y-2.5">
                {emAtencao.map((s) => (
                  <SkuCard key={s.chave} s={s} />
                ))}
              </div>
            )}

            {resto.length > 0 ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setVerTodos((v) => !v)}
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                >
                  {verTodos ? "Ocultar" : "Ver"} os outros {resto.length} anúncios sem risco imediato
                </button>
                {verTodos ? (
                  <div className="mt-3 divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">
                    {resto.map((s) => (
                      <div
                        key={s.chave}
                        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
                      >
                        <span className="text-[var(--foreground)]">{s.nome_produto}</span>
                        <span className="text-xs text-[var(--muted)]">
                          Estoque {s.estoque_atual} · Vendas 30d {s.vendas_30d}
                        </span>
                        <RiscoBadge risco={s.risco} />
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
