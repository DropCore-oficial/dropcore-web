"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MensalidadeBloqueioGate } from "@/components/MensalidadeBloqueioGate";
import { SellerCadastroRedirect } from "@/components/seller/SellerCadastroRedirect";
import { SellerDepositoObrigatorioGate } from "@/components/seller/SellerDepositoObrigatorioGate";
import { SellerLayoutWhatsAppSupportFab } from "@/components/seller/SellerLayoutWhatsAppSupportFab";
import { SellerPortalGate } from "@/components/seller/SellerPortalGate";
import { AppVersionUpdateBanner } from "@/components/AppVersionUpdateBanner";

export default function SellerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Rota da calculadora do seller não passa pelos gates de portal/mensalidade.
  if (pathname.startsWith("/seller/calculadora")) {
    return (
      <>
        <AppVersionUpdateBanner surface="seller" requireAuth />
        {children}
      </>
    );
  }

  return (
    <SellerPortalGate>
      <AppVersionUpdateBanner surface="seller" requireAuth />
      <MensalidadeBloqueioGate context="seller" logoHref="/seller/dashboard">
        <SellerDepositoObrigatorioGate>
          <SellerCadastroRedirect>{children}</SellerCadastroRedirect>
          <SellerLayoutWhatsAppSupportFab />
        </SellerDepositoObrigatorioGate>
      </MensalidadeBloqueioGate>
    </SellerPortalGate>
  );
}
