"use client";

import { useState, useMemo } from "react";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type ChartDataPoint = {
  label: string;
  valor: number;
  count: number;
};

type AnalyticsChartProps = {
  mode: "hoje" | "dias";
  data: ChartDataPoint[];
  valorTotal: number;
  totalPedidos: number;
  valorAnterior?: number;
  pedidosAnteriores?: number;
  onModeChange: (mode: "hoje" | "dias") => void;
  onPeriodChange?: (dias: number) => void;
  periodDias?: number;
  valorLabel?: string;
  pedidosLabel?: string;
  emptyMessage?: string;
  emptyCta?: { label: string; onClick: () => void };
};

export function AnalyticsChart({
  mode,
  data,
  valorTotal,
  totalPedidos,
  valorAnterior,
  pedidosAnteriores,
  onModeChange,
  onPeriodChange,
  periodDias = 14,
  valorLabel = "Valor de Vendas Válidas",
  pedidosLabel = "Pedidos Válidos",
  emptyMessage = "Sem movimentações neste período",
  emptyCta,
}: AnalyticsChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const valorPct = useMemo(() => {
    if (valorAnterior == null || valorAnterior === 0) return null;
    return ((valorTotal - valorAnterior) / valorAnterior) * 100;
  }, [valorTotal, valorAnterior]);

  const pedidosPct = useMemo(() => {
    if (pedidosAnteriores == null || pedidosAnteriores === 0) return null;
    return ((totalPedidos - pedidosAnteriores) / pedidosAnteriores) * 100;
  }, [totalPedidos, pedidosAnteriores]);

  const chartMaxValor = Math.max(...data.map((d) => d.valor), 1);
  const chartMaxCount = Math.max(...data.map((d) => d.count), 1);
  const barMaxH = 88;

  const temDados = data.some((d) => d.valor > 0 || d.count > 0);

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
      {/* Header: KPIs + Filtros */}
      <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-4">
          <div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{valorLabel}</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
                {BRL.format(valorTotal)}
              </p>
              {valorPct != null && (
                <span
                  className={`text-xs font-medium ${
                    valorPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                  }`}
                >
                  {valorPct >= 0 ? "+" : ""}
                  {valorPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{pedidosLabel}</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{totalPedidos}</p>
              {pedidosPct != null && (
                <span
                  className={`text-xs font-medium ${
                    pedidosPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                  }`}
                >
                  {pedidosPct >= 0 ? "+" : ""}
                  {pedidosPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onModeChange("hoje")}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              mode === "hoje"
                ? "bg-emerald-600 text-white"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            Vendas de Hoje
          </button>
          <button
            type="button"
            onClick={() => onModeChange("dias")}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              mode === "dias"
                ? "bg-emerald-600 text-white"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            Últimos {periodDias} dias
          </button>
          {mode === "dias" && onPeriodChange && (
            <>
              {([7, 14, 30, 60, 90, 120] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onPeriodChange(n)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    periodDias === n
                      ? "bg-emerald-600 text-white"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  }`}
                >
                  {n}d
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        {!temDados ? (
          <div className="text-center py-10">
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">{emptyMessage}</p>
            {emptyCta && (
              <button
                type="button"
                onClick={emptyCta.onClick}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold"
              >
                {emptyCta.label}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="relative flex items-end gap-0.5 h-36">
              {/* Barras (quantidade) */}
              {data.map((d, i) => {
                const barH = d.count > 0 ? Math.max(12, (d.count / chartMaxCount) * barMaxH) : 4;
                const lineY = d.valor > 0 ? 104 - (d.valor / chartMaxValor) * barMaxH : 104;
                return (
                  <div
                    key={d.label}
                    className="flex-1 flex flex-col justify-end items-center relative group"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <div
                      className="w-full rounded-t bg-emerald-500/80 hover:bg-emerald-500 transition-colors min-w-[4px]"
                      style={{ height: `${barH}px` }}
                    />
                    {hovered === i && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 px-2 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs shadow-lg whitespace-nowrap">
                        <p className="font-medium">{d.label}</p>
                        <p>Valor: {BRL.format(d.valor)}</p>
                        <p>Quantidade: {d.count}</p>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Linha (valor) — SVG overlay */}
              {data.length > 1 && chartMaxValor > 0 && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polyline
                    fill="none"
                    stroke="rgb(59 130 246)"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    points={data
                      .map((d, i) => {
                        const x = ((i + 0.5) / data.length) * 100;
                        const yVal = d.valor > 0 ? (d.valor / chartMaxValor) * 70 : 0;
                        const y = 95 - yVal;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                </svg>
              )}
            </div>
            <div className="flex justify-between mt-2 px-0.5">
              <span className="text-[10px] text-neutral-500">{data[0]?.label}</span>
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {data[data.length - 1]?.label}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded bg-blue-500" />
                <span className="text-[10px] text-neutral-500">Valor (R$)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500/80" />
                <span className="text-[10px] text-neutral-500">Quantidade</span>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
