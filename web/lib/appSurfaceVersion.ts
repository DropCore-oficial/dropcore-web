/** Portais autenticados — cada um tem buildId próprio (hash dos arquivos da área). */
export type AppSurface = "seller" | "fornecedor" | "admin" | "org";

export function surfaceBuildIdEnvKey(surface: AppSurface): string {
  return `NEXT_PUBLIC_BUILD_ID_${surface.toUpperCase()}`;
}

/** BuildId do portal no bundle do browser (inlined no build). */
export function getClientSurfaceBuildId(surface: AppSurface): string {
  const map: Record<AppSurface, string | undefined> = {
    seller: process.env.NEXT_PUBLIC_BUILD_ID_SELLER,
    fornecedor: process.env.NEXT_PUBLIC_BUILD_ID_FORNECEDOR,
    admin: process.env.NEXT_PUBLIC_BUILD_ID_ADMIN,
    org: process.env.NEXT_PUBLIC_BUILD_ID_ORG,
  };
  const id = map[surface]?.trim();
  if (id) return id;
  return process.env.NEXT_PUBLIC_BUILD_ID?.trim() || "dev";
}

/** BuildId do portal no servidor (API). */
export function getServerSurfaceBuildId(surface: AppSurface): string {
  const key = surfaceBuildIdEnvKey(surface);
  const fromEnv = process.env[key]?.trim();
  if (fromEnv) return fromEnv;
  return process.env.NEXT_PUBLIC_BUILD_ID?.trim() || "dev";
}

export function isDevBuildId(id: string): boolean {
  return id === "dev" || id === "local" || id.startsWith("local-") || id === "empty";
}

export function parseAppSurface(raw: string | null | undefined): AppSurface | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "seller" || s === "fornecedor" || s === "admin" || s === "org") return s;
  return null;
}
