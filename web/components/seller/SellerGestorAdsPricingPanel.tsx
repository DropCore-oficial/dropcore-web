"use client";

import { cn } from "@/lib/utils";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "./SellerGestorRunShell";
import { mlItemPermalink } from "@/lib/mercadoLivreApiClient";
import { CopiarSugestaoBotao } from "./SellerGestorCopiarBotao";

type Diagnostico = "margem_abaixo_minima" | "margem_saudavel" | "margem_acima_maxima";

type SkuResultado = {
  sku: string;
  item_id: string;
  nome_produto: string;
  preco: number;
  custo: number;
  tipo_anuncio: "classico" | "premium" | "desconhecido";
  ads_gasto_mes_real: number;
  ads_vendas_mes_real: number;
  tacos_real_pct: number;
  roas_real: number;
  frete_real: number | null;
  margem_atual_pct: number;
  margem_minima_pct: number;
  margem_maxima_pct: number | null;
  afiliado_pct_configurado: number | null;
  afiliado_pct_teto_seguro: number | null;
  diagnostico: Diagnostico;
  recomendacao: string;
  observacao: string;
  sinalizado_rodada_anterior: boolean;
};

export type AdsPricingResultado = {
  skus: SkuResultado[];
  destaque_atencao: string[];
  ads_gasto_total_mes: number | null;
  afiliado_gasto_real_conta: number;
  roas_conta_mes: number | null;
  tacos_conta_real_mes: number | null;
  faturamento_real_mes: number;
};

const DIAGNOSTICO_BADGE: Record<Diagnostico, string> = {
  margem_abaixo_minima: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  margem_saudavel: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  margem_acima_maxima: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

const DIAGNOSTICO_LABEL: Record<Diagnostico, string> = {
  margem_abaixo_minima: "Margem abaixo do mínimo",
  margem_saudavel: "Margem saudável",
  margem_acima_maxima: "Oportunidade — margem acima do máximo",
};

const TIPO_ANUNCIO_LABEL: Record<SkuResultado["tipo_anuncio"], string> = {
  classico: "Clássico",
  premium: "Premium",
  desconhecido: "tipo não identificado",
};

function DiagnosticoBadge({ diagnostico }: { diagnostico: Diagnostico }) {
  return (
    <span
      className={cn(
        "inline-flex w-[13.5rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        DIAGNOSTICO_BADGE[diagnostico]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {DIAGNOSTICO_LABEL[diagnostico]}
    </span>
  );
}

function SkuCard({ item }: { item: SkuResultado }) {
  const copiarTexto = `${item.recomendacao}${item.observacao ? ` — ${item.observacao}` : ""}`;
  const faixa = item.margem_maxima_pct
    ? `faixa desejada ${item.margem_minima_pct}%–${item.margem_maxima_pct}%`
    : `mínimo desejado ${item.margem_minima_pct}%`;

  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-[var(--foreground)]">{item.nome_produto}</p>
          <p className="text-xs text-[var(--muted)]">
            SKU {item.sku} · anúncio {TIPO_ANUNCIO_LABEL[item.tipo_anuncio]}
          </p>
        </div>
        <DiagnosticoBadge diagnostico={item.diagnostico} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-neutral-500">Custo</dt>
          <dd className="font-medium text-[var(--foreground)]">R$ {item.custo.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Preço atual</dt>
          <dd className="font-medium text-[var(--foreground)]">R$ {item.preco.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Frete real</dt>
          <dd className="font-medium text-[var(--foreground)]">
            {item.frete_real != null ? `R$ ${item.frete_real.toFixed(2)}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Ads no mês</dt>
          <dd className="font-medium text-[var(--foreground)]">
            {item.ads_gasto_mes_real > 0
              ? `R$ ${item.ads_gasto_mes_real.toFixed(2)} · ${item.ads_vendas_mes_real} venda(s)`
              : "sem gasto"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">TACoS real</dt>
          <dd className="font-medium text-[var(--foreground)]">
            {item.ads_gasto_mes_real > 0 ? `${(item.tacos_real_pct ?? 0).toFixed(1)}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">ROAS real</dt>
          <dd className="font-medium text-[var(--foreground)]">
            {item.ads_gasto_mes_real > 0 ? `${(item.roas_real ?? 0).toFixed(2)}x` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Margem realizada</dt>
          <dd className="font-medium text-[var(--foreground)]">{item.margem_atual_pct.toFixed(1)}%</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Faixa desejada</dt>
          <dd className="font-medium text-[var(--foreground)]">{faixa}</dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-[var(--foreground)]">{item.recomendacao}</p>
      {item.observacao ? <p className="mt-1 text-xs text-[var(--muted)]">{item.observacao}</p> : null}
      {item.afiliado_pct_teto_seguro != null ? (
        <p className="mt-1 text-xs text-[var(--muted)]">
          Afiliado em {item.afiliado_pct_configurado?.toFixed(1)}% — sua margem aguenta subir até{" "}
          <span className="font-medium text-[var(--foreground)]">{item.afiliado_pct_teto_seguro.toFixed(1)}%</span>{" "}
          sem furar o mínimo de {item.margem_minima_pct}%.
        </p>
      ) : null}
      {item.sinalizado_rodada_anterior ? (
        <p className="mt-1 text-xs text-[var(--muted)]">Já sinalizado na rodada anterior.</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={mlItemPermalink(item.item_id)}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Ver anúncio ↗
        </a>
        <CopiarSugestaoBotao texto={copiarTexto} />
      </div>
    </article>
  );
}

export function SellerGestorAdsPricingPanel({
  pro,
  run,
  onRodarAgora,
}: {
  pro: boolean;
  run: SellerAiRun<AdsPricingResultado> | null;
  onRodarAgora: DispararRodada;
}) {
  return (
    <SellerGestorRunShell
      pro={pro}
      run={run}
      titulo="Ads, Preço & Promoção"
      onRodarAgora={onRodarAgora}
      ajuda={
        <p>
          O Ulisses cruza o custo real de cada produto com o preço já publicado no Mercado Livre pra
          calcular a margem que você está de fato realizando, e compara com a faixa mínima/máxima que
          você definiu. Ele só recomenda ativar ads ou cupom se você já tiver deixado essa alavanca
          ligada na configuração. Pra afiliado, quando sua margem tem folga real, ele mostra até quanto
          dá pra subir o % sem furar seu mínimo — a decisão de mudar continua sua, em &quot;Editar
          preferências&quot;, nunca aplicada sozinha.
        </p>
      }
    >
      {(resultado) => {
        if (resultado.skus.length === 0) {
          return (
            <p className="text-sm text-[var(--muted)]">
              Nenhum SKU vinculado ao Mercado Livre com custo cadastrado ainda — sem isso não dá pra
              calcular margem de verdade.
            </p>
          );
        }
        const destaque = new Set(resultado.destaque_atencao);
        const prioridade = resultado.skus.filter((s) => destaque.has(s.sku));
        const resto = resultado.skus.filter((s) => !destaque.has(s.sku));
        return (
          <div className="space-y-3">
            {resultado.ads_gasto_total_mes != null ? (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
                <p className="text-xs text-[var(--muted)]">Visão de conjunto — Ads este mês, todas as campanhas</p>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-neutral-500">Investido</dt>
                    <dd className="font-medium text-[var(--foreground)]">R$ {resultado.ads_gasto_total_mes.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">ROAS de conjunto</dt>
                    <dd className="font-medium text-[var(--foreground)]">
                      {resultado.roas_conta_mes != null ? `${resultado.roas_conta_mes.toFixed(2)}x` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">TACoS real de conjunto</dt>
                    <dd className="font-medium text-[var(--foreground)]">
                      {resultado.tacos_conta_real_mes != null ? `${resultado.tacos_conta_real_mes.toFixed(2)}%` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Faturamento real do mês</dt>
                    <dd className="font-medium text-[var(--foreground)]">R$ {resultado.faturamento_real_mes.toFixed(2)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  ROAS mede o retorno do próprio clique pago (venda atribuída ao Ads ÷ gasto). TACoS mede quanto do
                  seu faturamento REAL (pedido pago, não atribuição de Ads) virou custo de mídia paga — os dois
                  respondem perguntas diferentes, não são a mesma conta com nome trocado.
                </p>
              </div>
            ) : null}
            <p className="text-sm text-[var(--muted)]">
              Gasto real de afiliado no extrato de faturamento (checado de verdade, não estimativa):{" "}
              <span className="font-medium text-[var(--foreground)]">
                R$ {resultado.afiliado_gasto_real_conta.toFixed(2)}
              </span>
            </p>
            {prioridade.map((item) => (
              <SkuCard key={item.sku} item={item} />
            ))}
            {resto.map((item) => (
              <SkuCard key={item.sku} item={item} />
            ))}
          </div>
        );
      }}
    </SellerGestorRunShell>
  );
}
