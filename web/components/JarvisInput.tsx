"use client";

import { forwardRef } from "react";
import { toTitleCase } from "@/lib/formatText";

function patchChangeEvent(
  e: React.FocusEvent<HTMLInputElement>,
  next: string
): React.ChangeEvent<HTMLInputElement> {
  const t = e.target;
  const ct = e.currentTarget;
  return {
    ...e,
    target: { ...t, value: next },
    currentTarget: { ...ct, value: next },
  } as React.ChangeEvent<HTMLInputElement>;
}

/**
 * Input que aplica automaticamente "primeira letra de cada palavra em maiúscula"
 * ao sair do campo (onBlur), em todo o sistema (fornecedor, admin, seller, org).
 * Use titleCase={false} para campos que não devem ser formatados (ex.: SKU, e-mail, números).
 *
 * Funciona em modo controlado e não controlado (lê sempre o valor atual do DOM no blur).
 */
export const JarvisInput = forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input"> & { titleCase?: boolean }>(
  function JarvisInput({ titleCase = true, onBlur, onChange, value, defaultValue, ...props }, ref) {
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const domValue = e.currentTarget.value;
      if (titleCase && domValue.trim()) {
        const next = toTitleCase(domValue);
        if (next !== domValue) {
          if (onChange) {
            onChange(patchChangeEvent(e, next));
          } else {
            e.currentTarget.value = next;
          }
        }
      }
      onBlur?.(e);
    };
    return (
      <input
        ref={ref}
        {...props}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={handleBlur}
      />
    );
  }
);

JarvisInput.displayName = "JarvisInput";
