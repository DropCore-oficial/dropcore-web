"use client";

import { SellerNav } from "../SellerNav";
import { SellerPageHeader } from "@/components/seller/SellerPageHeader";
import { SellerMercadoLivreIntegrationPanel } from "@/components/seller/SellerMercadoLivreIntegrationPanel";

export default function SellerIntegracoesMarketplacePage() {
  return (
    <div className="bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-5">
      <SellerNav active="integracoes" wide />
      <div className="dropcore-shell-6xl space-y-5 pt-5 md:space-y-6 md:pt-7 pb-5 md:pb-7">
        <SellerPageHeader
          surface="hero"
          title="Marketplace"
          subtitle={
            <>
              Conecte suas contas de marketplace pra{" "}
              <span className="font-medium text-[var(--foreground)]">
                alimentar os gestores de IA com dado real da sua loja
              </span>
              .
            </>
          }
        />
        <SellerMercadoLivreIntegrationPanel />
      </div>
    </div>
  );
}
