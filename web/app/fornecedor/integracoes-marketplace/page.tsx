"use client";

import { FornecedorNav } from "../FornecedorNav";
import { FornecedorMercadoLivreIntegrationPanel } from "@/components/fornecedor/FornecedorMercadoLivreIntegrationPanel";

// Mesmo padrão de web/app/seller/integracoes-marketplace/page.tsx: grid de 3 colunas
// iguais, só o Mercado Livre fica ativo, Shopee/TikTok Shop aparecem como "Em breve".
const MARKETPLACES_EM_BREVE = [
  { nome: "Shopee", logo: "/brand/marketplaces/shopee.svg" },
  { nome: "TikTok Shop", logo: "/brand/marketplaces/tiktok-shop.png" },
];

export default function FornecedorIntegracoesMarketplacePage() {
  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <FornecedorNav active="integracoes" wide />
      <div className="dropcore-shell-6xl space-y-5 py-5 md:space-y-6 md:py-7">
        <header className="overflow-visible rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Integrações</h1>
              <span
                className="h-1 w-14 shrink-0 self-center rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300/70 sm:w-20"
                aria-hidden
              />
            </div>
            <p className="max-w-xl text-sm leading-snug text-[var(--muted)]">
              Conecte o Mercado Livre e o DropCore{" "}
              <span className="font-medium text-[var(--foreground)]">mantém o estoque atualizado automaticamente</span>,
              sem precisar avisar cada venda na mão. Outros marketplaces chegam em breve.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <FornecedorMercadoLivreIntegrationPanel />
          {MARKETPLACES_EM_BREVE.map(({ nome, logo }) => (
            <div key={nome} className="flex w-full flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt={nome} className="h-8 w-8 rounded-lg object-contain" />
                  <p className="font-semibold text-[var(--foreground)]">{nome}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--muted)]/15 px-2 py-1 text-[11px] font-medium text-[var(--muted)]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                  Em breve
                </span>
              </div>
              <div className="mt-auto pt-4">
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted)] opacity-60"
                >
                  Em breve
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
