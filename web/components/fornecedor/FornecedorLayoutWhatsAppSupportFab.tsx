"use client";

import { usePathname } from "next/navigation";
import { FornecedorWhatsAppSupportFab } from "@/components/fornecedor/FornecedorWhatsAppSupportFab";
import { getFornecedorSupportWhatsAppPrefill } from "@/lib/fornecedorSupportWhatsAppPrefill";

/** FAB de suporte no WhatsApp: visível inclusive no login; mensagem conforme a rota. */
export function FornecedorLayoutWhatsAppSupportFab() {
  const pathname = usePathname() ?? "";
  const prefillMessage = getFornecedorSupportWhatsAppPrefill(pathname);
  return <FornecedorWhatsAppSupportFab prefillMessage={prefillMessage} />;
}
