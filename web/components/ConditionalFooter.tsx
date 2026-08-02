"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";

const PATHS_SEM_RODAPE = ["/", "/login", "/seller/login", "/fornecedor/login", "/calculadora/login", "/landing"];

/** Rodapé do sistema some na home ("/em breve"), nas telas de login (tela de auth
 * enxuta, sem o bloco institucional embaixo) e na landing pública (que tem rodapé
 * próprio — `LandingFooter` dentro de `LandingPage.tsx` — sem o versículo/tom
 * institucional, porque é a primeira impressão de um visitante frio, não de quem já
 * é cliente logado); no resto do site continua aparecendo. */
export function ConditionalFooter() {
  const pathname = usePathname();
  if (PATHS_SEM_RODAPE.includes(pathname)) return null;
  return <SiteFooter />;
}
