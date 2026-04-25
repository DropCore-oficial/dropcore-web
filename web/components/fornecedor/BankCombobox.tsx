"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { BancoBrasil } from "@/lib/bancosBrasil";
import { filtrarBancos, formatBancoLabel } from "@/lib/bancosBrasil";

type Props = {
  value: string;
  onChange: (value: string) => void;
  inputClassName: string;
  /** id do &lt;input&gt; (ex.: para associar ao &lt;label htmlFor&gt;) */
  id?: string;
};

export function BankCombobox({ value, onChange, inputClassName, id: idProp }: Props) {
  const reactId = useId();
  const inputId = idProp ?? `bank-combobox-${reactId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => filtrarBancos(value), [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selectBanco = useCallback(
    (b: BancoBrasil) => {
      onChange(formatBancoLabel(b));
      setOpen(false);
    },
    [onChange]
  );

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  return (
    <div ref={containerRef} className="relative z-20">
      <input
        id={inputId}
        type="text"
        name="nome_banco"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
            return;
          }
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            selectBanco(filtered[highlight]!);
          }
        }}
        placeholder="Código ou nome do banco..."
        className={inputClassName}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${inputId}-listbox`}
        role="combobox"
      />

      {open && filtered.length > 0 && (
        <ul
          id={`${inputId}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-60 overflow-y-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
        >
          {filtered.slice(0, 80).map((b, i) => (
            <li key={`${b.code}-${b.nome}`} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`flex w-full gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                  i === highlight
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-[var(--foreground)]"
                    : "text-[var(--foreground)] hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectBanco(b)}
              >
                <span className="shrink-0 tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{b.code}</span>
                <span className="min-w-0 flex-1 leading-snug">{b.nome}</span>
              </button>
            </li>
          ))}
          {filtered.length > 80 && (
            <li className="px-3 py-2 text-[11px] text-[var(--muted)]">Refine a busca — muitos resultados.</li>
          )}
        </ul>
      )}

      <p className="text-[11px] text-[var(--muted)] mt-1">
        Digite o código (ex.: <span className="tabular-nums">341</span>) ou o nome. A lista abre sempre{" "}
        <strong className="font-medium text-[var(--foreground)]">para baixo</strong>. Se não achar, digite o nome completo.
      </p>
    </div>
  );
}
