"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { toTitleCase } from "@/lib/formatText";

const SPLIT_RE = /[,;\n]/;

function normalizeToken(raw: string, mode: "title" | "upper"): string {
  const t = raw.trim();
  if (!t) return "";
  return mode === "title" ? toTitleCase(t) : t.toUpperCase();
}

function parseToList(s: string, mode: "title" | "upper"): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of s.split(SPLIT_RE)) {
    const t = normalizeToken(raw, mode);
    if (!t) continue;
    const key = mode === "title" ? t.toLowerCase() : t;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function listsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export type VarianteExtrasTagInputProps = {
  value: string;
  onChange: (next: string) => void;
  normalize: "title" | "upper";
  placeholder: string;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
  /** Se false, não mostra o texto de ajuda abaixo do campo (útil quando a página já explica o fluxo). */
  showHint?: boolean;
};

/**
 * Cores/tamanhos extras: tags com Enter ou vírgula; clique na tag para editar; × para remover.
 * O valor no pai continua a ser uma string separada por vírgulas (compatível com o restante do fluxo).
 */
export function VarianteExtrasTagInput({
  value,
  onChange,
  normalize,
  placeholder,
  className = "",
  inputClassName = "",
  "aria-label": ariaLabel,
  showHint = true,
}: VarianteExtrasTagInputProps) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const parts = parseToList(value, normalize);

  useEffect(() => {
    if (editingIndex === null) return;
    editRef.current?.focus();
    editRef.current?.select?.();
  }, [editingIndex]);

  function commitString(nextParts: string[]) {
    onChange(nextParts.join(", "));
  }

  /** Uma entrada; usa `baseList` quando se adiciona várias de seguida (evita estado desatualizado). */
  function addToken(raw: string, baseList: string[]) {
    const t = normalizeToken(raw, normalize);
    if (!t) return baseList;
    const key = normalize === "title" ? t.toLowerCase() : t;
    if (baseList.some((x) => (normalize === "title" ? x.toLowerCase() : x) === key)) return baseList;
    return [...baseList, t];
  }

  function addFromDraft(raw: string) {
    const cur = parseToList(value, normalize);
    const next = addToken(raw, cur);
    if (!listsEqual(next, cur)) commitString(next);
  }

  function handleDraftKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (draft.trim()) {
        addFromDraft(draft);
        setDraft("");
      }
      return;
    }
    if (e.key === "Backspace" && !draft && parts.length > 0) {
      e.preventDefault();
      commitString(parts.slice(0, -1));
    }
  }

  function handleDraftChange(v: string) {
    if (SPLIT_RE.test(v)) {
      const segments = v.split(SPLIT_RE);
      const last = segments.pop() ?? "";
      let next = parseToList(value, normalize);
      for (const seg of segments) next = addToken(seg, next);
      commitString(next);
      setDraft(last);
      return;
    }
    setDraft(v);
  }

  function removeAt(i: number) {
    const next = parts.filter((_, j) => j !== i);
    commitString(next);
    if (editingIndex === i) {
      setEditingIndex(null);
      setEditDraft("");
    }
  }

  function startEdit(i: number) {
    setEditingIndex(i);
    setEditDraft(parts[i] ?? "");
  }

  function finishEdit() {
    if (editingIndex === null) return;
    const i = editingIndex;
    const t = normalizeToken(editDraft, normalize);
    let next = parts.filter((_, j) => j !== i);
    if (t) {
      const key = normalize === "title" ? t.toLowerCase() : t;
      next = next.filter((x) => (normalize === "title" ? x.toLowerCase() : x) !== key);
      next.splice(Math.min(i, next.length), 0, t);
    }
    commitString(parseToList(next.join(", "), normalize));
    setEditingIndex(null);
    setEditDraft("");
  }

  return (
    <div className={className}>
      <div
        className={`flex min-h-[42px] w-full max-w-xl flex-wrap items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:focus-within:border-blue-500 dark:focus-within:ring-blue-500 ${inputClassName}`}
      >
        {parts.map((p, i) =>
          editingIndex === i ? (
            <input
              key={`edit-${i}-${p}`}
              ref={editRef}
              type="text"
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onBlur={finishEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingIndex(null);
                  setEditDraft("");
                }
              }}
              className="min-w-[6rem] max-w-[14rem] rounded border border-blue-400 bg-white px-2 py-0.5 text-sm text-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-500 dark:bg-neutral-900 dark:text-neutral-100"
              aria-label="Editar item"
            />
          ) : (
            <span
              key={`${p}-${i}`}
              className="inline-flex max-w-full items-center gap-0.5 rounded-md bg-neutral-100 pl-2 pr-0.5 py-0.5 text-xs font-medium text-neutral-800 dark:bg-neutral-700/80 dark:text-neutral-100"
            >
              <button
                type="button"
                className="max-w-[200px] truncate text-left hover:underline"
                onClick={() => startEdit(i)}
                title="Clique para editar"
              >
                {p}
              </button>
              <button
                type="button"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 dark:hover:bg-neutral-600 dark:hover:text-neutral-100"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
                aria-label={`Remover ${p}`}
              >
                ×
              </button>
            </span>
          ),
        )}
        <input
          type="text"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={handleDraftKeyDown}
          onBlur={() => {
            if (draft.trim()) {
              addFromDraft(draft);
              setDraft("");
            }
          }}
          placeholder={parts.length === 0 ? placeholder : ""}
          className="min-w-[8rem] flex-1 border-0 bg-transparent py-1 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          aria-label={ariaLabel}
        />
      </div>
      {showHint ? (
        <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          Digite e pressione <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 dark:border-neutral-600 dark:bg-neutral-800">Enter</kbd> ou{" "}
          <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 dark:border-neutral-600 dark:bg-neutral-800">,</kbd> para adicionar. Clique numa tag para editar.
        </p>
      ) : null}
    </div>
  );
}
