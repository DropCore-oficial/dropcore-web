"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";

const PATHS_SEM_RODAPE = ["/login", "/seller/login", "/fornecedor/login", "/calculadora/login", "/verificar-dispositivo"];

/** Páginas públicas institucionais — sem SellerNav/FornecedorNav/AdminMobileBottomNav fixo,
 * igual à landing ("/"), por isso também usam `compactMobilePadding`. */
const PATHS_SEM_NAV_FIXO = ["/", "/sobre", "/termos-de-uso", "/privacidade", "/central-de-ajuda"];

/** Rodapé do sistema some só nas telas de login (tela de auth enxuta, sem o bloco
 * institucional embaixo); no resto do site — inclusive a home/landing pública ("/") —
 * continua aparecendo. */
/** Prefixo da área atual — usado pra apontar "Links Úteis" pra versão de dentro da área
 * (ex.: `/seller/termos-de-uso`, com o SellerNav) em vez da pública, quando o visitante já
 * está navegando dentro do painel de seller/fornecedor/admin. */
function areaPrefixFromPathname(pathname: string): "" | "/seller" | "/fornecedor" | "/admin" {
  if (pathname.startsWith("/seller")) return "/seller";
  if (pathname.startsWith("/fornecedor")) return "/fornecedor";
  if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) return "/admin";
  return "";
}

const SOBRE_TEXTO_GESTORES_IA =
  "Gestor de IA + Calculadora pra quem vende no Mercado Livre — análise de anúncio, " +
  "reputação e margem de lucro, sem precisar virar seller do hub DropCore.";
const SOBRE_TEXTO_CALCULADORA =
  "Calculadora de custo e margem pra quem vende em marketplace — simule taxa, frete e " +
  "lucro antes de criar o anúncio.";

/** Produto avulso (fora do hub) usa um texto "Sobre" próprio — o do hub fala de
 * fornecedor/catálogo/repasse, que não existe pra quem só assina Calculadora/Gestor de IA. */
function sobreTextoFromPathname(pathname: string): string | undefined {
  if (pathname.startsWith("/seller/gestores-ia-avulso")) return SOBRE_TEXTO_GESTORES_IA;
  if (pathname.startsWith("/seller/calculadora")) return SOBRE_TEXTO_CALCULADORA;
  return undefined;
}

export function ConditionalFooter() {
  const pathname = usePathname();
  if (PATHS_SEM_RODAPE.includes(pathname)) return null;
  // Landing e páginas institucionais não têm barra de navegação fixa no mobile — não
  // precisam do respiro extra que o resto do sistema reserva pra não ficar embaixo dela
  // (ver comentário em SiteFooter.tsx).
  return (
    <SiteFooter
      compactMobilePadding={PATHS_SEM_NAV_FIXO.includes(pathname)}
      areaPrefix={areaPrefixFromPathname(pathname)}
      sobreTexto={sobreTextoFromPathname(pathname)}
    />
  );
}
