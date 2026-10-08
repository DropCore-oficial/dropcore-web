"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { SellerNav } from "../../SellerNav";
import { Skeleton } from "@/components/ui/Skeleton";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY, DANGER_PREMIUM_TEXT_PRIMARY } from "@/lib/semanticPremium";
import { SellerGestorRunShell, type SellerAiRun, type DispararRodada } from "@/components/seller/SellerGestorRunShell";
import { mlItemPermalink, mlCampanhaAdsPermalink, mlPublicidadeHubPermalink } from "@/lib/mercadoLivreApiClient";

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

type UlissesResultado = {
  skus: SkuResultado[];
  destaque_atencao: string[];
  ads_gasto_total_mes: number | null;
  cupom_ativo_na_conta: boolean;
  promocoes_conta_resumo: string;
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

function SkuCard({ sku }: { sku: SkuResultado }) {
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <a
            href={mlItemPermalink(sku.item_id_representante)}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate font-medium text-[var(--foreground)] underline decoration-dotted"
          >
            {sku.nome_produto}
          </a>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Preço R$ {sku.preco.toFixed(2)} · Comissão {sku.comissao_pct}% ({sku.tipo_anuncio})
            {sku.frete_real != null ? ` · Frete R$ ${sku.frete_real.toFixed(2)}` : ""}
          </p>
        </div>
        <DiagnosticoBadge diagnostico={sku.diagnostico} />
      </div>

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
                {sku.frete_real != null ? `− R$ ${sku.frete_real.toFixed(2)}` : "sem opção de envio pro CEP de referência"}
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
            <p className="mt-2 text-xs text-[var(--muted)]">Preço mínimo seguro: R$ {sku.preco_minimo_seguro.toFixed(2)}.</p>
          ) : null}
          {sku.desconto_ativo_pct > 1 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Desconto ativo de {sku.desconto_ativo_pct.toFixed(1)}%{sku.desconto_ativo_nome ? ` (${sku.desconto_ativo_nome})` : ""}
              {sku.desconto_ativo_fim ? ` até ${sku.desconto_ativo_fim}` : ""} — preço de tabela R${" "}
              {sku.preco_original?.toFixed(2)}.
            </p>
          ) : null}
          {sku.ads_gasto_mes_real > 0 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Ads esse mês: R$ {sku.ads_gasto_mes_real.toFixed(2)} gastos · TACoS {sku.tacos_real_pct.toFixed(1)}% · ROAS{" "}
              {sku.roas_real.toFixed(1)}x.
            </p>
          ) : null}
          {sku.afiliado_pct_configurado != null ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Afiliado configurado em {sku.afiliado_pct_configurado.toFixed(1)}%
              {sku.afiliado_pct_teto_seguro != null
                ? ` — dá pra subir até ${sku.afiliado_pct_teto_seguro.toFixed(1)}% sem furar o mínimo.`
                : "."}
            </p>
          ) : null}
        </>
      )}
    </article>
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
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Criar campanha nova ↗
          </a>
        ) : null}
      </div>
    </article>
  );
}

type AbaUlisses = "margem" | "ads";

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

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

type PreferenciasForm = {
  margem_minima_pct: number;
  margem_maxima_pct: number | null;
  imposto_pct: number;
  perda_pct: number;
  ads_ativo: boolean;
  ads_tacos_pct: number | null;
  ads_teto_valor: number | null;
  ads_teto_periodo: "dia" | "mes" | null;
  afiliado_ativo: boolean;
  afiliado_pct: number | null;
  cupom_ativo: boolean;
  cupom_pct: number | null;
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-[var(--card-border)] accent-emerald-600"
      />
      {label}
    </label>
  );
}

function WizardPreferencias({
  inicial,
  onSalvo,
  onCancelar,
}: {
  inicial?: PreferenciasForm | null;
  onSalvo: () => void;
  onCancelar?: () => void;
}) {
  const [margemMinima, setMargemMinima] = useState(inicial ? String(inicial.margem_minima_pct) : "");
  const [margemMaxima, setMargemMaxima] = useState(inicial?.margem_maxima_pct != null ? String(inicial.margem_maxima_pct) : "");
  const [imposto, setImposto] = useState(inicial ? String(inicial.imposto_pct) : "");
  const [perda, setPerda] = useState(inicial ? String(inicial.perda_pct) : "");

  const [adsAtivo, setAdsAtivo] = useState(inicial?.ads_ativo ?? false);
  const [adsTacos, setAdsTacos] = useState(inicial?.ads_tacos_pct != null ? String(inicial.ads_tacos_pct) : "");
  const [adsTeto, setAdsTeto] = useState(inicial?.ads_teto_valor != null ? String(inicial.ads_teto_valor) : "");
  const [adsPeriodo, setAdsPeriodo] = useState<"dia" | "mes">(inicial?.ads_teto_periodo ?? "mes");

  const [afiliadoAtivo, setAfiliadoAtivo] = useState(inicial?.afiliado_ativo ?? false);
  const [afiliadoPct, setAfiliadoPct] = useState(inicial?.afiliado_pct != null ? String(inicial.afiliado_pct) : "");

  const [cupomAtivo, setCupomAtivo] = useState(inicial?.cupom_ativo ?? false);
  const [cupomPct, setCupomPct] = useState(inicial?.cupom_pct != null ? String(inicial.cupom_pct) : "");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const inputClass =
    "w-full h-9 rounded-md bg-[var(--surface-subtle)] border border-[var(--card-border)] px-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 placeholder:text-[var(--muted)]";
  const selectClass = `${inputClass} appearance-none`;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const margemMinimaNum = Number(margemMinima);
    if (!Number.isFinite(margemMinimaNum) || margemMinimaNum <= 0) {
      setErro("Margem mínima precisa ser maior que zero.");
      return;
    }
    setSalvando(true);
    const token = await getAccessToken();
    if (!token) {
      setErro("Sessão expirada, recarregue a página.");
      setSalvando(false);
      return;
    }
    const res = await fetch("/api/gestores-ia-avulso/ulisses/preferencias", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        margem_minima_pct: margemMinimaNum,
        margem_maxima_pct: margemMaxima === "" ? null : Number(margemMaxima),
        imposto_pct: imposto === "" ? 0 : Number(imposto),
        perda_pct: perda === "" ? 0 : Number(perda),
        ads_ativo: adsAtivo,
        ads_tacos_pct: adsTacos === "" ? null : Number(adsTacos),
        ads_teto_valor: adsTeto === "" ? null : Number(adsTeto),
        ads_teto_periodo: adsPeriodo,
        afiliado_ativo: afiliadoAtivo,
        afiliado_pct: afiliadoPct === "" ? null : Number(afiliadoPct),
        cupom_ativo: cupomAtivo,
        cupom_pct: cupomPct === "" ? null : Number(cupomPct),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) {
      setErro(json.error ?? "Erro ao salvar preferências.");
      return;
    }
    onSalvo();
  }

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
      <p className="font-medium text-[var(--foreground)]">
        {inicial ? "Editar preferências" : "Antes de começar, configure suas preferências"}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        O Ulisses só recomenda dentro da margem que você definir aqui. Pode mudar depois, quando quiser.
      </p>
      <form onSubmit={(e) => void salvar(e)} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-[var(--foreground)]">Margem mínima (%)</label>
          <input
            type="number"
            min="0.01"
            step="0.1"
            required
            value={margemMinima}
            onChange={(e) => setMargemMinima(e.target.value)}
            className={cn(inputClass, "mt-1")}
            placeholder="ex.: 15"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[var(--foreground)]">Margem máxima (%) — opcional</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={margemMaxima}
            onChange={(e) => setMargemMaxima(e.target.value)}
            className={cn(inputClass, "mt-1")}
            placeholder="ex.: 40"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[var(--foreground)]">Imposto (%)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={imposto}
            onChange={(e) => setImposto(e.target.value)}
            className={cn(inputClass, "mt-1")}
            placeholder="ex.: 6"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[var(--foreground)]">Perda estimada (%) — opcional</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={perda}
            onChange={(e) => setPerda(e.target.value)}
            className={cn(inputClass, "mt-1")}
            placeholder="ex.: 1"
          />
        </div>
        <div className="sm:col-span-2 rounded-xl border border-[var(--card-border)] p-3.5">
          <Toggle checked={adsAtivo} onChange={setAdsAtivo} label="Usar verba de ads (tráfego pago)" />
          {adsAtivo ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-[var(--foreground)]">TACoS alvo (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={adsTacos}
                  onChange={(e) => setAdsTacos(e.target.value)}
                  className={cn(inputClass, "mt-1")}
                  placeholder="ex.: 8"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--foreground)]">Teto de gasto (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={adsTeto}
                  onChange={(e) => setAdsTeto(e.target.value)}
                  className={cn(inputClass, "mt-1")}
                  placeholder="ex.: 300"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--foreground)]">Período do teto</label>
                <select
                  value={adsPeriodo}
                  onChange={(e) => setAdsPeriodo(e.target.value as "dia" | "mes")}
                  className={cn(selectClass, "mt-1")}
                >
                  <option value="dia">Por dia</option>
                  <option value="mes">Por mês</option>
                </select>
              </div>
            </div>
          ) : null}
        </div>

        <div className="sm:col-span-2 rounded-xl border border-[var(--card-border)] p-3.5">
          <Toggle checked={afiliadoAtivo} onChange={setAfiliadoAtivo} label="Trabalhar com programa de afiliados" />
          {afiliadoAtivo ? (
            <div className="mt-3 max-w-[10rem]">
              <label className="text-sm font-medium text-[var(--foreground)]">Comissão de afiliado (%)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={afiliadoPct}
                onChange={(e) => setAfiliadoPct(e.target.value)}
                className={cn(inputClass, "mt-1")}
                placeholder="ex.: 10"
              />
            </div>
          ) : null}
        </div>

        <div className="sm:col-span-2 rounded-xl border border-[var(--card-border)] p-3.5">
          <Toggle checked={cupomAtivo} onChange={setCupomAtivo} label="Trabalhar com cupom de desconto" />
          {cupomAtivo ? (
            <div className="mt-3 max-w-[10rem]">
              <label className="text-sm font-medium text-[var(--foreground)]">Cupom (%)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={cupomPct}
                onChange={(e) => setCupomPct(e.target.value)}
                className={cn(inputClass, "mt-1")}
                placeholder="ex.: 5"
              />
            </div>
          ) : null}
        </div>

        {erro ? <p className={cn("sm:col-span-2 text-sm", DANGER_PREMIUM_TEXT_PRIMARY)}>{erro}</p> : null}
        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {salvando ? "Salvando…" : "Salvar preferências"}
          </button>
          {onCancelar ? (
            <button
              type="button"
              onClick={onCancelar}
              disabled={salvando}
              className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 disabled:opacity-60"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function UlissesResultadoAbas({ resultado }: { resultado: UlissesResultado }) {
  const [aba, setAba] = useState<AbaUlisses>("margem");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <AbaBotao ativo={aba === "margem"} onClick={() => setAba("margem")}>
          MARGEM
        </AbaBotao>
        <AbaBotao ativo={aba === "ads"} onClick={() => setAba("ads")}>
          ADS &amp; CAMPANHAS
        </AbaBotao>
      </div>

      {aba === "margem" ? (
        <div className="space-y-3">
          {resultado.skus.map((s) => (
            <SkuCard key={s.chave} sku={s} />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {resultado.ads_gasto_total_mes != null || resultado.cupom_ativo_na_conta ? (
            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm">
              <p className="font-medium text-[var(--foreground)]">Visão geral da conta</p>
              <div className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                {resultado.ads_gasto_total_mes != null ? (
                  <p>Gasto total em Ads esse mês: R$ {resultado.ads_gasto_total_mes.toFixed(2)}.</p>
                ) : null}
                {resultado.cupom_ativo_na_conta ? <p>Há cupom de desconto ativo na conta.</p> : null}
              </div>
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
      )}
    </div>
  );
}

export default function UlissesAvulsoPage() {
  const router = useRouter();
  const [acesso, setAcesso] = useState<Acesso>("loading");
  const [mlConectado, setMlConectado] = useState(true);
  const [preferenciasConfiguradas, setPreferenciasConfiguradas] = useState(true);
  const [preferencias, setPreferencias] = useState<PreferenciasForm | null>(null);
  const [editandoPreferencias, setEditandoPreferencias] = useState(false);
  const [run, setRun] = useState<SellerAiRun<UlissesResultado> | null>(null);

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
    setAcesso("liberado");
  }, [router]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const dispararRodada: DispararRodada = async () => {
    const token = await getAccessToken();
    if (!token) return "Sessão expirada, faça login de novo.";
    const res = await fetch("/api/gestores-ia-avulso/ulisses/rodar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return json.error ?? "Erro ao rodar o Ulisses.";
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
                Ulisses — Ads &amp; Preço
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
              O Ulisses precisa ler seus anúncios ativos pra calcular a margem.
            </p>
            <Link
              href="/seller/gestores-ia-avulso/integracoes"
              className="mt-4 inline-flex rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              Conectar Mercado Livre
            </Link>
          </section>
        ) : !preferenciasConfiguradas ? (
          <WizardPreferencias onSalvo={() => void carregar()} />
        ) : editandoPreferencias ? (
          <WizardPreferencias
            inicial={preferencias}
            onSalvo={() => {
              setEditandoPreferencias(false);
              void carregar();
            }}
            onCancelar={() => setEditandoPreferencias(false)}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/seller/gestores-ia-avulso/ulisses/custos"
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--foreground)]">Custos dos anúncios</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Digite o custo de cada produto pra habilitar o diagnóstico de margem.
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Abrir →</span>
              </Link>

              <button
                type="button"
                onClick={() => setEditandoPreferencias(true)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 text-left transition-all hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--foreground)]">Editar preferências</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Margem mínima/máxima, imposto e perda estimada usados no cálculo.
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Editar →</span>
              </button>
            </div>

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
          </>
        )}
      </div>
      <SellerNav active="gestores_ia" calcOnly temGestoresIa />
    </div>
  );
}
