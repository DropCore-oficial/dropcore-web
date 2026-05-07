"use client";

import type { ReactNode } from "react";
import {
  AMBER_PREMIUM_DOT,
  AMBER_PREMIUM_SURFACE_TRANSPARENT,
  AMBER_PREMIUM_TEXT_BODY,
  AMBER_PREMIUM_TEXT_PRIMARY,
  AMBER_PREMIUM_TEXT_SECONDARY,
  amberPremiumWarningMainTextClass,
} from "@/lib/amberPremium";
import { cn } from "@/lib/utils";

/** Campo considerado preenchido no diagnóstico (lista fornecedor / seller). */
export function cadastroCampoPreenchido(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

export type StatusVariant = "aprovado" | "pendente" | "erro" | "opcional" | "analise";

export function StatusBadge({ text, variant }: { text: string; variant: StatusVariant }) {
  const cls =
    variant === "aprovado"
      ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600/10 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-500/45"
      : variant === "pendente"
        ? cn(AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY)
        : variant === "erro"
          ? "bg-rose-50 text-rose-800 ring-1 ring-rose-600/15 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-500/45"
          : variant === "analise"
            ? "bg-sky-50 text-sky-900 ring-1 ring-sky-600/15 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-500/45"
            : "bg-[var(--surface-subtle)] text-[var(--muted)] ring-1 ring-[var(--foreground)]/8";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight ${cls}`}>
      {text}
    </span>
  );
}

export function FieldRow({
  label,
  value,
  ok,
  optional = false,
}: {
  label: string;
  value: ReactNode;
  ok: boolean;
  optional?: boolean;
}) {
  const variant: StatusVariant = optional ? "opcional" : ok ? "aprovado" : "pendente";
  const badgeText = optional ? "Opcional" : ok ? "Completo" : "Pendente";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--card-border)] py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
        <div className="mt-1.5 break-words text-sm font-medium leading-snug text-[var(--foreground)]">{value}</div>
      </div>
      <StatusBadge text={badgeText} variant={variant} />
    </div>
  );
}

export function MiniCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm dark:shadow-none">
      <h4 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">{title}</h4>
      {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
      <div className="mt-1">{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  status,
  tone = "neutral",
}: {
  label: string;
  value: string;
  status?: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? amberPremiumWarningMainTextClass(value)
        : "text-[var(--foreground)]";
  return (
    <div className="group rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm transition-all hover:border-emerald-300 dark:hover:border-emerald-700">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`mt-2 text-xl font-semibold tabular-nums tracking-tight ${toneClass}`}>{value}</p>
      {status ? (
        <p className={`mt-1.5 text-xs leading-snug ${tone === "warning" ? AMBER_PREMIUM_TEXT_SECONDARY : "text-[var(--muted)]"}`}>
          {status}
        </p>
      ) : null}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]/20 ring-1 ring-inset ring-[var(--foreground)]/8 dark:ring-white/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function GradeBadge({ value }: { value: number }) {
  const variant: StatusVariant = value >= 85 ? "aprovado" : value >= 70 ? "analise" : "pendente";
  if (variant === "pendente") {
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-xs leading-snug shadow-none ${AMBER_PREMIUM_SURFACE_TRANSPARENT}`}>
        <span className={cn("shrink-0 font-semibold tabular-nums", amberPremiumWarningMainTextClass(`${value}%`))}>
          {value}%
        </span>
        <span className={cn("shrink-0 font-normal", AMBER_PREMIUM_DOT)} aria-hidden>
          ·
        </span>
        <span className={cn("min-w-0 font-normal", AMBER_PREMIUM_TEXT_BODY)}>concluído</span>
      </span>
    );
  }
  return <StatusBadge text={`${value}% concluído`} variant={variant} />;
}

export function CadastroResumoShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">{children}</div>
  );
}
