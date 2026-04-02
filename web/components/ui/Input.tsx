"use client";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  className?: string;
  inputClassName?: string;
};

export function Input({
  label,
  error,
  className,
  inputClassName,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s/g, "-");
  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm text-[var(--muted)]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full rounded-[var(--radius-sm)] border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-[var(--foreground)] placeholder-[var(--muted)] outline-none focus:ring-1 focus:ring-[var(--accent)]/50 transition-colors",
          inputClassName
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-[var(--danger)]">{error}</p>
      )}
    </div>
  );
}
