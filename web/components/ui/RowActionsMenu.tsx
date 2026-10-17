"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Botão "⋯" que abre um menu via portal (`fixed` + `createPortal` em `document.body`) —
 * escapa de qualquer ancestral com `overflow-x-auto`/`overflow-hidden` (ex. tabela com
 * scroll horizontal no mobile), que corta um dropdown `absolute` comum na vertical. Mesmo
 * padrão já usado em `SellerListaGrupoArmazem.tsx`, extraído aqui pra reaproveitar em
 * qualquer tabela/lista admin.
 */
export function RowActionsMenu({
  children,
  label = "Mais ações",
  widthPx = 200,
}: {
  children: ReactNode;
  label?: string;
  widthPx?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 12;
    let left = r.right - widthPx;
    if (left < pad) left = pad;
    if (left + widthPx > window.innerWidth - pad) left = window.innerWidth - widthPx - pad;
    setPos({ top: r.bottom + 6, left });
  }, [widthPx]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]/10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[200] rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-1 shadow-md"
              style={{ top: pos.top, left: pos.left, width: widthPx }}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
