"use client";

import Link from "next/link";
import { SellerNav } from "../../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { SellerOlistConnectGuidePanel } from "@/components/seller/SellerOlistConnectGuidePanel";
import { cn } from "@/lib/utils";

export default function SellerOlistComoConectarPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <SellerNav active="integracoes" />
      <div className="dropcore-shell-4xl space-y-5 py-5 md:space-y-6 md:py-7">
        <SellerPageHeader
          surface="hero"
          title="Como conectar a Olist/Tiny"
          subtitle="Guia passo a passo: onde clicar na Olist/Tiny, gerar o token API, colar no DropCore e (opcional) configurar webhook de pedidos."
        />

        <div
          className={cn(
            "rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-sm sm:p-4",
            "ring-1 ring-[var(--foreground)]/[0.03]",
          )}
        >
          <ComoConectarLinks />
        </div>

        <SellerOlistConnectGuidePanel id="guia-olist" />
      </div>
    </div>
  );
}

function ComoConectarLinks() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:gap-2">
      <Link
        href="/seller/integracoes-erp"
        className="inline-flex min-h-[44px] min-w-0 items-center justify-center rounded-xl bg-emerald-600 px-2.5 py-2.5 text-center text-[13px] font-semibold leading-tight text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-900 sm:min-h-10 sm:flex-initial sm:px-4 sm:text-sm"
      >
        Voltar à conexão
      </Link>
      <Link
        href="/seller/produtos#erp-catalogo-sku"
        className="inline-flex min-h-[44px] min-w-0 items-center justify-center rounded-xl border border-emerald-500/35 bg-emerald-50 px-2.5 py-2.5 text-center text-[13px] font-semibold leading-tight text-emerald-900 transition hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/40 sm:min-h-10 sm:flex-initial sm:px-4 sm:text-sm"
      >
        Catálogo / SKU
      </Link>
    </div>
  );
}
