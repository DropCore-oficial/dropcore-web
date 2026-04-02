"use client";

import { cn } from "@/lib/utils";

export type AlertVariant = "success" | "danger" | "warning" | "info";

export type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

const variantStyles: Record<AlertVariant, string> = {
  success:
    "border border-[var(--success)]/20 bg-[var(--success)]/8 text-[var(--foreground)]",
  danger:
    "border border-[var(--danger)]/20 bg-[var(--danger)]/8 text-[var(--foreground)]",
  warning:
    "border border-[var(--warning)]/20 bg-[var(--warning)]/8 text-[var(--foreground)]",
  info:
    "border border-[var(--info)]/20 bg-[var(--info)]/8 text-[var(--foreground)]",
};

export function Alert({
  variant = "info",
  title,
  children,
  action,
  className,
}: AlertProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] px-5 py-4 flex items-center justify-between gap-4 flex-wrap",
        variantStyles[variant],
        className
      )}
    >
      <div className="min-w-0">
        {title && (
          <p className="text-sm font-semibold mb-0.5">{title}</p>
        )}
        <div className="text-sm">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
