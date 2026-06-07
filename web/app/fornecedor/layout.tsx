"use client";

import { MensalidadeBloqueioGate } from "@/components/MensalidadeBloqueioGate";
import { FornecedorPortalGate } from "@/components/fornecedor/FornecedorPortalGate";
import { AppVersionUpdateBanner } from "@/components/AppVersionUpdateBanner";

export default function FornecedorLayout({ children }: { children: React.ReactNode }) {
  return (
    <FornecedorPortalGate>
      <AppVersionUpdateBanner surface="fornecedor" requireAuth />
      <MensalidadeBloqueioGate context="fornecedor" logoHref="/fornecedor/dashboard">
        {children}
      </MensalidadeBloqueioGate>
    </FornecedorPortalGate>
  );
}
