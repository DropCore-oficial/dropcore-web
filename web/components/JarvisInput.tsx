"use client";

import { forwardRef } from "react";
import { toTitleCase } from "@/lib/formatText";

/**
 * Input que aplica automaticamente "primeira letra de cada palavra em maiúscula"
 * ao sair do campo (onBlur), em todo o sistema (fornecedor, admin, seller, org).
 * Use titleCase={false} para campos que não devem ser formatados (ex.: SKU, e-mail, números).
 */
export const JarvisInput = forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input"> & { titleCase?: boolean }>(
  function JarvisInput({ titleCase = true, onBlur, onChange, value, ...props }, ref) {
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (titleCase && typeof value === "string" && value.trim()) {
        const next = toTitleCase(value);
        if (next !== value && onChange) {
          onChange({ ...e, target: { ...e.target, value: next } } as React.ChangeEvent<HTMLInputElement>);
        }
      }
      onBlur?.(e);
    };
    return <input ref={ref} value={value} onChange={onChange} onBlur={handleBlur} {...props} />;
  }
);
