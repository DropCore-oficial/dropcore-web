 "use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MensalidadeBloqueioGate } from "@/components/MensalidadeBloqueioGate";

export default function SellerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Rota da calculadora do seller não passa pelo gate de mensalidade.
  if (pathname.startsWith("/seller/calculadora")) {
    return <>{children}</>;
  }

  return (
    <MensalidadeBloqueioGate context="seller" logoHref="/seller/dashboard">
      {children}
    </MensalidadeBloqueioGate>
  );
}
