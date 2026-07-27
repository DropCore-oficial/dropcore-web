"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";

const PATHS_SEM_RODAPE = ["/", "/login", "/seller/login", "/fornecedor/login", "/calculadora/login"];

/** Rodapé do sistema some na home ("/em breve") e nas telas de login (tela de auth
 * enxuta, sem o bloco institucional embaixo); no resto do site continua aparecendo. */
export function ConditionalFooter() {
  const pathname = usePathname();
  if (PATHS_SEM_RODAPE.includes(pathname)) return null;
  return <SiteFooter />;
}
