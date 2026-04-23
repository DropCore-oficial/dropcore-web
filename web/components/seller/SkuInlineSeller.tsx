"use client";

import { useState } from "react";
import { mascararSkuListagem } from "@/lib/sellerCatalogoPrivacidade";

export function SkuInlineSeller({ sku, monoClass }: { sku: string; monoClass?: string }) {
  const full = String(sku ?? "").trim();
  const shown = mascararSkuListagem(full);
  const [copied, setCopied] = useState(false);
  const precisaMáscara = shown !== full;
  const mono =
    monoClass
    ?? "font-mono text-[11px] sm:text-xs font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-200/90 dark:bg-neutral-700/80 border border-neutral-300/60 dark:border-neutral-600 rounded-md px-1.5 py-0.5";
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap min-w-0">
      <span
        className={`${mono} shrink-0 max-w-full truncate`}
        title={precisaMáscara ? "Parte do SKU oculta na lista; use “Copiar SKU completo” para o valor exato no ERP." : undefined}
      >
        {shown}
      </span>
      {precisaMáscara && (
        <button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(full);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch {
                /* clipboard */
              }
            })();
          }}
          className="text-[10px] sm:text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0 touch-manipulation py-0.5"
        >
          {copied ? "Copiado" : "Copiar SKU completo"}
        </button>
      )}
    </span>
  );
}
