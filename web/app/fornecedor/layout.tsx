"use client";

import { MensalidadeBloqueioGate } from "@/components/MensalidadeBloqueioGate";

export default function FornecedorLayout({ children }: { children: React.ReactNode }) {
  return (
    <MensalidadeBloqueioGate context="fornecedor" logoHref="/fornecedor/dashboard">
      {children}
    </MensalidadeBloqueioGate>
  );
}
