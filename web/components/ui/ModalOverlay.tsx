"use client";

import { MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS } from "@/lib/modalOverlay";
import { cn } from "@/lib/utils";

export type ModalOverlayProps = {
  children: React.ReactNode;
  /** Clique no backdrop (fora do painel). */
  onBackdropClick?: () => void;
  className?: string;
  panelClassName?: string;
  /** z-index do backdrop (padrão 50). */
  zIndexClass?: string;
};

/**
 * Modal centralizado na viewport. Preferir este componente ou MODAL_OVERLAY_CLASS + MODAL_PANEL_CLASS.
 */
export function ModalOverlay({
  children,
  onBackdropClick,
  className,
  panelClassName,
  zIndexClass,
}: ModalOverlayProps) {
  return (
    <div
      className={cn(MODAL_OVERLAY_CLASS, zIndexClass, className)}
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className={cn(MODAL_PANEL_CLASS, panelClassName)}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
