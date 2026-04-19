"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useId,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type TooltipFixedPos = { left: number; top: number; transform: string; width: number };

/**
 * Botão ? discreto; painel em portal + fixed para não ser cortado por overflow.
 * Hover no botão ou no painel (igual à calculadora do seller).
 */
export function HelpBubble({
  open,
  onOpen,
  onClose,
  ariaLabel,
  children,
  side = "below",
  align = "start",
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  side?: "below" | "above";
  align?: "start" | "end";
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const [fixedPos, setFixedPos] = useState<TooltipFixedPos | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const handleEnter = useCallback(() => {
    clearLeaveTimer();
    onOpen();
  }, [clearLeaveTimer, onOpen]);

  const handleLeave = useCallback(() => {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => onClose(), 140);
  }, [clearLeaveTimer, onClose]);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  const updateFixedPos = useCallback(() => {
    if (!open || !anchorRef.current || typeof window === "undefined") return;
    const rect = anchorRef.current.getBoundingClientRect();
    const margin = 10;
    const width = Math.min(280, Math.max(200, window.innerWidth - margin * 2));
    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const gap = 6;
    if (side === "above") {
      setFixedPos({
        left,
        top: rect.top - gap,
        transform: "translateY(-100%)",
        width,
      });
    } else {
      setFixedPos({
        left,
        top: rect.bottom + gap,
        transform: "none",
        width,
      });
    }
  }, [open, align, side]);

  useLayoutEffect(() => {
    if (!open) {
      setFixedPos(null);
      return;
    }
    updateFixedPos();
    const el = anchorRef.current;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateFixedPos()) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("scroll", updateFixedPos, true);
    window.addEventListener("resize", updateFixedPos);
    return () => {
      ro?.disconnect();
      window.removeEventListener("scroll", updateFixedPos, true);
      window.removeEventListener("resize", updateFixedPos);
    };
  }, [open, updateFixedPos]);

  const tooltipNode =
    open &&
    fixedPos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        id={tooltipId}
        role="tooltip"
        style={{
          position: "fixed",
          left: fixedPos.left,
          top: fixedPos.top,
          transform: fixedPos.transform,
          width: fixedPos.width,
          zIndex: 200,
        }}
        className="pointer-events-auto rounded-lg border border-neutral-200 bg-white p-3 text-left text-[11px] leading-relaxed text-neutral-700 shadow-lg dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </div>,
      document.body,
    );

  return (
    <div
      ref={anchorRef}
      className="relative inline-flex shrink-0 items-center"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 text-[10px] font-semibold leading-none text-neutral-500 transition hover:border-neutral-400 hover:bg-white hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200 dark:focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-neutral-900"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        aria-label={ariaLabel}
        onClick={(e) => e.preventDefault()}
      >
        ?
      </button>
      {tooltipNode}
    </div>
  );
}
