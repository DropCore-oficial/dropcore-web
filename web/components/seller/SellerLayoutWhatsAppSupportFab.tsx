"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SellerWhatsAppSupportFab } from "@/components/seller/SellerWhatsAppSupportFab";
import { getSellerSupportWhatsAppPrefill } from "@/lib/sellerSupportWhatsAppPrefill";

const AVULSO_BOTTOM_CLASS = "bottom-[calc(9rem+env(safe-area-inset-bottom,0px))] md:bottom-5";

/** FAB de suporte no WhatsApp: visível inclusive no login; mensagem conforme a rota.
 *
 * Offset vertical maior nas páginas do Avulso (achado da crítica Impeccable 2026-10-14):
 * no hub, o canto do escritório 3D fica embaixo do FAB em mobile; no chat do Gestor
 * (`/tiago`), a primeira tela (sem mensagem nenhuma ainda) deixava o botão "Enviar" a só
 * ~17px do FAB, com sobreposição horizontal — risco real de toque errado.
 *
 * `bottomClassName` só é aplicado depois do mount (`useEffect`), nunca no primeiro render:
 * esse layout é prerenderizado sem o pathname real da sub-rota (bug pré-existente e dormente
 * de `usePathname()` aqui — nenhuma rota do Avulso tinha antes um `if` que dependesse do
 * pathname pra escolher classe/atributo, então o SSR "errado" nunca aparecia). Calcular esse
 * valor direto no render causava mismatch de hidratação real; adiar pro efeito evita.
 */
export function SellerLayoutWhatsAppSupportFab() {
  const pathname = usePathname() ?? "";
  const prefillMessage = getSellerSupportWhatsAppPrefill(pathname);
  const [bottomClassName, setBottomClassName] = useState<string | undefined>(undefined);

  useEffect(() => {
    setBottomClassName(pathname.startsWith("/seller/gestores-ia-avulso") ? AVULSO_BOTTOM_CLASS : undefined);
  }, [pathname]);

  return <SellerWhatsAppSupportFab prefillMessage={prefillMessage} bottomClassName={bottomClassName} />;
}
