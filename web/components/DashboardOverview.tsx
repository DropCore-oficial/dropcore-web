"use client";

import { useRouter } from "next/navigation";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type OverviewStats = {
  saldo_sellers_total?: number;
  entrada_mes?: number;
  receita_dropcore?: number;
  pedidos_hoje?: number;
  pedidos_aguardando_envio?: number;
  fornecedores_ativos?: number;
  repasses_pendentes?: number;
  sellers_ativos?: number;
};

type DashboardOverviewProps = {
  stats: OverviewStats;
};

function StatCard({
  label,
  value,
  sub,
  accent,
  accentType,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  accentType?: "success" | "info";
  onClick?: () => void;
}) {
  const clickable = onClick ? "cursor-pointer hover:opacity-90" : "";
  const valueColor = accent
    ? accentType === "info"
      ? "text-[var(--metric-info)]"
      : "text-[var(--metric-highlight)]"
    : "text-[var(--foreground)]";
  return (
    <div
      className={`px-6 py-6 border-r border-[var(--border-subtle)] last:border-r-0 transition-colors ${clickable}`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${valueColor}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-[var(--muted)] mt-1">{sub}</p>}
    </div>
  );
}

export function DashboardOverview(props: DashboardOverviewProps) {
  const { stats } = props;
  const router = useRouter();

  const financeiro = [
    { label: "Saldo em conta", value: BRL.format(stats.saldo_sellers_total ?? 0), sub: `${stats.sellers_ativos ?? 0} sellers`, accent: true, accentType: "success" as const },
    { label: "Entrada no mês", value: BRL.format(stats.entrada_mes ?? 0), sub: "via depósitos PIX", accent: true, accentType: "info" as const },
    { label: "Receita DropCore", value: BRL.format(stats.receita_dropcore ?? 0), sub: "acumulado (repasses)", accent: true, accentType: "success" as const },
  ];

  const operacional = [
    { label: "Pedidos hoje", value: stats.pedidos_hoje ?? 0, onClick: () => router.push("/admin/pedidos"), highlight: false, highlightType: undefined as "success" | "info" | undefined },
    { label: "Aguard. envio", value: stats.pedidos_aguardando_envio ?? 0, onClick: () => router.push("/admin/pedidos"), highlight: (stats.pedidos_aguardando_envio ?? 0) > 0, highlightType: "info" as const },
    { label: "Fornecedores", value: stats.fornecedores_ativos ?? 0, onClick: () => router.push("/admin/empresas"), highlight: false, highlightType: undefined },
    { label: "A repassar", value: stats.repasses_pendentes ?? 0, onClick: () => router.push("/admin/repasse-fornecedor"), highlight: (stats.repasses_pendentes ?? 0) > 0, highlightType: "info" as const },
  ];

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden shadow-[var(--shadow-card)]">
      <div className="px-6 pt-6 pb-5 border-b border-[var(--border-subtle)]">
        <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Visão geral</h2>
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--border-subtle)] border-b border-[var(--border-subtle)]">
        {financeiro.map((f) => (
          <StatCard key={f.label} label={f.label} value={f.value} sub={f.sub} accent={f.accent} accentType={f.accentType} />
        ))}
      </div>
      <div className="grid grid-cols-4 divide-x divide-[var(--border-subtle)]">
        {operacional.map((o) => (
          <StatCard key={o.label} label={o.label} value={o.value} accent={o.highlight} accentType={o.highlightType} onClick={o.onClick} />
        ))}
      </div>
    </section>
  );
}
