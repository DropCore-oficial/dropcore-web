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

  // Calculadora e Gestores de IA avulso (contas calc_only, sem seller/org no hub) não
  // passam pelos gates de portal/mensalidade/depósito — esses exigem uma linha em `sellers`
  // que esse tipo de conta nunca tem.
  if (
    pathname.startsWith("/seller/calculadora") ||
    pathname.startsWith("/seller/gestores-ia-avulso") ||
    pathname.startsWith("/seller/meus-dados")
  ) {
    return (
      <>
        <AppVersionUpdateBanner surface="seller" requireAuth />
        {children}
        <SellerLayoutWhatsAppSupportFab />
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
