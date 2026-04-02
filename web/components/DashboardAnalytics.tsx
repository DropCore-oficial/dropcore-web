"use client";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type AnalyticsStats = {
  total_pedidos?: number;
  ticket_medio?: number;
  margem_media_pct?: number;
  volume_dropcore?: number;
};

export type DashboardAnalyticsProps = {
  stats: AnalyticsStats;
};

export function DashboardAnalytics({ stats }: DashboardAnalyticsProps) {
  const items = [
    { label: "Pedidos", value: String(stats.total_pedidos ?? 0), accent: false },
    { label: "Ticket médio", value: BRL.format(stats.ticket_medio ?? 0), accentType: "info" as const },
    { label: "Margem DropCore", value: `${(stats.margem_media_pct ?? 0).toFixed(1)}%`, accentType: "success" as const },
    { label: "Receita DropCore", value: BRL.format(stats.volume_dropcore ?? 0), accentType: "success" as const },
  ];

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden shadow-[var(--shadow-card)]">
      <div className="px-6 pt-6 pb-5 flex items-center gap-2 border-b border-[var(--border-subtle)]">
        <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Analytics</h2>
        <span className="rounded-full border border-[var(--metric-highlight)]/30 bg-[var(--metric-highlight)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--metric-highlight)]">
          PRO · 30 dias
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[var(--border-subtle)]">
        {items.map((item) => {
          const valueColor = item.accentType === "success" ? "text-[var(--metric-highlight)]" : item.accentType === "info" ? "text-[var(--metric-info)]" : "text-[var(--foreground)]";
          return (
            <div key={item.label} className="px-6 py-6">
              <p className="text-xs text-[var(--muted)] mb-1.5">{item.label}</p>
              <p className={`text-base font-bold tabular-nums ${valueColor}`}>
                {item.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
