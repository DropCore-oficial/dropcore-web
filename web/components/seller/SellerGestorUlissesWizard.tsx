"use client";

import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY } from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

export type UlissesPreferenciasForm = {
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
  embalagem_brl?: number;
  custo_full_brl?: number;
  devolucao_taxa_pct?: number;
  devolucao_custo_brl?: number;
  acos_alvo_pct?: number;
};

const inputClass =
  "w-full h-9 rounded-md bg-[var(--card)] border border-[var(--card-border)] px-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 placeholder:text-[var(--muted)]";
const selectClass = `${inputClass} appearance-none`;
const labelClass = "text-sm font-medium text-[var(--foreground)]";
const helpTextClass = "text-xs text-[var(--muted)]";

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

/**
 * Wizard mostrado só na primeira vez que o seller abre `/seller/gestores-ia/ulisses` (ou
 * `/seller/gestores-ia-avulso/ulisses`) sem ter preferência salva — mesmo espírito do wizard
 * guiado de Olist/Bling. Editável depois a qualquer momento pelo mesmo formulário (não é
 * "configurou uma vez e travou"), por isso `onSalvo` também serve pra reabrir e atualizar.
 * `endpoint` muda entre hub e avulso (preferência guardada em tabela diferente); unificado
 * 2026-10-11 — hub e avulso reimplementavam esse guard-rail de margem mínima cada um no seu
 * arquivo, com risco real de um ficar protegendo o seller diferente do outro.
 */
export function SellerGestorUlissesWizard({
  inicial,
  endpoint,
  onSalvo,
  onCancelar,
  avulso = false,
}: {
  inicial: Partial<UlissesPreferenciasForm> | null;
  endpoint: string;
  onSalvo: (preferencias: UlissesPreferenciasForm) => void;
  onCancelar?: () => void;
  /** Piso de preço formal (Margem) — embalagem/custo Full/devolução/ACOS alvo — só no
   * avulso por agora. O hub tem as mesmas colunas de embalagem/custo Full desde 2026-10-11
   * mas nunca ganhou a UI nem devolução/ACOS; escopo deste item era só o avulso. */
  avulso?: boolean;
}) {
  const [margemMinima, setMargemMinima] = useState(String(inicial?.margem_minima_pct ?? ""));
  const [margemMaxima, setMargemMaxima] = useState(inicial?.margem_maxima_pct != null ? String(inicial.margem_maxima_pct) : "");
  const [imposto, setImposto] = useState(inicial?.imposto_pct != null ? String(inicial.imposto_pct) : "");
  const [perda, setPerda] = useState(inicial?.perda_pct != null ? String(inicial.perda_pct) : "");

  const [adsAtivo, setAdsAtivo] = useState(inicial?.ads_ativo ?? false);
  const [adsTacos, setAdsTacos] = useState(inicial?.ads_tacos_pct != null ? String(inicial.ads_tacos_pct) : "");
  const [adsTeto, setAdsTeto] = useState(inicial?.ads_teto_valor != null ? String(inicial.ads_teto_valor) : "");
  const [adsPeriodo, setAdsPeriodo] = useState<"dia" | "mes">(inicial?.ads_teto_periodo ?? "mes");

  const [afiliadoAtivo, setAfiliadoAtivo] = useState(inicial?.afiliado_ativo ?? false);
  const [afiliadoPct, setAfiliadoPct] = useState(inicial?.afiliado_pct != null ? String(inicial.afiliado_pct) : "");

  const [cupomAtivo, setCupomAtivo] = useState(inicial?.cupom_ativo ?? false);
  const [cupomPct, setCupomPct] = useState(inicial?.cupom_pct != null ? String(inicial.cupom_pct) : "");

  const [pisoAvancadoAberto, setPisoAvancadoAberto] = useState(false);
  const [embalagemBrl, setEmbalagemBrl] = useState(inicial?.embalagem_brl != null ? String(inicial.embalagem_brl) : "");
  const [custoFullBrl, setCustoFullBrl] = useState(inicial?.custo_full_brl != null ? String(inicial.custo_full_brl) : "");
  const [devolucaoTaxaPct, setDevolucaoTaxaPct] = useState(
    inicial?.devolucao_taxa_pct != null ? String(inicial.devolucao_taxa_pct) : ""
  );
  const [devolucaoCustoBrl, setDevolucaoCustoBrl] = useState(
    inicial?.devolucao_custo_brl != null ? String(inicial.devolucao_custo_brl) : ""
  );
  const [acosAlvoPct, setAcosAlvoPct] = useState(inicial?.acos_alvo_pct != null ? String(inicial.acos_alvo_pct) : "");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    const margemMinimaNum = Number(margemMinima);
    if (!Number.isFinite(margemMinimaNum) || margemMinimaNum <= 0) {
      setErro("Margem mínima precisa ser maior que zero.");
      return;
    }

    setSalvando(true);
    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) {
      setErro("Sessão expirada, recarregue a página.");
      setSalvando(false);
      return;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
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
        ...(avulso
          ? {
              embalagem_brl: embalagemBrl === "" ? 0 : Number(embalagemBrl),
              custo_full_brl: custoFullBrl === "" ? 0 : Number(custoFullBrl),
              devolucao_taxa_pct: devolucaoTaxaPct === "" ? 0 : Number(devolucaoTaxaPct),
              devolucao_custo_brl: devolucaoCustoBrl === "" ? 0 : Number(devolucaoCustoBrl),
              acos_alvo_pct: acosAlvoPct === "" ? 0 : Number(acosAlvoPct),
            }
          : {}),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { preferencias?: UlissesPreferenciasForm; error?: string };
    setSalvando(false);
    if (!res.ok || !json.preferencias) {
      setErro(json.error ?? "Erro ao salvar preferências.");
      return;
    }
    onSalvo(json.preferencias);
  }

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
      <p className="font-medium text-[var(--foreground)]">
        {inicial ? "Editar preferências" : "Antes de começar, configure suas preferências"}
      </p>
      <p className={cn("mt-1", helpTextClass)}>
        O ADS só recomenda dentro do que você definir aqui — margem, ads, afiliado e cupom.
        Pode mudar qualquer coisa depois, quando quiser.
      </p>

      <form onSubmit={(e) => void salvar(e)} className="mt-5 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Margem mínima (%)</label>
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
            <p className={cn("mt-1", helpTextClass)}>Nunca pode ser zero — protege você de vender no prejuízo.</p>
          </div>
          <div>
            <label className={labelClass}>Margem máxima (%) — opcional</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={margemMaxima}
              onChange={(e) => setMargemMaxima(e.target.value)}
              className={cn(inputClass, "mt-1")}
              placeholder="ex.: 40"
            />
            <p className={cn("mt-1", helpTextClass)}>Acima disso, o ADS avisa que dá pra ser mais agressivo.</p>
          </div>
          <div>
            <label className={labelClass}>Imposto (%)</label>
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
            <label className={labelClass}>Perda estimada (%) — opcional</label>
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
        </div>

        <div className="rounded-xl border border-[var(--card-border)] p-3.5">
          <Toggle checked={adsAtivo} onChange={setAdsAtivo} label="Usar verba de ads (tráfego pago)" />
          {adsAtivo ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>TACoS alvo (%)</label>
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
                <label className={labelClass}>Teto de gasto (R$)</label>
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
                <label className={labelClass}>Período do teto</label>
                <div className="relative mt-1">
                  <select
                    value={adsPeriodo}
                    onChange={(e) => setAdsPeriodo(e.target.value as "dia" | "mes")}
                    className={selectClass}
                  >
                    <option value="dia">Por dia</option>
                    <option value="mes">Por mês</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--card-border)] p-3.5">
          <Toggle checked={afiliadoAtivo} onChange={setAfiliadoAtivo} label="Trabalhar com programa de afiliados" />
          {afiliadoAtivo ? (
            <div className="mt-3 max-w-[10rem]">
              <label className={labelClass}>Comissão de afiliado (%)</label>
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

        <div className="rounded-xl border border-[var(--card-border)] p-3.5">
          <Toggle checked={cupomAtivo} onChange={setCupomAtivo} label="Trabalhar com cupom de desconto" />
          {cupomAtivo ? (
            <div className="mt-3 max-w-[10rem]">
              <label className={labelClass}>Cupom (%)</label>
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

        {avulso ? (
          <div className="rounded-xl border border-[var(--card-border)] p-3.5">
            <button
              type="button"
              onClick={() => setPisoAvancadoAberto((v) => !v)}
              className="text-sm font-medium text-[var(--foreground)]"
            >
              {pisoAvancadoAberto ? "▾" : "▸"} Piso de preço avançado (embalagem, Full, devolução, ACOS) — opcional
            </button>
            <p className={cn("mt-1", helpTextClass)}>
              Deixe em branco o que não se aplica — o piso recalcula sem esses custos.
            </p>
            {pisoAvancadoAberto ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Embalagem (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={embalagemBrl}
                    onChange={(e) => setEmbalagemBrl(e.target.value)}
                    className={cn(inputClass, "mt-1")}
                    placeholder="ex.: 2,50"
                  />
                </div>
                <div>
                  <label className={labelClass}>Custo Full/armazenagem (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={custoFullBrl}
                    onChange={(e) => setCustoFullBrl(e.target.value)}
                    className={cn(inputClass, "mt-1")}
                    placeholder="ex.: 3,00"
                  />
                </div>
                <div>
                  <label className={labelClass}>Taxa de devolução esperada (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={devolucaoTaxaPct}
                    onChange={(e) => setDevolucaoTaxaPct(e.target.value)}
                    className={cn(inputClass, "mt-1")}
                    placeholder="ex.: 5"
                  />
                </div>
                <div>
                  <label className={labelClass}>Custo de cada devolução (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={devolucaoCustoBrl}
                    onChange={(e) => setDevolucaoCustoBrl(e.target.value)}
                    className={cn(inputClass, "mt-1")}
                    placeholder="ex.: 20"
                  />
                </div>
                <div>
                  <label className={labelClass}>ACOS alvo (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={acosAlvoPct}
                    onChange={(e) => setAcosAlvoPct(e.target.value)}
                    className={cn(inputClass, "mt-1")}
                    placeholder="ex.: 8"
                  />
                  <p className={cn("mt-1", helpTextClass)}>Reserva de margem pro Ads — some ao piso igual a margem mínima.</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {erro ? (
          <div className={cn("rounded-xl p-3 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>{erro}</div>
        ) : null}

        <div className="flex gap-2">
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
