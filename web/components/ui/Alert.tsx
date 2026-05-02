"use client";

import { AMBER_PREMIUM_SURFACE_TRANSPARENT, AMBER_PREMIUM_TEXT_PRIMARY } from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SURFACE_TRANSPARENT,
  DANGER_PREMIUM_TEXT_PRIMARY,
  INFO_PREMIUM_SURFACE_TRANSPARENT,
  INFO_PREMIUM_TEXT_PRIMARY,
  SUCCESS_PREMIUM_SURFACE_TRANSPARENT,
  SUCCESS_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
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
  success: SUCCESS_PREMIUM_SURFACE_TRANSPARENT,
  danger: DANGER_PREMIUM_SURFACE_TRANSPARENT,
  warning: AMBER_PREMIUM_SURFACE_TRANSPARENT,
  info: INFO_PREMIUM_SURFACE_TRANSPARENT,
};

const titleClassByVariant: Record<AlertVariant, string> = {
  success: SUCCESS_PREMIUM_TEXT_PRIMARY,
  danger: DANGER_PREMIUM_TEXT_PRIMARY,
  warning: AMBER_PREMIUM_TEXT_PRIMARY,
  info: INFO_PREMIUM_TEXT_PRIMARY,
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
          <p className={cn("text-sm font-semibold mb-0.5", titleClassByVariant[variant])}>{title}</p>
        )}
        <div
          className={cn(
            "text-sm",
            "text-neutral-600 dark:text-neutral-300"
          )}
        >
          {children}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
