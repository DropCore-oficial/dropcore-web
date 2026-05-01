"use client";

import { MensalidadeBloqueioGate } from "@/components/MensalidadeBloqueioGate";
import { FornecedorPortalGate } from "@/components/fornecedor/FornecedorPortalGate";

export default function FornecedorLayout({ children }: { children: React.ReactNode }) {
  return (
    <FornecedorPortalGate>
      <MensalidadeBloqueioGate context="fornecedor" logoHref="/fornecedor/dashboard">
        {children}
      </MensalidadeBloqueioGate>
    </FornecedorPortalGate>
  );
}
