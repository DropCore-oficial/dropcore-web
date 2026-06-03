import type { AppSurface } from "@/lib/appSurfaceVersion";

/** Todas as telas de login — banner de versão e chrome de portal ficam desligados. */
const LOGIN_PATHS = new Set([
  "/login",
  "/seller/login",
  "/fornecedor/login",
  "/calculadora/login",
]);

export function isDropcoreLoginPath(pathname: string): boolean {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return LOGIN_PATHS.has(path);
}

/** Cadastro/recuperação por portal (seller/fornecedor). */
const PUBLIC_BY_SURFACE: Partial<Record<AppSurface, readonly string[]>> = {
  seller: ["/seller/register", "/seller/reset-password", "/seller/calculadora"],
  fornecedor: ["/fornecedor/register"],
};

export function isPortalPublicPath(pathname: string, surface: AppSurface): boolean {
  if (isDropcoreLoginPath(pathname)) return true;
  const prefixes = PUBLIC_BY_SURFACE[surface];
  if (!prefixes?.length) return false;
  return prefixes.some((p) => pathname.startsWith(p));
}
