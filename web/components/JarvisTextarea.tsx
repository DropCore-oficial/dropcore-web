"use client";

import { forwardRef } from "react";
import { toTitleCase } from "@/lib/formatText";

function patchChangeEvent(
  e: React.FocusEvent<HTMLTextAreaElement>,
  next: string
): React.ChangeEvent<HTMLTextAreaElement> {
  const t = e.target;
  const ct = e.currentTarget;
  return {
    ...e,
    target: { ...t, value: next },
    currentTarget: { ...ct, value: next },
  } as React.ChangeEvent<HTMLTextAreaElement>;
}

/**
 * Textarea que aplica automaticamente "primeira letra de cada palavra em maiúscula"
 * ao sair do campo (onBlur). Use titleCase={false} para desativar.
 *
 * Funciona em modo controlado e não controlado (lê sempre o valor atual do DOM no blur).
 */
export const JarvisTextarea = forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<"textarea"> & { titleCase?: boolean }
>(function JarvisTextarea({ titleCase = true, onBlur, onChange, value, defaultValue, ...props }, ref) {
  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
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
    <textarea
      ref={ref}
      {...props}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      onBlur={handleBlur}
    />
  );
});

JarvisTextarea.displayName = "JarvisTextarea";
