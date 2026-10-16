"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, MODAL_PANEL_BODY_CLASS } from "@/lib/modalOverlay";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "@/components/seller/SellerGestorRunShell";
import { mlItemPermalink, mlCampanhaAdsPermalink, mlPublicidadeHubPermalink } from "@/lib/mercadoLivreApiClient";
import { GestorAvulsoOrcamentoBar, type UsoTokensHoje } from "@/components/seller/GestorAvulsoOrcamentoBar";
import { SellerGestorUlissesWizard, type UlissesPreferenciasForm } from "@/components/seller/SellerGestorUlissesWizard";
import { GestorAvulsoConectarMlEmptyState } from "@/components/seller/GestorAvulsoConectarMlEmptyState";
import { IconUlisses } from "@/components/seller/GestorAvulsoIcons";
import { AbaPilula } from "@/components/seller/GestorAvulsoAbaPilula";

type Diagnostico = "sem_custo" | "margem_abaixo_minima" | "margem_saudavel" | "margem_acima_maxima";

type SkuResultado = {
  chave: string;
  item_id_representante: string;
  nome_produto: string;
  preco: number;
  custo: number | null;
  tipo_anuncio: "classico" | "premium" | "desconhecido";
  comissao_pct: number;
  frete_real: number | null;
  diagnostico: Diagnostico;
  margem_atual_pct: number | null;
  margem_minima_pct: number;
  margem_maxima_pct: number | null;
  imposto_pct: number;
  perda_pct: number;
  preco_minimo_seguro: number | null;
  permalink: string | null;
  ads_gasto_mes_real: number;
  ads_vendas_mes_real: number;
  tacos_real_pct: number;
  roas_real: number;
  afiliado_pct_configurado: number | null;
  afiliado_pct_teto_seguro: number | null;
  preco_original: number | null;
  desconto_ativo_pct: number;
  desconto_ativo_nome: string | null;
  desconto_ativo_fim: string | null;
  /** Opcional: rodada salva antes dessa feature existir não tem esses 2 campos. */
  membros?: { item_id: string; titulo: string }[];
  risco_ruptura_estoque?: "alto" | "medio" | "sem_risco" | "dado_insuficiente" | null;
};

type CampanhaResultado = {
  id: number;
  nome: string;
  status: string;
  budget: number;
  custo_mes: number;
  venda_atribuida_mes: number;
  unidades_mes: number;
  acos_real_pct: number | null;
  acos_meta_pct: number;
  diagnostico: string;
  recomendacao: string;
};

type PromocaoContaResumo = {
  tipo: string;
  nome: string | null;
  status: string;
  fim: string | null;
};

type UlissesResultado = {
  skus: SkuResultado[];
  destaque_atencao: string[];
  ads_gasto_total_mes: number | null;
  cupom_ativo_na_conta: boolean;
  /** Opcional: rodada salva antes de 2026-10-15 não tem esse campo (formato antigo era string). */
  promocoes_conta?: PromocaoContaResumo[];
  campanhas: CampanhaResultado[];
};

type Acesso = "loading" | "liberado" | "negado";

const DIAGNOSTICO_BADGE: Record<Diagnostico, string> = {
  sem_custo: "bg-[var(--muted)]/15 text-[var(--muted)]",
  margem_abaixo_minima: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  margem_saudavel: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  margem_acima_maxima: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};
const DIAGNOSTICO_LABEL: Record<Diagnostico, string> = {
  sem_custo: "Sem custo cadastrado",
  margem_abaixo_minima: "Margem abaixo do mínimo",
  margem_saudavel: "Margem saudável",
  margem_acima_maxima: "Margem acima do máximo",
};

function DiagnosticoBadge({ diagnostico }: { diagnostico: Diagnostico }) {
  return (
    <span
      className={cn(
        "inline-flex w-48 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        DIAGNOSTICO_BADGE[diagnostico]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {DIAGNOSTICO_LABEL[diagnostico]}
    </span>
  );
}

/** Linha resumo (mesmo padrão do Andrey — ver AnuncioLinha — achado 2026-10-10: com muitos
 * SKUs sinalizados, cada card já expandido inline deixava a lista enorme e "rasa" pra
 * revisar um produto de verdade). Clica e abre um modal com o detalhe completo. */
function skuObservacao(sku: SkuResultado): string {
  if (sku.diagnostico === "sem_custo") return "Sem custo cadastrado — cadastre pra calcular a margem.";
  const margem = sku.margem_atual_pct != null ? `${sku.margem_atual_pct.toFixed(1)}%` : "—";
  return `Margem atual ${margem} (mínimo ${sku.margem_minima_pct}%${sku.margem_maxima_pct != null ? `, máximo ${sku.margem_maxima_pct}%` : ""})`;
}

function SkuLinha({
  sku,
  destaque,
  onAbrir,
}: {
  sku: SkuResultado;
  destaque: boolean;
  onAbrir: (sku: SkuResultado) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(sku)}
      className="flex w-full flex-col gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-700 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium text-[var(--foreground)] sm:truncate">{sku.nome_produto}</p>
        {destaque ? (
          <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            Prioridade pra revisar primeiro
          </p>
        ) : null}
        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)] sm:truncate">{skuObservacao(sku)}</p>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
        <DiagnosticoBadge diagnostico={sku.diagnostico} />
        <svg
          className="h-4 w-4 shrink-0 text-[var(--muted)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </button>
  );
}

/** Conteúdo completo — mesmo papel de `AnuncioDiagnosticoDetalhe` do Andrey, usado dentro do
 * modal (ver `SkuLinha` acima). */
function SkuDetalhe({ sku }: { sku: SkuResultado }) {
  return (
    <div>
      <a
        href={mlItemPermalink(sku.item_id_representante)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-[var(--foreground)] underline decoration-dotted"
      >
        Ver anúncio ↗
      </a>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Preço R$ {sku.preco.toFixed(2)} · Comissão {sku.comissao_pct}% ({sku.tipo_anuncio})
        {sku.frete_real != null ? ` · Frete R$ ${sku.frete_real.toFixed(2)}` : ""}
      </p>

      {sku.diagnostico === "sem_custo" ? (
        <p className="mt-3 text-sm text-[var(--foreground)]">
          Digite o custo desse produto em{" "}
          <Link href="/seller/gestores-ia-avulso/ulisses/custos" className="font-medium text-emerald-700 underline dark:text-emerald-400">
            Custos dos anúncios
          </Link>{" "}
          pra ver a margem.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--muted)]">Preço</dt>
              <dd className="font-medium text-[var(--foreground)]">R$ {sku.preco.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Custo</dt>
              <dd className="font-medium text-[var(--foreground)]">− R$ {(sku.custo ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Frete</dt>
              <dd className="font-medium text-[var(--foreground)]">
                {sku.frete_real != null ? `− R$ ${sku.frete_real.toFixed(2)}` : "frete não disponível pra esse item agora"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Comissão {sku.comissao_pct}%</dt>
              <dd className="font-medium text-[var(--foreground)]">
                − R$ {((sku.preco * sku.comissao_pct) / 100).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Imposto {sku.imposto_pct}%</dt>
              <dd className="font-medium text-[var(--foreground)]">
                − R$ {((sku.preco * sku.imposto_pct) / 100).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Perda {sku.perda_pct}%</dt>
              <dd className="font-medium text-[var(--foreground)]">
                − R$ {((sku.preco * sku.perda_pct) / 100).toFixed(2)}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <dt className="text-xs text-[var(--muted)]">
                Margem (mínimo {sku.margem_minima_pct}%{sku.margem_maxima_pct != null ? `, máximo ${sku.margem_maxima_pct}%` : ""})
              </dt>
              <dd className="font-semibold text-[var(--foreground)]">
                = R$ {((sku.preco * (sku.margem_atual_pct ?? 0)) / 100).toFixed(2)} ({sku.margem_atual_pct?.toFixed(1)}%)
              </dd>
            </div>
          </dl>
          {sku.diagnostico === "margem_abaixo_minima" && sku.preco_minimo_seguro != null ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Preço mínimo seguro: R$ {sku.preco_minimo_seguro.toFixed(2)} — já conta embalagem, custo Full, devolução
              esperada e ACOS alvo quando você preencheu isso em preferências.
            </p>
          ) : null}
          {sku.ads_gasto_mes_real > 0 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Ads esse mês: R$ {sku.ads_gasto_mes_real.toFixed(2)} gastos · TACoS {sku.tacos_real_pct.toFixed(1)}% · ROAS{" "}
              {sku.roas_real.toFixed(1)}x.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function PromocaoRow({ item }: { item: SkuResultado }) {
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium text-[var(--foreground)]">{item.nome_produto}</p>
        <a
          href={item.permalink ?? mlItemPermalink(item.item_id_representante)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Ver anúncio ↗
        </a>
      </div>
      <p className="mt-2 text-sm text-[var(--foreground)]">
        Desconto ativo de {item.desconto_ativo_pct.toFixed(1)}%{item.desconto_ativo_nome ? ` (${item.desconto_ativo_nome})` : ""}
        {item.desconto_ativo_fim ? ` até ${item.desconto_ativo_fim}` : ""} — preço de tabela R$ {item.preco_original?.toFixed(2)},
        preço com desconto R$ {item.preco.toFixed(2)}.
      </p>
    </article>
  );
}

type PrecoEstado = "idle" | "confirmando" | "aplicando" | "aplicado" | "erro";

/** Porte do botão que já existe no hub (`AplicarPromocaoLoteBotao` em
 * `SellerGestorAdsPricingPanel.tsx`) — cria uma promoção `PRICE_DISCOUNT` real no Mercado
 * Livre (badge + prazo de 30 dias), não é só reescrever o preço. Aplica em TODOS os membros
 * da família (`item.membros`), não só no representante — mesmo achado real do botão de
 * pausar do Estoque avulso (um único item escolhido por sort não cobre a família inteira). */
function AplicarPromocaoBotao({ item, onAplicado }: { item: SkuResultado; onAplicado: (chave: string) => void }) {
  const precoSugerido = item.preco_minimo_seguro ?? 0;
  const membros = item.membros ?? [{ item_id: item.item_id_representante, titulo: item.nome_produto }];
  const [preco, setPreco] = useState(precoSugerido);
  const [estado, setEstado] = useState<PrecoEstado>("idle");
  const [resultados, setResultados] = useState<{ item_id: string; ok: boolean; erro?: string }[] | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const furaMinimo = Number.isFinite(preco) && item.preco_minimo_seguro != null && preco < item.preco_minimo_seguro;
  const rotuloQtd = membros.length === 1 ? "no 1 anúncio" : `nos ${membros.length} anúncios`;

  async function aplicar() {
    setEstado("aplicando");
    const token = await getAccessToken();
    if (!token) {
      setMensagem("Sessão expirada, faça login de novo.");
      setEstado("erro");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/ulisses/aplicar-promocao-lote", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        item_ids: membros.map((m) => m.item_id),
        preco_promocional: preco,
        confirmar_abaixo_minimo: furaMinimo,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      resultados?: { item_id: string; ok: boolean; erro?: string }[];
    };
    if (!res.ok || !json.ok) {
      setMensagem(json.error ?? "Erro ao aplicar a promoção.");
      setEstado("erro");
      return;
    }
    setResultados(json.resultados ?? []);
    setEstado("aplicado");
    onAplicado(item.chave);
  }

  if (estado === "aplicado" && resultados) {
    const sucesso = resultados.filter((r) => r.ok).length;
    return (
      <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        {sucesso}/{resultados.length} em promoção a R$ {preco.toFixed(2)} ✓
      </p>
    );
  }
  if (estado === "erro") {
    return <p className="mt-2 text-xs text-[var(--danger)]">{mensagem}</p>;
  }

  const campoPreco = (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-[var(--muted)]">R$</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={Number.isFinite(preco) ? preco : ""}
        onChange={(e) => setPreco(e.target.valueAsNumber)}
        className="w-20 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2 py-1 text-[11px] font-semibold text-[var(--foreground)]"
      />
    </div>
  );

  if (estado === "confirmando") {
    return (
      <div className="mt-2 flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {campoPreco}
          <button
            type="button"
            onClick={() => void aplicar()}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm",
              furaMinimo ? "bg-[var(--danger)] hover:opacity-90" : "bg-emerald-600 hover:bg-emerald-700"
            )}
          >
            {furaMinimo ? "Aplicar mesmo assim" : "Sim, criar promoção"}
          </button>
          <button
            type="button"
            onClick={() => setEstado("idle")}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
          >
            Cancelar
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">Cria promoção real (badge + prazo de 30 dias) {rotuloQtd}.</p>
        {furaMinimo ? (
          <p className="text-xs text-[var(--danger)]">
            Esse preço fura a margem mínima (mínimo seguro R$ {precoSugerido.toFixed(2)}).
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {campoPreco}
      <button
        type="button"
        onClick={() => setEstado("confirmando")}
        disabled={estado === "aplicando" || !Number.isFinite(preco) || preco <= 0}
        className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-60"
      >
        {estado === "aplicando" ? "Aplicando…" : "Aplicar promoção"}
      </button>
    </div>
  );
}

const RISCO_RUPTURA_LABEL: Record<string, string> = {
  alto: "Em risco de ruptura — considere repor estoque antes de promover.",
  medio: "Estoque um pouco apertado pra esse produto.",
};

/** Item sem promoção ativa, mas com folga pra entrar sem furar o mínimo — equivalente ao
 * `FamiliaSemPromocaoCard` do hub, só que já 1 linha por família (o backend avulso agrupa
 * por família direto, não precisa agrupar de novo no front). */
function SemPromocaoRow({ item, onAplicado }: { item: SkuResultado; onAplicado: (chave: string) => void }) {
  const avisoRisco = item.risco_ruptura_estoque ? RISCO_RUPTURA_LABEL[item.risco_ruptura_estoque] : null;
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium text-[var(--foreground)]">{item.nome_produto}</p>
        <a
          href={item.permalink ?? mlItemPermalink(item.item_id_representante)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Ver anúncio ↗
        </a>
      </div>
      <p className="mt-2 text-sm text-[var(--foreground)]">
        Sem promoção ativa — dá pra vender a partir de R$ {item.preco_minimo_seguro?.toFixed(2)} sem furar o mínimo
        de {item.margem_minima_pct}%.
      </p>
      {avisoRisco ? <p className="mt-1 text-xs text-[var(--danger)]">{avisoRisco}</p> : null}
      <AplicarPromocaoBotao item={item} onAplicado={onAplicado} />
    </article>
  );
}

function AfiliadoRow({ item }: { item: SkuResultado }) {
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium text-[var(--foreground)]">{item.nome_produto}</p>
        <a
          href={item.permalink ?? mlItemPermalink(item.item_id_representante)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Ver anúncio ↗
        </a>
      </div>
      <p className="mt-2 text-sm text-[var(--foreground)]">
        Afiliado em {item.afiliado_pct_configurado?.toFixed(1)}% — sua margem aguenta subir até{" "}
        <span className="font-medium">{item.afiliado_pct_teto_seguro?.toFixed(1)}%</span> sem furar o mínimo de{" "}
        {item.margem_minima_pct}%{item.margem_atual_pct != null ? ` (margem realizada hoje: ${item.margem_atual_pct.toFixed(1)}%)` : ""}.
      </p>
    </article>
  );
}

const PROMOCAO_TIPO_LABEL: Record<string, string> = {
  LIGHTNING: "Oferta Relâmpago",
  SMART: "Oferta Inteligente",
  SMART_LIGHTNING: "Relâmpago Inteligente",
  SELLER_COUPON_CAMPAIGN: "Cupom",
  SELLER_CAMPAIGN: "Campanha própria",
  DEAL: "Oferta",
  PRICE_DISCOUNT: "Desconto de preço",
};

const PROMOCAO_STATUS_LABEL: Record<string, string> = {
  started: "Ativa",
  pending: "Agendada",
  candidate: "Candidata",
  finished: "Encerrada",
};

const PROMOCAO_STATUS_BADGE: Record<string, string> = {
  started: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  candidate: "bg-[var(--muted)]/15 text-[var(--muted)]",
  finished: "bg-[var(--muted)]/15 text-[var(--muted)]",
};

/** 1 linha por campanha/promoção da conta — antes virava um parágrafo só, com tudo
 * concatenado por ";" (achado 2026-10-15, ilegível). */
function PromocaoContaLinha({ promocao }: { promocao: PromocaoContaResumo }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--card-border)] py-2 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--foreground)]">
          {promocao.nome ?? PROMOCAO_TIPO_LABEL[promocao.tipo] ?? promocao.tipo}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {PROMOCAO_TIPO_LABEL[promocao.tipo] ?? promocao.tipo}
          {promocao.fim ? ` · até ${new Date(promocao.fim).toLocaleDateString("pt-BR")}` : ""}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
          PROMOCAO_STATUS_BADGE[promocao.status] ?? "bg-[var(--muted)]/15 text-[var(--muted)]"
        )}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        {PROMOCAO_STATUS_LABEL[promocao.status] ?? promocao.status}
      </span>
    </div>
  );
}

const CAMPANHA_DIAGNOSTICO_LABEL: Record<string, string> = {
  pausada: "Pausada",
  sem_tracao_atencao: "Sem tração — atenção",
  sem_tracao_recriar: "Sem tração — recriar",
  sem_conversao: "Sem conversão",
  acima_da_meta: "ACOS acima da meta",
  validada_travar: "Validada — manter",
  performando_bem: "Performando bem",
  dentro_da_meta: "Dentro da meta",
};

const CAMPANHA_DIAGNOSTICO_BADGE: Record<string, string> = {
  pausada: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400",
  sem_tracao_atencao: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  sem_tracao_recriar: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  sem_conversao: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  acima_da_meta: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  validada_travar: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  performando_bem: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  dentro_da_meta: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300",
};

function CampanhaCard({ c }: { c: CampanhaResultado }) {
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-[var(--foreground)]">{c.nome}</p>
        <span
          className={cn(
            "inline-flex w-[12rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
            CAMPANHA_DIAGNOSTICO_BADGE[c.diagnostico] ?? "bg-[var(--muted)]/15 text-[var(--muted)]"
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          {CAMPANHA_DIAGNOSTICO_LABEL[c.diagnostico] ?? c.diagnostico}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-neutral-500">Investido no mês</dt>
          <dd className="font-medium text-[var(--foreground)]">R$ {c.custo_mes.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Venda atribuída</dt>
          <dd className="font-medium text-[var(--foreground)]">
            R$ {c.venda_atribuida_mes.toFixed(2)} · {c.unidades_mes} un.
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">ACOS real</dt>
          <dd className="font-medium text-[var(--foreground)]">
            {c.acos_real_pct != null ? `${c.acos_real_pct.toFixed(1)}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Meta de ACOS</dt>
          <dd className="font-medium text-[var(--foreground)]">{c.acos_meta_pct.toFixed(1)}%</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-[var(--foreground)]">{c.recomendacao}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={mlCampanhaAdsPermalink(c.id)}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Ver campanha ↗
        </a>
        {c.diagnostico === "sem_tracao_recriar" || c.diagnostico === "pausada" ? (
          <a
            href={mlPublicidadeHubPermalink()}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
          >
            Criar no Mercado Livre ↗
          </a>
        ) : null}
      </div>
    </article>
  );
}

type AbaUlisses = "margem" | "ads" | "promocoes" | "afiliados";

function IconCustos() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
function IconPreferencias() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.3-.9-2 3.4L6.6 11a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7.7 7.7 0 0 0 1.7 1L11 21h4l.4-2.6a7.7 7.7 0 0 0 1.7-1l2.3.9 2-3.4Z" />
    </svg>
  );
}

function abaSublinhadaClass(ativo: boolean) {
  return cn(
    "-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors touch-manipulation",
    "outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]",
    ativo
      ? "border-emerald-600 text-emerald-600 font-semibold dark:border-emerald-400 dark:text-emerald-400"
      : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
  );
}

function IconMargem() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m19 5-14 14" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}
function IconAds() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 11 18-5v12L3 13v-2z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}
function IconPromocoes() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}
function IconAfiliados() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

function UlissesResultadoAbas({ resultado }: { resultado: UlissesResultado }) {
  const [aba, setAba] = useState<AbaUlisses>("margem");
  const [chaveAberta, setChaveAberta] = useState<string | null>(null);
  // Some da lista assim que aplicado — não espera rodar de novo (achado/padrão já usado no
  // hub, ver `itemIdsAplicados` em SellerGestorAdsPricingPanel.tsx). Só filtro de exibição,
  // não recalcula margem/diagnóstico (isso é lógica de negócio, fica no servidor).
  const [chavesAplicadas, setChavesAplicadas] = useState<Set<string>>(new Set());
  const marcarAplicado = (chave: string) => setChavesAplicadas((prev) => new Set([...prev, chave]));

  const skusComAfiliado = resultado.skus.filter((s) => s.afiliado_pct_teto_seguro != null);
  const skusComPromocao = resultado.skus.filter((s) => s.desconto_ativo_pct > 1 && !chavesAplicadas.has(s.chave));
  const skusSemPromocaoElegivel = resultado.skus.filter(
    (s) =>
      s.desconto_ativo_pct <= 1 &&
      s.preco_minimo_seguro != null &&
      s.preco > s.preco_minimo_seguro &&
      !chavesAplicadas.has(s.chave)
  );
  const destaques = new Set(resultado.destaque_atencao);
  const destaqueCount = resultado.destaque_atencao.length;

  const skusOrdenados = resultado.skus
    .slice()
    .sort((a, b) => {
      const da = destaques.has(a.chave) ? 0 : 1;
      const db = destaques.has(b.chave) ? 0 : 1;
      return da - db;
    });
  const indiceAberto = chaveAberta ? skusOrdenados.findIndex((s) => s.chave === chaveAberta) : -1;
  const skuAberto = indiceAberto >= 0 ? skusOrdenados[indiceAberto] : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1 sm:flex-wrap">
        <AbaPilula ativo={aba === "margem"} onClick={() => setAba("margem")} icon={<IconMargem />}>
          Margem
        </AbaPilula>
        <AbaPilula ativo={aba === "ads"} onClick={() => setAba("ads")} icon={<IconAds />}>
          Ads
        </AbaPilula>
        <AbaPilula ativo={aba === "promocoes"} onClick={() => setAba("promocoes")} icon={<IconPromocoes />}>
          Promoções
        </AbaPilula>
        <AbaPilula ativo={aba === "afiliados"} onClick={() => setAba("afiliados")} icon={<IconAfiliados />}>
          Afiliados
        </AbaPilula>
      </div>

      {aba === "margem" ? (
        <div className="space-y-3">
          {destaqueCount > 0 ? (
            <p className="text-sm text-[var(--foreground)]">
              {destaqueCount} produto{destaqueCount > 1 ? "s" : ""} com margem abaixo do mínimo — são os marcados como
              prioridade abaixo.
            </p>
          ) : null}
          {skusOrdenados.map((s) => (
            <SkuLinha key={s.chave} sku={s} destaque={destaques.has(s.chave)} onAbrir={(sku) => setChaveAberta(sku.chave)} />
          ))}

          {skuAberto ? (
            <div
              className={cn(MODAL_OVERLAY_CLASS, "animate-fade-in-up")}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-sku-titulo"
              onClick={() => setChaveAberta(null)}
            >
              <div
                className={cn(MODAL_PANEL_CLASS, "animate-fade-in-up animate-fade-in-up-delay-1")}
                style={{ maxWidth: "48rem" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--card-border)] px-5 pb-4 pt-5">
                  <div className="min-w-0 flex-1">
                    <h2 id="modal-sku-titulo" className="min-w-0 truncate text-base font-semibold text-[var(--foreground)]">
                      {skuAberto.nome_produto}
                    </h2>
                    {destaques.has(skuAberto.chave) ? (
                      <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        Prioridade pra revisar primeiro
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <DiagnosticoBadge diagnostico={skuAberto.diagnostico} />
                    <button
                      type="button"
                      onClick={() => setChaveAberta(null)}
                      aria-label="Fechar"
                      className="-m-1 rounded p-1 text-xl leading-none text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-neutral-200"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className={cn(MODAL_PANEL_BODY_CLASS, "px-5 pb-5 pt-4")}>
                  <SkuDetalhe sku={skuAberto} />
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--card-border)] px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setChaveAberta(skusOrdenados[indiceAberto - 1].chave)}
                    disabled={indiceAberto <= 0}
                    className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs text-[var(--muted)]">
                    {indiceAberto + 1} de {skusOrdenados.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setChaveAberta(skusOrdenados[indiceAberto + 1].chave)}
                    disabled={indiceAberto >= skusOrdenados.length - 1}
                    className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Próximo →
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : aba === "ads" ? (
        <div className="space-y-5">
          <p className="text-xs text-[var(--muted)]">
            O ADS não cria nem edita nada sozinho no Mercado Livre — ele só calcula e te leva pra lá quando você
            decide agir.
          </p>
          {resultado.ads_gasto_total_mes != null ? (
            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm">
              <p className="font-medium text-[var(--foreground)]">Visão geral da conta</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Gasto total em Ads esse mês: R$ {resultado.ads_gasto_total_mes.toFixed(2)}.
              </p>
            </div>
          ) : null}

          {(resultado.campanhas ?? []).length > 0 ? (
            <div className="space-y-2">
              {(resultado.campanhas ?? []).map((c) => (
                <CampanhaCard key={c.id} c={c} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Sem campanha de Ads ativa na conta agora.</p>
          )}
        </div>
      ) : aba === "promocoes" ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm">
            <p className="font-medium text-[var(--foreground)]">Visão geral da conta</p>
            {/* `resultado` pode vir de uma rodada salva antes dessa tela mudar de formato
             * (jsonb antigo sem `promocoes_conta`) — `?? []` evita crash até a próxima
             * rodada regravar no formato novo. */}
            {(resultado.promocoes_conta ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">Nenhuma promoção ou campanha ativa na conta agora.</p>
            ) : (
              <div className="mt-1">
                {(resultado.promocoes_conta ?? []).map((p, i) => (
                  <PromocaoContaLinha key={`${p.tipo}-${p.nome ?? i}`} promocao={p} />
                ))}
              </div>
            )}
          </div>

          {skusComPromocao.length > 0 ? (
            <div className="space-y-2">
              {skusComPromocao.map((item) => (
                <PromocaoRow key={item.chave} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Nenhum anúncio com desconto ativo agora.</p>
          )}

          {skusSemPromocaoElegivel.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--muted)]">Sem promoção ativa — pode entrar sem furar a margem</p>
              {skusSemPromocaoElegivel.map((item) => (
                <SemPromocaoRow key={item.chave} item={item} onAplicado={marcarAplicado} />
              ))}
            </div>
          ) : null}
        </div>
      ) : skusComAfiliado.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nenhum SKU com folga de margem suficiente pra sugerir subir o % de afiliado agora.
        </p>
      ) : (
        <div className="space-y-2">
          {skusComAfiliado
            .slice()
            .sort((a, b) => (b.afiliado_pct_teto_seguro! - b.afiliado_pct_configurado!) - (a.afiliado_pct_teto_seguro! - a.afiliado_pct_configurado!))
            .map((item) => (
              <AfiliadoRow key={item.chave} item={item} />
            ))}
        </div>
      )}
    </div>
  );
}

function UlissesAvulsoPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [preferenciasConfiguradas, setPreferenciasConfiguradas] = useState(true);
  const [preferencias, setPreferencias] = useState<UlissesPreferenciasForm | null>(null);
  const [editandoPreferencias, setEditandoPreferencias] = useState(false);
  const [run, setRun] = useState<SellerAiRun<UlissesResultado> | null>(null);
  const [usoTokensHoje, setUsoTokensHoje] = useState<UsoTokensHoje | null>(null);
  const [bloqueadoHoje, setBloqueadoHoje] = useState(false);

  const carregar = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      router.replace("/gestores-ia/login");
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/ulisses", {
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
    setPreferenciasConfiguradas(Boolean(json.preferencias_configuradas));
    setPreferencias(json.preferencias ?? null);
    setRun(json.run ?? null);
    setUsoTokensHoje(json.uso_tokens_hoje ?? null);
    setBloqueadoHoje(json.bloqueado_hoje === true);
    setAcesso("liberado");
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (searchParams.get("editar") === "1") setEditandoPreferencias(true);
  }, [searchParams]);

  const dispararRodada: DispararRodada = async () => {
    const token = await getAccessToken();
    if (!token) return "Sessão expirada, faça login de novo.";
    const res = await fetch("/api/gestores-ia-avulso/ulisses/rodar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return json.error ?? "Erro ao rodar o ADS.";
    await carregar();
    return null;
  };

  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          {editandoPreferencias ? (
            <button
              type="button"
              onClick={() => setEditandoPreferencias(false)}
              className="text-xs font-medium text-[var(--muted)] hover:underline"
            >
              ← ADS
            </button>
          ) : (
            <Link href="/seller/gestores-ia-avulso" className="text-xs font-medium text-[var(--muted)] hover:underline">
              ← Gestor de IA
            </Link>
          )}
          <div className="mt-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                ADS
              </h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="text-sm leading-snug text-[var(--muted)]">
              Compara o preço dos seus anúncios com o custo que você digitou e avisa quando a margem está abaixo do
              mínimo — você decide se muda o preço.
            </p>
          </div>
        </header>

        <GestorAvulsoOrcamentoBar usoTokensHoje={usoTokensHoje} bloqueadoHoje={bloqueadoHoje} />

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
          <GestorAvulsoConectarMlEmptyState
            icon={<IconUlisses className="h-6 w-6 shrink-0" />}
            titulo="Conecte sua conta do Mercado Livre primeiro"
            descricao="O ADS precisa ler seus anúncios ativos pra calcular a margem."
          />
        ) : !preferenciasConfiguradas ? (
          <SellerGestorUlissesWizard
            inicial={null}
            endpoint="/api/gestores-ia-avulso/ulisses/preferencias"
            onSalvo={() => void carregar()}
            avulso
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-[var(--card-border)]">
              <Link href="/seller/gestores-ia-avulso/ulisses/custos" className={abaSublinhadaClass(false)}>
                <IconCustos />
                Custos dos anúncios
              </Link>
              <button
                type="button"
                onClick={() => setEditandoPreferencias(true)}
                className={abaSublinhadaClass(editandoPreferencias)}
              >
                <IconPreferencias />
                Editar preferências
              </button>
            </div>

            {editandoPreferencias ? (
              <SellerGestorUlissesWizard
                inicial={preferencias}
                endpoint="/api/gestores-ia-avulso/ulisses/preferencias"
                onSalvo={() => {
                  setEditandoPreferencias(false);
                  void carregar();
                }}
                onCancelar={() => setEditandoPreferencias(false)}
                avulso
              />
            ) : (
              <SellerGestorRunShell<UlissesResultado>
                pro
                run={run}
                titulo="Diagnóstico de margem"
                ajuda={
                  <p>
                    Compara o preço de cada anúncio com o custo digitado, frete real e comissão do Mercado Livre —
                    avisa quando a margem fica abaixo do mínimo ou acima do máximo que você configurou. Sem custo
                    digitado, o produto aparece como &quot;sem custo cadastrado&quot;.
                  </p>
                }
                onRodarAgora={dispararRodada}
              >
                {(resultado) => <UlissesResultadoAbas resultado={resultado} />}
              </SellerGestorRunShell>
            )}
          </>
        )}
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}

/** `useSearchParams` (lê `?editar=1`) precisa de um limite de Suspense pro Next conseguir
 * gerar a página estaticamente — sem isso o build de produção quebra (achado ao vivo no
 * deploy, `next build` local/dev não acusa isso). */
export default function UlissesAvulsoPage() {
  return (
    <Suspense fallback={null}>
      <UlissesAvulsoPageInner />
    </Suspense>
  );
}
