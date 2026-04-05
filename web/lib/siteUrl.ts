/** URL pública do site (OG, links, redirects). Sem barra final. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://dropcore.com.br";
  return raw.replace(/\/$/, "");
}
