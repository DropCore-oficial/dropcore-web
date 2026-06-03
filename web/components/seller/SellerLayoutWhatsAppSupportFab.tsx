"use client";

import { usePathname } from "next/navigation";
import { SellerWhatsAppSupportFab } from "@/components/seller/SellerWhatsAppSupportFab";
import { getSellerSupportWhatsAppPrefill } from "@/lib/sellerSupportWhatsAppPrefill";

/** FAB de suporte no WhatsApp: visível inclusive no login; mensagem conforme a rota. */
export function SellerLayoutWhatsAppSupportFab() {
  const pathname = usePathname() ?? "";
  const prefillMessage = getSellerSupportWhatsAppPrefill(pathname);
  return <SellerWhatsAppSupportFab prefillMessage={prefillMessage} />;
}
