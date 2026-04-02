"use client";

import { forwardRef } from "react";
import { toTitleCase } from "@/lib/formatText";

/**
 * Textarea que aplica automaticamente "primeira letra de cada palavra em maiúscula"
 * ao sair do campo (onBlur). Use titleCase={false} para desativar.
 */
export const JarvisTextarea = forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<"textarea"> & { titleCase?: boolean }
>(function JarvisTextarea({ titleCase = true, onBlur, onChange, value, ...props }, ref) {
  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (titleCase && typeof value === "string" && value.trim()) {
      const next = toTitleCase(value);
      if (next !== value && onChange) {
        onChange({ ...e, target: { ...e.target, value: next } } as React.ChangeEvent<HTMLTextAreaElement>);
      }
    }
    onBlur?.(e);
  };
  return <textarea ref={ref} value={value} onChange={onChange} onBlur={handleBlur} {...props} />;
});
