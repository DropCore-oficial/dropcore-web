"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "./SellerGestorRunShell";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";

type DiagnosticoAnuncioResposta = {
  ok?: boolean;
  diagnostico?: {
    diagnostico: "problema_titulo" | "problema_descricao" | "caracteristicas_incompletas" | "sem_problema_aparente";
    titulo_sugerido: string;
    observacao: string;
  } | null;
  error?: string;
};

const DIAGNOSTICO_ANUNCIO_LABEL: Record<string, string> = {
  problema_titulo: "Título fraco",
  problema_descricao: "Descrição fraca",
  caracteristicas_incompletas: "Ficha técnica incompleta",
  sem_problema_aparente: "Sem problema aparente",
};

type Risco = "alto" | "medio" | "sem_risco" | "dado_insuficiente";

type SkuRisco = {
  sku: string;
  estoque_atual: number;
  vendas_30d: number;
  risco: Risco;
  acao_recomendada: string;
  dias_ate_ruptura: number | null;
  pedidos_aguardando_estoque: number;
  fornecedor_nome: string | null;
  piorou_desde_ontem: boolean;
};

export type RupturaFulfillmentResultado = { skus: SkuRisco[]; destaque_risco_alto: string[] };

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
        "inline-flex w-36 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        RISCO_BADGE[risco]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {RISCO_LABEL[risco]}
    </span>
  );
}

const itemPermalink = mlItemPermalink;

function SkuSemVendaCard({ s, mlItemId }: { s: SkuRisco; mlItemId: string }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoAnuncioResposta["diagnostico"] | null>(null);

  async function analisar() {
    setCarregando(true);
    setErro(null);
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setErro("Sessão expirada, faça login de novo.");
      setCarregando(false);
      return;
    }
    const res = await fetch("/api/seller/gestores-ia/diagnostico-anuncio", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sku: s.sku }),
    });
    const json = (await res.json().catch(() => ({}))) as DiagnosticoAnuncioResposta;
    if (!res.ok) {
      setErro(json.error ?? "Erro ao analisar o anúncio.");
      setCarregando(false);
      return;
    }
    setDiagnostico(json.diagnostico ?? null);
    setCarregando(false);
  }

  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm font-medium text-[var(--foreground)]">{s.sku}</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={itemPermalink(mlItemId)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
          >
            Ver anúncio ↗
          </a>
          {!diagnostico ? (
            <button
              type="button"
              onClick={() => void analisar()}
              disabled={carregando}
              className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {carregando ? "Analisando…" : "Analisar este anúncio"}
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-sm text-[var(--foreground)]">
        Sem venda registrada nos últimos 30 dias — pode ser o anúncio (título, fotos, descrição), não
        falta de estoque.
      </p>
      {erro ? <p className="mt-2 text-xs text-[var(--danger)]">{erro}</p> : null}
      {diagnostico ? (
        <div className="mt-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-2.5">
          <p className="text-xs font-semibold text-[var(--foreground)]">
            {DIAGNOSTICO_ANUNCIO_LABEL[diagnostico.diagnostico] ?? diagnostico.diagnostico}
          </p>
          {diagnostico.titulo_sugerido ? (
            <p className="mt-1 text-sm text-[var(--foreground)]">
              <span className="text-[var(--muted)]">Título sugerido: </span>
              {diagnostico.titulo_sugerido}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-[var(--muted)]">{diagnostico.observacao}</p>
        </div>
      ) : null}
    </article>
  );
}

type PausarEstado = "idle" | "confirmando" | "aplicando" | "aplicado" | "erro";

function PausarAnuncioBotao({ sku }: { sku: string }) {
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
    const res = await fetch("/api/seller/gestores-ia/alterar-status-anuncio", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sku, status: "paused" }),
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

function SkuCard({ s, mlItemId }: { s: SkuRisco; mlItemId?: string }) {
  return (
    <article className="rounded-xl border border-[var(--card-border)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-mono text-sm font-medium text-[var(--foreground)]">{s.sku}</p>
          {mlItemId ? (
            <a
              href={itemPermalink(mlItemId)}
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
      {s.pedidos_aguardando_estoque > 0 ? (
        <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400">
          {s.pedidos_aguardando_estoque} pedido(s) já pago(s) esperando esse estoque
        </p>
      ) : null}
      <p className="mt-2 text-sm text-[var(--foreground)]">{s.acao_recomendada}</p>
      {mlItemId && s.estoque_atual <= 1 ? <PausarAnuncioBotao sku={s.sku} /> : null}
    </article>
  );
}

export function SellerGestorEstoqueFulfillmentPanel({
  pro,
  run,
  onRodarAgora,
  skuMlMap = {},
}: {
  pro: boolean;
  run: SellerAiRun<RupturaFulfillmentResultado> | null;
  onRodarAgora?: DispararRodada;
  /** sku -> ml_item_id (seller_mercadolivre_sku_map) — habilita o link "Ver anúncio" nos SKUs sem venda. */
  skuMlMap?: Record<string, string>;
}) {
  const [verTodos, setVerTodos] = useState(false);

  return (
    <SellerGestorRunShell
      pro={pro}
      run={run}
      onRodarAgora={onRodarAgora}
      titulo="Risco de Ruptura & Fulfillment"
      ajuda={
        <p>
          Analisa seu estoque e a velocidade de venda dos últimos 30 dias pra apontar SKUs em risco de
          ruptura. Como você não controla o estoque (quem repõe é o fornecedor), as ações sugeridas são
          sempre algo que você mesmo executa no anúncio.
        </p>
      }
    >
      {(resultado) => {
        const skus = resultado.skus;
        const emAtencao = [...skus]
          .filter((s) => s.risco === "alto" || s.risco === "medio")
          .sort((a, b) => {
            if ((b.pedidos_aguardando_estoque > 0 ? 1 : 0) !== (a.pedidos_aguardando_estoque > 0 ? 1 : 0)) {
              return b.pedidos_aguardando_estoque > 0 ? 1 : -1;
            }
            if (RANK_RISCO[a.risco] !== RANK_RISCO[b.risco]) return RANK_RISCO[a.risco] - RANK_RISCO[b.risco];
            return (a.dias_ate_ruptura ?? Infinity) - (b.dias_ate_ruptura ?? Infinity);
          });
        const semVendaComAnuncio = skus.filter((s) => s.risco === "dado_insuficiente" && skuMlMap[s.sku]);
        const resto = skus.filter(
          (s) => s.risco === "sem_risco" || (s.risco === "dado_insuficiente" && !skuMlMap[s.sku])
        );

        const fornecedoresDistintos = new Set(emAtencao.map((s) => s.fornecedor_nome ?? "—"));
        const agruparPorFornecedor = fornecedoresDistintos.size > 1;

        const grupos = agruparPorFornecedor
          ? Array.from(fornecedoresDistintos).map((nome) => ({
              nome,
              itens: emAtencao.filter((s) => (s.fornecedor_nome ?? "—") === nome),
            }))
          : [{ nome: null, itens: emAtencao }];

        return (
          <>
            {emAtencao.length === 0 ? (
              <div className="rounded-xl border border-[var(--card-border)] bg-[var(--surface-subtle)] px-3 py-4 text-center text-sm text-[var(--muted)]">
                Nenhum SKU em risco alto ou médio agora.
              </div>
            ) : (
              <div className="space-y-4">
                {grupos.map((grupo) => (
                  <div key={grupo.nome ?? "unico"}>
                    {grupo.nome ? (
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Fornecedor: {grupo.nome}
                      </p>
                    ) : null}
                    <div className="space-y-2.5">
                      {grupo.itens.map((s) => (
                        <SkuCard key={s.sku} s={s} mlItemId={skuMlMap[s.sku]} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {semVendaComAnuncio.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Possível problema de anúncio, não de estoque
                </p>
                <div className="space-y-2.5">
                  {semVendaComAnuncio.map((s) => (
                    <SkuSemVendaCard key={s.sku} s={s} mlItemId={skuMlMap[s.sku]} />
                  ))}
                </div>
              </div>
            ) : null}

            {resto.length > 0 ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setVerTodos((v) => !v)}
                  className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                >
                  {verTodos ? "Ocultar" : "Ver"} os outros {resto.length} SKUs sem risco imediato
                </button>
                {verTodos ? (
                  <div className="mt-3 divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">
                    {resto.map((s) => (
                      <div
                        key={s.sku}
                        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm"
                      >
                        <span className="font-mono text-[var(--foreground)]">{s.sku}</span>
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
