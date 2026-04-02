"use client";

import { cn } from "@/lib/utils";

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 flex-wrap",
        className
      )}
    >
      <div>
        <h2 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wider">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-[var(--muted)] mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
