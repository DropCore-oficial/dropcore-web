"use client";

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success" | "info" | "warning";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  className?: string;
};

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm hover:opacity-[0.97]",
  success: "bg-[var(--success)] hover:opacity-90 text-white border-0",
  danger: "bg-[var(--danger)] hover:opacity-90 text-white border-0",
  info: "bg-[var(--info)] hover:opacity-90 text-white border-0",
  warning: "bg-[var(--warning)] hover:opacity-90 text-white border-0",
  secondary: "border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:opacity-90",
  ghost: "border-0 bg-transparent text-[var(--foreground)] hover:bg-[var(--card)]",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "rounded-[var(--radius-sm)] font-medium cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
