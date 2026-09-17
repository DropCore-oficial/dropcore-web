"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "./SellerGestorRunShell";
import { mlItemPermalink, mlCampanhaAdsPermalink, mlPromocaoItemPermalink } from "@/lib/mercadoLivreApiClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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
  preco_original: number | null;
  desconto_ativo_pct: number;
  desconto_ativo_nome: string | null;
  desconto_ativo_fim: string | null;
  desconto_maximo_seguro_pct: number | null;
  preco_minimo_seguro: number | null;
  permalink: string | null;
  diagnostico: Diagnostico;
  recomendacao: string;
  observacao: string;
  sinalizado_rodada_anterior: boolean;
  family_id: string | null;
};

type DiagnosticoCampanha = "sem_conversao" | "acima_da_meta" | "performando_bem" | "dentro_da_meta";

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
  diagnostico: DiagnosticoCampanha;
  recomendacao: string;
};

export type AdsPricingResultado = {
  skus: SkuResultado[];
  destaque_atencao: string[];
  ads_gasto_total_mes: number | null;
  afiliado_gasto_real_conta: number;
  roas_conta_mes: number | null;
  tacos_conta_real_mes: number | null;
  faturamento_real_mes: number;
  campanhas: CampanhaResultado[];
};

const CAMPANHA_DIAGNOSTICO_BADGE: Record<DiagnosticoCampanha, string> = {
  sem_conversao: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  acima_da_meta: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  performando_bem: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  dentro_da_meta: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300",
};

const CAMPANHA_DIAGNOSTICO_LABEL: Record<DiagnosticoCampanha, string> = {
  sem_conversao: "Gastando sem converter",
  acima_da_meta: "ACOS acima da meta",
  performando_bem: "Performando bem — oportunidade",
  dentro_da_meta: "Dentro da meta",
};

function CampanhaBadge({ diagnostico }: { diagnostico: DiagnosticoCampanha }) {
  return (
    <span
      className={cn(
        "inline-flex w-[12rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
        CAMPANHA_DIAGNOSTICO_BADGE[diagnostico]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {CAMPANHA_DIAGNOSTICO_LABEL[diagnostico]}
    </span>
  );
}

function CampanhaCard({ c }: { c: CampanhaResultado }) {
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-[var(--foreground)]">{c.nome}</p>
        <CampanhaBadge diagnostico={c.diagnostico} />
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
      </div>
    </article>
  );
}

type PrecoEstado = "idle" | "confirmando" | "aplicando" | "aplicado" | "erro";

/** Preço atual abaixo do piso de margem mínima — precisa SUBIR (corrige desconto que furou
 * o mínimo). Preço atual acima do piso e sem NENHUMA promoção ativa — precisa DESCER (sugere
 * promoção nova; achado 2026-09-08, regra do Sr Stark: "todo produto tem que estar em
 * promoção"). Item com promoção ativa e margem OK não entra em nenhum dos dois — não empurra
 * pra ficar mais agressivo que a promoção que o seller já escolheu. Única fonte dessa decisão
 * (botão individual, botão em lote e resumo de família reaproveitam a mesma função). */
function direcaoAjustePreco(item: SkuResultado): "subir" | "descer" | null {
  const alvo = item.preco_minimo_seguro;
  if (alvo == null) return null;
  if (item.preco < alvo) return "subir";
  if (item.preco > alvo && item.desconto_ativo_pct <= 1) return "descer";
  return null;
}

function pendentesAjustePreco(itens: SkuResultado[]): { subir: SkuResultado[]; descer: SkuResultado[] } {
  const subir: SkuResultado[] = [];
  const descer: SkuResultado[] = [];
  for (const item of itens) {
    const direcao = direcaoAjustePreco(item);
    if (direcao === "subir") subir.push(item);
    else if (direcao === "descer") descer.push(item);
  }
  return { subir, descer };
}

/** Aplica o mesmo preço-âncora (o maior "preço mínimo seguro" do grupo) em todos os SKUs
 * do grupo de uma vez, em vez de precisar clicar item por item. Prioriza corrigir margem
 * furada (subir) quando existe; só oferece a sugestão promocional (descer) quando não há
 * ninguém precisando subir — nunca mistura as duas direções no mesmo clique. Usar o MAIOR
 * "preço mínimo seguro" entre os itens da direção escolhida garante que nenhum SKU fica com
 * margem abaixo do que ele mesmo precisa, nas duas direções (quem precisava de menos/podia
 * descer mais só sobra com folga extra). É o único botão de aplicar da família/grupo
 * (substitui o botão por SKU, inclusive grupo de 1 SKU só). */
function AplicarPrecoSeguroLoteBotao({
  itens,
  onAplicado,
}: {
  itens: SkuResultado[];
  onAplicado?: (itemIds: string[]) => void;
}) {
  // Sempre disponível pra qualquer grupo, com margem furada ou não (pedido do Sr Stark
  // 2026-09-09: "coloca pra todos") — o piso ainda protege (aviso + confirmação extra), só
  // deixou de exigir que exista um problema pra aplicar preço no grupo inteiro.
  const pisosValidos = itens.map((item) => item.preco_minimo_seguro).filter((p): p is number => p != null);
  const precoSugerido = pisosValidos.length > 0 ? Math.max(...pisosValidos) : 0;
  const margemMinimaPct = itens[0]?.margem_minima_pct;
  const [preco, setPreco] = useState(precoSugerido);
  const [estado, setEstado] = useState<PrecoEstado>("idle");
  const [resultados, setResultados] = useState<{ item_id: string; ok: boolean; erro?: string }[] | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  if (pisosValidos.length < 1) return null;
  const furaMinimo = Number.isFinite(preco) && preco < precoSugerido;
  const rotuloQtd = itens.length === 1 ? "no 1 SKU" : `nos ${itens.length} SKUs`;

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
    const res = await fetch("/api/seller/gestores-ia/ulisses-aplicar-preco-seguro-lote", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        item_ids: itens.map((item) => item.item_id),
        preco_novo: preco,
        confirmar_abaixo_minimo: furaMinimo,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      resultados?: { item_id: string; ok: boolean; erro?: string }[];
    };
    if (!res.ok || !json.ok) {
      setMensagem(json.error ?? "Erro ao aplicar o preço em lote.");
      setEstado("erro");
      return;
    }
    setResultados(json.resultados ?? []);
    setEstado("aplicado");
    onAplicado?.((json.resultados ?? []).filter((r) => r.ok).map((r) => r.item_id));
  }

  if (estado === "aplicado" && resultados) {
    const sucesso = resultados.filter((r) => r.ok).length;
    const falhas = resultados.filter((r) => !r.ok);
    return (
      <p className="text-xs text-[var(--muted)]">
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
          {sucesso}/{resultados.length} aplicados pra R$ {preco.toFixed(2)} ✓
        </span>
        {falhas.length > 0 ? (
          <>
            {" — falharam: "}
            {falhas.map((f) => f.item_id).join(", ")}
          </>
        ) : null}
      </p>
    );
  }
  if (estado === "erro") {
    return <p className="text-xs text-[var(--danger)]">{mensagem}</p>;
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
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {campoPreco}
          <button
            type="button"
            onClick={() => void aplicar()}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm",
              furaMinimo ? "bg-[var(--danger)] hover:opacity-90" : "bg-emerald-600 hover:bg-emerald-700"
            )}
          >
            {furaMinimo ? "Aplicar mesmo assim" : "Sim, aplicar em todos"}
          </button>
          <button
            type="button"
            onClick={() => setEstado("idle")}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
          >
            Cancelar
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">Aplica {rotuloQtd} deste grupo agora.</p>
        {furaMinimo ? (
          <p className="text-xs text-[var(--danger)]">
            Esse preço fura a margem mínima de {margemMinimaPct}% (mínimo seguro R$ {precoSugerido.toFixed(2)}).
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {campoPreco}
      <button
        type="button"
        onClick={() => setEstado("confirmando")}
        disabled={estado === "aplicando" || !Number.isFinite(preco) || preco <= 0}
        className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-60"
      >
        {estado === "aplicando" ? "Aplicando…" : `Aplicar preço seguro (${itens.length} SKU${itens.length > 1 ? "s" : ""})`}
      </button>
    </div>
  );
}

/** Inscreve o grupo numa promoção `PRICE_DISCOUNT` de verdade (não é o mesmo endpoint/efeito
 * do `AplicarPrecoSeguroLoteBotao` — aqui cria uma promoção real no ML, com badge/prazo/
 * "de-por", ver comentário em `mlCriarPromocaoPrecoDesconto`). Preço vem pré-preenchido com o
 * "mínimo seguro" sugerido mas é editável — pedido do Sr Stark (2026-09-08): dar liberdade
 * pro seller escolher outro valor. Quando o valor digitado fura a margem mínima, mostra o
 * aviso e exige confirmar de novo com o rótulo "mesmo assim" antes de escrever (sem travar a
 * decisão, mas nunca em silêncio). */
function AplicarPromocaoLoteBotao({
  itens,
  onAplicado,
}: {
  itens: SkuResultado[];
  onAplicado?: (itemIds: string[]) => void;
}) {
  const precoSugerido = Math.max(...itens.map((item) => item.preco_minimo_seguro as number));
  const margemMinimaPct = itens[0]?.margem_minima_pct;
  const [preco, setPreco] = useState(precoSugerido);
  const [estado, setEstado] = useState<PrecoEstado>("idle");
  const [resultados, setResultados] = useState<{ item_id: string; ok: boolean; erro?: string }[] | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const furaMinimo = Number.isFinite(preco) && preco < precoSugerido;
  const rotuloQtd = itens.length === 1 ? "no 1 SKU" : `nos ${itens.length} SKUs`;

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
    const res = await fetch("/api/seller/gestores-ia/ulisses-aplicar-promocao-lote", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        item_ids: itens.map((item) => item.item_id),
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
      setMensagem(json.error ?? "Erro ao aplicar a promoção em lote.");
      setEstado("erro");
      return;
    }
    setResultados(json.resultados ?? []);
    setEstado("aplicado");
    onAplicado?.((json.resultados ?? []).filter((r) => r.ok).map((r) => r.item_id));
  }

  if (estado === "aplicado" && resultados) {
    const sucesso = resultados.filter((r) => r.ok).length;
    const falhas = resultados.filter((r) => !r.ok);
    return (
      <p className="text-xs text-[var(--muted)]">
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
          {sucesso}/{resultados.length} em promoção a R$ {preco.toFixed(2)} ✓
        </span>
        {falhas.length > 0 ? (
          <>
            {" — falharam: "}
            {falhas.map((f) => f.item_id).join(", ")}
          </>
        ) : null}
      </p>
    );
  }
  if (estado === "erro") {
    return <p className="text-xs text-[var(--danger)]">{mensagem}</p>;
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
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-2">
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
            Esse preço fura a margem mínima de {margemMinimaPct}% (mínimo seguro R$ {precoSugerido.toFixed(2)}).
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {campoPreco}
      <button
        type="button"
        onClick={() => setEstado("confirmando")}
        disabled={estado === "aplicando" || !Number.isFinite(preco) || preco <= 0}
        className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-60"
      >
        {estado === "aplicando" ? "Aplicando…" : `Aplicar preço promocional (${itens.length} SKU${itens.length > 1 ? "s" : ""})`}
      </button>
    </div>
  );
}

type LightningCandidato = {
  item_id: string;
  deal_id: string;
  sku: string;
  nome_produto: string;
  custo: number;
  frete_real: number | null;
  preco_original: number;
  preco_sugerido: number;
  estoque_max: number;
  margem_resultante_pct: number;
  margem_minima_pct: number;
  recomendacao: "aceitar" | "recusar";
  permalink: string | null;
};

async function decidirLightning(
  itemIds: string[],
  acao: "aceitar" | "recusar",
  confirmarAbaixoMinimo: boolean
): Promise<{ ok: boolean; error?: string; requerConfirmacao?: boolean; resultados?: { item_id: string; ok: boolean; erro?: string }[] }> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  if (!session?.access_token) return { ok: false, error: "Sessão expirada, faça login de novo." };
  const res = await fetch("/api/seller/gestores-ia/ulisses-lightning-decidir", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ item_ids: itemIds, acao, confirmar_abaixo_minimo: confirmarAbaixoMinimo }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    requer_confirmacao?: boolean;
    resultados?: { item_id: string; ok: boolean; erro?: string }[];
  };
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error ?? "Erro ao decidir sobre o candidato.", requerConfirmacao: json.requer_confirmacao };
  }
  return { ok: true, resultados: json.resultados };
}

type LightningEstado = "idle" | "confirmando" | "enviando" | "erro";

/** Linha de 1 candidato de Oferta Relâmpago — preço não é editável (o ML já sugeriu, só dá
 * pra aceitar ou recusar), diferente das outras promoções do Ulisses. */
function LightningCandidatoCard({
  c,
  onDecidido,
}: {
  c: LightningCandidato;
  onDecidido: (itemId: string) => void;
}) {
  const [estado, setEstado] = useState<LightningEstado>("idle");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const furaMinimo = c.recomendacao === "recusar";
  const descontoPct = ((c.preco_original - c.preco_sugerido) / c.preco_original) * 100;

  async function decidir(acao: "aceitar" | "recusar", confirmar: boolean) {
    setEstado("enviando");
    const resultado = await decidirLightning([c.item_id], acao, confirmar);
    if (!resultado.ok) {
      if (resultado.requerConfirmacao) {
        setEstado("confirmando");
        return;
      }
      setMensagem(resultado.error ?? "Erro.");
      setEstado("erro");
      return;
    }
    onDecidido(c.item_id);
  }

  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <a
            href={c.permalink ?? mlItemPermalink(c.item_id)}
            target="_blank"
            rel="noreferrer"
            className="truncate font-medium text-[var(--foreground)] hover:underline"
          >
            {c.nome_produto} ↗
          </a>
          <p className="text-xs text-[var(--muted)]">SKU {c.sku}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium",
            furaMinimo
              ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          {furaMinimo ? "Fura margem mínima" : "Margem OK"}
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--foreground)]">
        R$ {c.preco_original.toFixed(2)} → <span className="font-medium">R$ {c.preco_sugerido.toFixed(2)}</span> (
        {descontoPct.toFixed(0)}% off, preço fixado pelo ML) · margem resultante{" "}
        <span className="font-medium">{c.margem_resultante_pct.toFixed(1)}%</span> (mínima {c.margem_minima_pct}%) ·
        até {c.estoque_max} un.
      </p>
      {estado === "erro" ? <p className="mt-2 text-xs text-[var(--danger)]">{mensagem}</p> : null}
      {estado === "confirmando" ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-xs text-[var(--danger)]">Esse preço fura sua margem mínima. Aceitar mesmo assim?</p>
          <button
            type="button"
            onClick={() => void decidir("aceitar", true)}
            className="rounded-md bg-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90"
          >
            Aceitar mesmo assim
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
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void decidir("recusar", false)}
            disabled={estado === "enviando"}
            className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-60"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => void decidir("aceitar", false)}
            disabled={estado === "enviando"}
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {estado === "enviando" ? "Enviando…" : "Aceitar"}
          </button>
        </div>
      )}
    </article>
  );
}

/** Botão de aceitar em lote só os candidatos que a própria conta recomenda (margem OK) —
 * os que furam mínimo ficam de fora do lote de propósito, precisam de confirmação individual
 * (ver LightningCandidatoCard). */
function AceitarRecomendadosLoteBotao({
  candidatos,
  onDecididos,
}: {
  candidatos: LightningCandidato[];
  onDecididos: (itemIds: string[]) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const recomendados = candidatos.filter((c) => c.recomendacao === "aceitar");
  if (recomendados.length === 0) return null;

  async function aceitarTodos() {
    setEnviando(true);
    setMensagem(null);
    const resultado = await decidirLightning(recomendados.map((c) => c.item_id), "aceitar", false);
    setEnviando(false);
    if (!resultado.ok) {
      setMensagem(resultado.error ?? "Erro ao aceitar em lote.");
      return;
    }
    onDecididos((resultado.resultados ?? []).filter((r) => r.ok).map((r) => r.item_id));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void aceitarTodos()}
        disabled={enviando}
        className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {enviando ? "Aceitando…" : `Aceitar todos recomendados (${recomendados.length})`}
      </button>
      {mensagem ? <p className="text-xs text-[var(--danger)]">{mensagem}</p> : null}
    </div>
  );
}

/** Bucket próprio no topo da aba Promoções — diferente dos outros grupos, tem prazo real (o
 * candidato expira sozinho) e não faz parte do resultado salvo da rodada (`seller_ai_runs`):
 * busca direto, toda vez que a aba abre, sem custo de IA nem cooldown (ver rota GET). */
function LightningCandidatosSection() {
  const [candidatos, setCandidatos] = useState<LightningCandidato[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [decididos, setDecididos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/seller/gestores-ia/ulisses-lightning-candidatos", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { candidatos?: LightningCandidato[]; error?: string };
      if (cancelado) return;
      if (!res.ok) {
        setErro(json.error ?? "Erro ao buscar candidatos de oferta relâmpago.");
        return;
      }
      setCandidatos(json.candidatos ?? []);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const marcarDecididos = (itemIds: string[]) => setDecididos((prev) => new Set([...prev, ...itemIds]));

  if (erro) return null; // silencioso — feature nova, não trava o resto da tela se a API falhar
  if (!candidatos || candidatos.length === 0) return null;

  const visiveis = candidatos.filter((c) => !decididos.has(c.item_id));
  if (visiveis.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          Oferta Relâmpago — {visiveis.length} candidato{visiveis.length > 1 ? "s" : ""} pendente
          {visiveis.length > 1 ? "s" : ""} (o Mercado Livre escolhe o item e o preço; você só decide aceitar ou não)
        </p>
        <AceitarRecomendadosLoteBotao candidatos={visiveis} onDecididos={marcarDecididos} />
      </div>
      {visiveis.map((c) => (
        <LightningCandidatoCard key={c.item_id} c={c} onDecidido={(itemId) => marcarDecididos([itemId])} />
      ))}
    </div>
  );
}

/** Frase única no topo do card de grupo, no lugar de repetir o mesmo texto de diagnóstico
 * em cada SKU (achado 2026-09-06: eram 8+ cards idênticos, só o SKU mudava). */
function resumoGrupoPromocao(itens: SkuResultado[]): string {
  const pendentes = itens.filter((item) => item.preco_minimo_seguro != null && item.preco < item.preco_minimo_seguro);
  if (pendentes.length === 0) return "Margem OK em todos os SKUs deste grupo — nenhum ajuste de preço necessário agora.";
  const precoAlvo = Math.max(...pendentes.map((item) => item.preco_minimo_seguro as number));
  const margemMinima = itens[0]?.margem_minima_pct;
  return `${pendentes.length} de ${itens.length} SKU${itens.length > 1 ? "s" : ""} com margem abaixo do mínimo por causa desse desconto — pra manter a margem mínima de ${margemMinima}%, o preço precisa subir pra R$ ${precoAlvo.toFixed(2)} (o maior entre os que precisam, nenhum fica com margem furada).`;
}

/** Linha de 1 só por SKU — nome/badge/TACoS/ROAS saíram (o resumo do grupo já diz o que é
 * comum a todos; detalhe completo fica a 1 clique em "Ver anúncio"). O SKU em si já é o link
 * do anúncio, então não precisa de um botão "Ver anúncio" separado. */
function SkuPromocaoRow({ item }: { item: SkuResultado }) {
  const precisaAjuste = direcaoAjustePreco(item) != null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--card-border)] py-2 text-sm first:border-t-0">
      <a
        href={item.permalink ?? mlItemPermalink(item.item_id)}
        target="_blank"
        rel="noreferrer"
        title={item.nome_produto}
        className="min-w-0 truncate font-medium text-[var(--foreground)] hover:underline"
      >
        SKU {item.sku} ↗
      </a>
      <span className="text-[var(--muted)]">
        R$ {item.preco.toFixed(2)}
        {precisaAjuste ? ` → R$ ${item.preco_minimo_seguro?.toFixed(2)}` : ""} · margem{" "}
        {item.margem_atual_pct.toFixed(1)}%
      </span>
    </div>
  );
}

/** Resumo do bucket "Sem desconto ativo" agrupado por família (mesmo produto, variações de
 * tamanho/cor cadastradas como SKU/anúncio separado no ML) — mesma ideia de
 * `resumoGrupoPromocao`, mas cobrindo as duas direções (subir margem furada ou descer pra
 * sugestão promocional, nunca as duas juntas — ver `AplicarPrecoSeguroLoteBotao`). */
function resumoFamiliaSemPromocao(itens: SkuResultado[]): string {
  const { subir, descer } = pendentesAjustePreco(itens);
  const margemMinima = itens[0]?.margem_minima_pct;
  const rotuloQtd = `${itens.length} SKU${itens.length > 1 ? "s" : ""}`;
  if (subir.length > 0) {
    const precoAlvo = Math.max(...subir.map((item) => item.preco_minimo_seguro as number));
    return `${subir.length} de ${itens.length} SKU${itens.length > 1 ? "s" : ""} com margem abaixo do mínimo — pra manter a margem mínima de ${margemMinima}%, o preço precisa subir pra R$ ${precoAlvo.toFixed(2)}.`;
  }
  if (descer.length > 0) {
    const precoAlvo = Math.max(...descer.map((item) => item.preco_minimo_seguro as number));
    return `Sem nenhuma promoção ativa (${rotuloQtd}) — dá pra vender a partir de R$ ${precoAlvo.toFixed(2)} sem furar o mínimo de ${margemMinima}%.`;
  }
  return `Margem OK em todos os SKUs deste grupo (${rotuloQtd}) — nenhum ajuste de preço necessário agora.`;
}

/** Card de grupo fechado por padrão — só o "pai" (nome da promoção, contagem, botão de
 * aplicar em lote) fica visível; os SKUs (o "filho") só aparecem clicando pra abrir. Botão
 * de aplicar em lote fica fora do `<button>` do toggle (não dá pra aninhar botão dentro de
 * botão em HTML), então continua clicável mesmo com o card fechado. */
function GrupoPromocaoCard({
  chave,
  fim,
  itens,
  onAplicado,
}: {
  chave: string;
  fim: string | null;
  itens: SkuResultado[];
  onAplicado: (itemIds: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium text-[var(--foreground)]"
        >
          <span className={cn("inline-block transition-transform", aberto && "rotate-90")} aria-hidden>
            ▶
          </span>
          {chave}
          {fim ? ` até ${fim}` : ""} — {itens.length} SKU{itens.length > 1 ? "s" : ""} afetado
          {itens.length > 1 ? "s" : ""}
        </button>
        <div className="flex items-center gap-3">
          <a
            href={mlPromocaoItemPermalink(itens[0].item_id)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--muted)] hover:underline"
          >
            Ver promoção ↗
          </a>
          <AplicarPrecoSeguroLoteBotao itens={itens} onAplicado={onAplicado} />
        </div>
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">{resumoGrupoPromocao(itens)}</p>
      {aberto ? (
        <div className="mt-1">
          {itens.map((item) => (
            <SkuPromocaoRow key={item.sku} item={item} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

/** Agrupa por família do ML (`family_id` — variações de tamanho/cor do mesmo produto que o
 * seller cadastrou como SKU/anúncio separado), fallback pro próprio item_id quando o anúncio
 * é isolado — mesma convenção já usada pelo Andrey (`agruparPorFamilia` em
 * gestorAnunciosSeoDados.ts). Achado real 2026-09-08: um produto só (mesmo custo/frete/Ads)
 * aparecia como 15+ cards idênticos, um por tamanho. */
function agruparPorFamilia(itens: SkuResultado[]): { chave: string; itens: SkuResultado[] }[] {
  const grupos = new Map<string, SkuResultado[]>();
  for (const item of itens) {
    const chave = item.family_id ?? item.item_id;
    const lista = grupos.get(chave) ?? [];
    lista.push(item);
    grupos.set(chave, lista);
  }
  return Array.from(grupos.entries()).map(([chave, itens]) => ({ chave, itens }));
}

/** Card de família fechado por padrão, mesmo padrão visual/interativo do `GrupoPromocaoCard`
 * (só o resumo agregado fica visível; SKUs só aparecem ao abrir) — cobre o bucket "Sem
 * desconto ativo" inteiro, com um único botão de aplicar por família (nunca por SKU). */
function FamiliaSemPromocaoCard({
  itens,
  onAplicado,
}: {
  itens: SkuResultado[];
  onAplicado: (itemIds: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const nomeProduto = itens[0]?.nome_produto ?? "";
  const { subir, descer } = pendentesAjustePreco(itens);
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium text-[var(--foreground)]"
        >
          <span className={cn("inline-block shrink-0 transition-transform", aberto && "rotate-90")} aria-hidden>
            ▶
          </span>
          <span className="truncate">{nomeProduto}</span>
          <span className="shrink-0 text-[var(--muted)]">
            — {itens.length} SKU{itens.length > 1 ? "s" : ""}
          </span>
        </button>
        {subir.length > 0 ? (
          <AplicarPrecoSeguroLoteBotao itens={itens} onAplicado={onAplicado} />
        ) : descer.length > 0 ? (
          <AplicarPromocaoLoteBotao itens={descer} onAplicado={onAplicado} />
        ) : null}
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">{resumoFamiliaSemPromocao(itens)}</p>
      {aberto ? (
        <div className="mt-1">
          {itens.map((item) => (
            <SkuPromocaoRow key={item.sku} item={item} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function AfiliadoRow({ item }: { item: SkuResultado }) {
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-[var(--foreground)]">{item.nome_produto}</p>
          <p className="text-xs text-[var(--muted)]">SKU {item.sku}</p>
        </div>
        <a
          href={item.permalink ?? mlItemPermalink(item.item_id)}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Ver anúncio ↗
        </a>
      </div>
      <p className="mt-2 text-sm text-[var(--foreground)]">
        Afiliado em {item.afiliado_pct_configurado?.toFixed(1)}% — sua margem aguenta subir até{" "}
        <span className="font-medium">{item.afiliado_pct_teto_seguro?.toFixed(1)}%</span> sem furar o mínimo de{" "}
        {item.margem_minima_pct}% (margem realizada hoje: {item.margem_atual_pct.toFixed(1)}%).
      </p>
    </article>
  );
}

/** 1 grupo por promoção ativa (mesmo nome/campanha), pior margem primeiro dentro do grupo
 * — preserva a ordem em que os SKUs já chegam (server já ordena pior margem primeiro), só
 * agrupa por causa em vez de repetir a mesma campanha em N cards soltos. SKUs sem desconto
 * ativo caem no grupo `null` ("Sem desconto ativo"), sempre por último. */
function agruparPorPromocao(skus: SkuResultado[]): { chave: string | null; fim: string | null; itens: SkuResultado[] }[] {
  const grupos = new Map<string | null, { fim: string | null; itens: SkuResultado[] }>();
  for (const item of skus) {
    const chave = item.desconto_ativo_pct > 1 ? (item.desconto_ativo_nome ?? "Desconto ativo") : null;
    const grupo = grupos.get(chave) ?? { fim: item.desconto_ativo_fim, itens: [] };
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }
  const semDesconto = grupos.get(null);
  grupos.delete(null);
  const ordenados = Array.from(grupos.entries()).map(([chave, g]) => ({ chave, fim: g.fim, itens: g.itens }));
  if (semDesconto) ordenados.push({ chave: null, fim: null, itens: semDesconto.itens });
  return ordenados;
}

type AbaUlisses = "ads" | "promocoes" | "afiliados";

function AbaBotao({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition-colors touch-manipulation whitespace-nowrap",
        "outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]",
        ativo
          ? "border-emerald-600 bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
          : "border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--muted)]/10 hover:text-[var(--foreground)]"
      )}
    >
      {children}
    </button>
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
  const [aba, setAba] = useState<AbaUlisses>("ads");
  // Some da lista assim que aplicado — não espera rodar de novo (custaria crédito à toa
  // pra um dado que a gente já sabe que ficou certo). Só client-side/sessão, não mexe em
  // resultado.skus nem recalcula margem/diagnóstico (isso é lógica de negócio, fica no
  // servidor); é só um filtro de exibição.
  const [itemIdsAplicados, setItemIdsAplicados] = useState<Set<string>>(new Set());
  const marcarAplicado = (itemIds: string[]) =>
    setItemIdsAplicados((prev) => new Set([...prev, ...itemIds]));

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
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <AbaBotao ativo={aba === "ads"} onClick={() => setAba("ads")}>
                ADS
              </AbaBotao>
              <AbaBotao ativo={aba === "promocoes"} onClick={() => setAba("promocoes")}>
                PROMOÇÕES
              </AbaBotao>
              <AbaBotao ativo={aba === "afiliados"} onClick={() => setAba("afiliados")}>
                AFILIADOS
              </AbaBotao>
            </div>

            {aba === "ads" ? (
              <>
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
                        <dd className="font-medium text-[var(--foreground)]">
                          R$ {(resultado.faturamento_real_mes ?? 0).toFixed(2)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      ROAS mede o retorno do próprio clique pago (venda atribuída ao Ads ÷ gasto). TACoS mede quanto do
                      seu faturamento REAL (pedido pago, não atribuição de Ads) virou custo de mídia paga — os dois
                      respondem perguntas diferentes, não são a mesma conta com nome trocado.
                    </p>
                  </div>
                ) : null}
                {(resultado.campanhas ?? []).length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--muted)]">Por campanha — pior gasto primeiro</p>
                    {resultado.campanhas.map((c) => (
                      <CampanhaCard key={c.id} c={c} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted)]">Sem campanha de Ads ativa na conta agora.</p>
                )}
              </>
            ) : aba === "promocoes" ? (
              <>
                <LightningCandidatosSection />
                {agruparPorPromocao(resultado.skus.filter((s) => !itemIdsAplicados.has(s.item_id))).map((grupo) =>
                  grupo.itens.length === 0 ? null : grupo.chave ? (
                    <GrupoPromocaoCard
                      key={grupo.chave}
                      chave={grupo.chave}
                      fim={grupo.fim}
                      itens={grupo.itens}
                      onAplicado={marcarAplicado}
                    />
                  ) : (
                    <div key="sem-desconto" className="space-y-2">
                      <p className="text-xs text-[var(--muted)]">Sem desconto ativo</p>
                      {agruparPorFamilia(grupo.itens).map((familia) => (
                        <FamiliaSemPromocaoCard key={familia.chave} itens={familia.itens} onAplicado={marcarAplicado} />
                      ))}
                    </div>
                  )
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--muted)]">
                  Gasto real de afiliado no extrato de faturamento (checado de verdade, não estimativa):{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    R$ {resultado.afiliado_gasto_real_conta.toFixed(2)}
                  </span>
                </p>
                {resultado.skus.filter((s) => s.afiliado_pct_teto_seguro != null).length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Nenhum SKU com folga de margem suficiente pra sugerir subir o % de afiliado agora.
                  </p>
                ) : (
                  resultado.skus
                    .filter((s) => s.afiliado_pct_teto_seguro != null)
                    .map((item) => <AfiliadoRow key={item.sku} item={item} />)
                )}
              </>
            )}
          </div>
        );
      }}
    </SellerGestorRunShell>
  );
}
