"use client";

import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { SellerMercadoLivreIntegrationPanel } from "@/components/seller/SellerMercadoLivreIntegrationPanel";

// Mesmo card de web/app/seller/gestores-ia-avulso/integracoes/page.tsx, mas em grid de 3
// colunas iguais (não largura fixa) pra ocupar a largura inteira da tela — só ML fica
// ativo; Shopee/TikTok Shop aparecem como "Em breve" (sem integração real ainda).
const MARKETPLACES_EM_BREVE = [
  { nome: "Shopee", logo: "/brand/marketplaces/shopee.svg" },
  { nome: "TikTok Shop", logo: "/brand/marketplaces/tiktok-shop.png" },
];

export default function SellerIntegracoesMarketplacePage() {
  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <SellerNav active="integracoes" wide />
      <div className="dropcore-shell-6xl space-y-5 pt-5 md:space-y-6 md:pt-7 pb-5 md:pb-7">
        <SellerPageHeader
          surface="hero"
          title="Integrações"
          subtitle={
            <>
              Conecte o Mercado Livre pra{" "}
              <span className="font-medium text-[var(--foreground)]">
                alimentar os gestores de IA com dado real da sua loja
              </span>
              . Outros marketplaces chegam em breve.
            </>
          }
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <SellerMercadoLivreIntegrationPanel />
          {MARKETPLACES_EM_BREVE.map(({ nome, logo }) => (
            <div
              key={nome}
              className="flex w-full flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-sm"
            >
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
