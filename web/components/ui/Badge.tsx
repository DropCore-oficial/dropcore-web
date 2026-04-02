"use client";

import { cn } from "@/lib/utils";

export type BadgeVariant = "success" | "danger" | "warning" | "info" | "neutral";

export type BadgeProps = {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
};

const variantStyles: Record<BadgeVariant, string> = {
  success:
    "bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/30",
  danger:
    "bg-[var(--danger)]/15 text-[var(--danger)] border border-[var(--danger)]/30",
  warning:
    "bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/30",
  info:
    "bg-[var(--info)]/15 text-[var(--info)] border border-[var(--info)]/30",
  neutral:
    "bg-[var(--card)] text-[var(--foreground)] border border-[var(--card-border)]",
};

export function Badge({
  variant = "neutral",
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] px-2.5 py-0.5 text-[11px] font-semibold",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
