"use client";

import { cn } from "@/lib/utils";
import { buildSellerSupportWhatsAppHref, SELLER_SUPPORT_WHATSAPP_DEFAULT_PREFILL } from "@/lib/sellerSupportWhatsAppPrefill";

type SellerWhatsAppSupportFabProps = {
  className?: string;
  /** Texto inicial da conversa no WhatsApp */
  prefillMessage?: string;
};

/**
 * Botão fixo estilo “dock” (ex.: UpSeller): abre o WhatsApp de suporte sem exibir o número na UI.
 */
export function SellerWhatsAppSupportFab({
  className,
  prefillMessage = SELLER_SUPPORT_WHATSAPP_DEFAULT_PREFILL,
}: SellerWhatsAppSupportFabProps) {
  return (
    <a
      href={buildSellerSupportWhatsAppHref(prefillMessage)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "fixed z-[90] flex h-12 w-12 items-center justify-center rounded-full",
        "bg-emerald-600 text-white shadow-md shadow-emerald-900/15 ring-2 ring-white/25",
        "transition hover:bg-emerald-700 hover:shadow-lg active:scale-[0.97] active:bg-emerald-900",
        "dark:ring-emerald-400/20",
        "right-3 sm:right-5",
        "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-8",
        "animate-in fade-in-0 zoom-in-95 duration-200",
        className,
      )}
      aria-label="Suporte DropCore no WhatsApp"
      title="Suporte no WhatsApp"
    >
      <svg
        className="h-6 w-6 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </svg>
    </a>
  );
}
