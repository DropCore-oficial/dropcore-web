"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MensalidadeBloqueioGate } from "@/components/MensalidadeBloqueioGate";
import { SellerCadastroRedirect } from "@/components/seller/SellerCadastroRedirect";
import { SellerLayoutWhatsAppSupportFab } from "@/components/seller/SellerLayoutWhatsAppSupportFab";
import { SellerPortalGate } from "@/components/seller/SellerPortalGate";

export default function SellerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Rota da calculadora do seller não passa pelos gates de portal/mensalidade.
  if (pathname.startsWith("/seller/calculadora")) {
    return (
      <>
        {children}
        <SellerLayoutWhatsAppSupportFab />
      </>
    );
  }

  return (
    <SellerPortalGate>
      <MensalidadeBloqueioGate context="seller" logoHref="/seller/dashboard">
        <SellerCadastroRedirect>{children}</SellerCadastroRedirect>
        <SellerLayoutWhatsAppSupportFab />
      </MensalidadeBloqueioGate>
    </SellerPortalGate>
  );
}
