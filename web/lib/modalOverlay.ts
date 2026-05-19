import { cn } from "@/lib/utils";

/**
 * Backdrop de modal: sempre centralizado (mobile e desktop).
 * Não usar `items-end` / sheet inferior — ver regra `.cursor/rules/modal-centralizado.mdc`.
 */
export const MODAL_OVERLAY_CLASS = cn(
  "fixed inset-0 z-50 flex items-center justify-center",
  "p-4 sm:p-6",
  "bg-black/50 backdrop-blur-md"
);

/** Painel padrão (largura sm); corpo rolável com MODAL_PANEL_BODY_CLASS. */
export const MODAL_PANEL_CLASS = cn(
  "w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl",
  "max-h-[min(90dvh,calc(100vh-2rem))] overflow-hidden flex flex-col"
);

/** Área de conteúdo dentro do painel quando o modal pode ser alto. */
export const MODAL_PANEL_BODY_CLASS = "min-h-0 flex-1 overflow-y-auto";
