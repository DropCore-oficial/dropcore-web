"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";

/** Rodapé do sistema some só na home ("/em breve"); no resto do site continua aparecendo normalmente. */
export function ConditionalFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <SiteFooter />;
}
