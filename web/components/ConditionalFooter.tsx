"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";

const PATHS_SEM_RODAPE = ["/login", "/seller/login", "/fornecedor/login", "/calculadora/login", "/verificar-dispositivo"];

/** Rodapé do sistema some só nas telas de login (tela de auth enxuta, sem o bloco
 * institucional embaixo); no resto do site — inclusive a home/landing pública ("/") —
 * continua aparecendo. */
export function ConditionalFooter() {
  const pathname = usePathname();
  if (PATHS_SEM_RODAPE.includes(pathname)) return null;
  // Landing não tem barra de navegação fixa no mobile — não precisa do respiro extra que o
  // resto do sistema reserva pra não ficar embaixo dela (ver comentário em SiteFooter.tsx).
  return <SiteFooter compactMobilePadding={pathname === "/"} />;
}
