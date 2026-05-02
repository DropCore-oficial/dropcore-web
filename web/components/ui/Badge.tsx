"use client";

import {
  AMBER_PREMIUM_SHELL,
  AMBER_PREMIUM_TEXT_PRIMARY,
} from "@/lib/amberPremium";
import {
  DANGER_PREMIUM_SHELL,
  DANGER_PREMIUM_TEXT_PRIMARY,
  INFO_PREMIUM_SHELL,
  INFO_PREMIUM_TEXT_PRIMARY,
  SUCCESS_PREMIUM_SHELL,
  SUCCESS_PREMIUM_TEXT_PRIMARY,
} from "@/lib/semanticPremium";
import { cn } from "@/lib/utils";

export type BadgeVariant = "success" | "danger" | "warning" | "info" | "neutral";

export type BadgeProps = {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
};

const variantStyles: Record<BadgeVariant, string> = {
  success: cn(SUCCESS_PREMIUM_SHELL, SUCCESS_PREMIUM_TEXT_PRIMARY),
  danger: cn(DANGER_PREMIUM_SHELL, DANGER_PREMIUM_TEXT_PRIMARY),
  warning: cn(AMBER_PREMIUM_SHELL, AMBER_PREMIUM_TEXT_PRIMARY),
  info: cn(INFO_PREMIUM_SHELL, INFO_PREMIUM_TEXT_PRIMARY),
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
