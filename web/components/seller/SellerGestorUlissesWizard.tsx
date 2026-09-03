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
 * Wizard mostrado só na primeira vez que o seller abre `/seller/gestores-ia/ulisses` sem
 * ter linha em `seller_ulisses_preferencias` — mesmo espírito do wizard guiado de
 * Olist/Bling. Editável depois a qualquer momento pelo mesmo formulário (não é "configurou
 * uma vez e travou"), por isso `onSalvo` também serve pra reabrir e atualizar.
 */
export function SellerGestorUlissesWizard({
  inicial,
  onSalvo,
}: {
  inicial: Partial<UlissesPreferenciasForm> | null;
  onSalvo: (preferencias: UlissesPreferenciasForm) => void;
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

    const res = await fetch("/api/seller/gestores-ia/ulisses-preferencias", {
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
      <p className="font-medium text-[var(--foreground)]">Antes de começar, configure suas preferências</p>
      <p className={cn("mt-1", helpTextClass)}>
        O Ulisses só recomenda dentro do que você definir aqui — margem, ads, afiliado e cupom.
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
            <p className={cn("mt-1", helpTextClass)}>Acima disso, o Ulisses avisa que dá pra ser mais agressivo.</p>
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

        {erro ? (
          <div className={cn("rounded-xl p-3 text-sm", DANGER_PREMIUM_SURFACE_TRANSPARENT, DANGER_PREMIUM_TEXT_BODY)}>{erro}</div>
        ) : null}

        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar preferências"}
        </button>
      </form>
    </section>
  );
}
