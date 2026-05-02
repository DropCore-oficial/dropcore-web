import type { ReactNode } from "react";
import {
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SOFT,
} from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

type Props = {
  totalProdutos: number;
  skusDisponiveis: number;
  skusHabilitados: number;
  skusComPendencia: number;
  habilitadosMax: number | null;
  /** strip: grade; stripScroll: uma linha com scroll horizontal (mobile). */
  variant?: "cards" | "strip" | "stripScroll";
};

/** Bordas e superfícies alinhadas ao padrão "admin" (estilo Shopify / Polaris). */
const b = "border-[#dfe3e8] dark:border-[#2e3240]";
const label = "text-[11px] font-medium uppercase tracking-wide text-[#6d7175] dark:text-[#8c9196]";
const value = "text-lg font-semibold tabular-nums leading-tight text-[#202223] dark:text-[#e3e5e8]";

function IconBox({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "pending" }) {
  const shell =
    tone === "success"
      ? "bg-[#e3f1ed] text-[#008060] dark:bg-[#008060]/20 dark:text-[#6fd4b0]"
      : tone === "pending"
        ? cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, "border-0", AMBER_PREMIUM_TEXT_PRIMARY)
        : "bg-[#e8eaed]/80 text-[#5c5f62] dark:bg-[#2e3240] dark:text-[#8c9196]";
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${shell} [&_svg]:h-3.5 [&_svg]:w-3.5`}>
      {children}
    </span>
  );
}

function MetricStrip({
  totalProdutos,
  skusDisponiveis,
  skusHabilitados,
  skusComPendencia,
  habilitadosMax,
}: Props) {
  return (
    <div
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border ${b} bg-[#f4f6f8] dark:bg-[#1a1d24] sm:grid-cols-4`}
    >
      <div className="bg-white px-3 py-2.5 dark:bg-[#1a1d24]">
        <p className={label}>Produtos</p>
        <p className={value}>{totalProdutos}</p>
      </div>
      <div className="bg-white px-3 py-2.5 dark:bg-[#1a1d24]">
        <p className={label}>SKUs</p>
        <p className={value}>{skusDisponiveis}</p>
      </div>
      <div className="bg-white px-3 py-2.5 dark:bg-[#1a1d24]">
        <p className={label}>Habilitados</p>
        <p className={value}>
          {skusHabilitados}
          {habilitadosMax != null && (
            <span className="text-sm font-medium text-[#6d7175] dark:text-[#8c9196]">/{habilitadosMax}</span>
          )}
        </p>
      </div>
      <div className="bg-white px-3 py-2.5 dark:bg-[#1a1d24]">
        <p className={cn("text-[11px] font-medium uppercase tracking-wide", AMBER_PREMIUM_TEXT_SOFT)}>Pendências</p>
        <p className={cn("text-lg font-semibold tabular-nums", AMBER_PREMIUM_TEXT_PRIMARY)}>{skusComPendencia}</p>
      </div>
    </div>
  );
}

function MetricStripScroll({
  totalProdutos,
  skusDisponiveis,
  skusHabilitados,
  skusComPendencia,
  habilitadosMax,
}: Props) {
  const cell = `shrink-0 rounded-lg border ${b} bg-white px-2.5 py-2 shadow-sm dark:bg-[#1a1d24]`;
  return (
    <div className={`flex w-max max-w-none flex-nowrap gap-2`}>
      <div className={`min-w-[5rem] ${cell}`}>
        <p className={label}>Produtos</p>
        <p className={`${value} text-base`}>{totalProdutos}</p>
      </div>
      <div className={`min-w-[4.75rem] ${cell}`}>
        <p className={label}>SKUs</p>
        <p className={`${value} text-base`}>{skusDisponiveis}</p>
      </div>
      <div className={`min-w-[5.5rem] ${cell}`}>
        <p className={label}>Habilitados</p>
        <p className={`${value} text-base`}>
          {skusHabilitados}
          {habilitadosMax != null && (
            <span className="text-sm font-medium text-[#6d7175] dark:text-[#8c9196]">/{habilitadosMax}</span>
          )}
        </p>
      </div>
      <div className={`min-w-[5.25rem] ${cell}`}>
        <p className={cn("text-[10px] font-medium uppercase tracking-wide", AMBER_PREMIUM_TEXT_SOFT)}>Pendências</p>
        <p className={cn("text-base font-semibold tabular-nums", AMBER_PREMIUM_TEXT_PRIMARY)}>{skusComPendencia}</p>
      </div>
    </div>
  );
}

export function CatalogoV2ResumoTopo({
  totalProdutos,
  skusDisponiveis,
  skusHabilitados,
  skusComPendencia,
  habilitadosMax,
  variant = "cards",
}: Props) {
  if (variant === "strip") {
    return (
      <MetricStrip
        totalProdutos={totalProdutos}
        skusDisponiveis={skusDisponiveis}
        skusHabilitados={skusHabilitados}
        skusComPendencia={skusComPendencia}
        habilitadosMax={habilitadosMax}
      />
    );
  }
  if (variant === "stripScroll") {
    return (
      <MetricStripScroll
        totalProdutos={totalProdutos}
        skusDisponiveis={skusDisponiveis}
        skusHabilitados={skusHabilitados}
        skusComPendencia={skusComPendencia}
        habilitadosMax={habilitadosMax}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
      <div className={`flex items-center gap-2.5 rounded-lg border ${b} bg-white px-3 py-2.5 dark:bg-[#1a1d24] sm:gap-3 sm:px-4 sm:py-3`}>
        <IconBox>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </IconBox>
        <div className="min-w-0">
          <p className={label}>Produtos</p>
          <p className={`${value} sm:text-xl`}>{totalProdutos}</p>
        </div>
      </div>
      <div className={`flex items-center gap-2.5 rounded-lg border ${b} bg-white px-3 py-2.5 dark:bg-[#1a1d24] sm:gap-3 sm:px-4 sm:py-3`}>
        <IconBox>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M16.5 9.4 7.55 4.24" />
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
        </IconBox>
        <div className="min-w-0">
          <p className={label}>SKUs</p>
          <p className={`${value} sm:text-xl`}>{skusDisponiveis}</p>
        </div>
      </div>
      <div className={`flex items-center gap-2.5 rounded-lg border ${b} bg-white px-3 py-2.5 dark:bg-[#1a1d24] sm:gap-3 sm:px-4 sm:py-3`}>
        <IconBox tone="success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M5 13l4 4L19 7" />
          </svg>
        </IconBox>
        <div className="min-w-0">
          <p className={label}>Habilitados</p>
          <p className={`${value} sm:text-xl`}>
            {skusHabilitados}
            {habilitadosMax != null && (
              <span className="text-sm font-medium text-[#6d7175] dark:text-[#8c9196]">/{habilitadosMax}</span>
            )}
          </p>
        </div>
      </div>
      <div className={cn("flex items-center gap-2.5 rounded-lg border-0 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3", AMBER_PREMIUM_SURFACE_TRANSPARENT)}>
        <IconBox tone="pending">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </IconBox>
        <div className="min-w-0">
          <p className={cn("text-[11px] font-medium uppercase tracking-wide", AMBER_PREMIUM_TEXT_SOFT)}>Pendências</p>
          <p className={cn("text-lg font-semibold tabular-nums sm:text-xl", AMBER_PREMIUM_TEXT_PRIMARY)}>{skusComPendencia}</p>
        </div>
      </div>
    </div>
  );
}
