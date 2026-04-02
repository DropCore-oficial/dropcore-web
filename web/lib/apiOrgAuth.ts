/**
 * Helper para rotas /api/org/*: obtém usuário autenticado e membership (org_id, role_base).
 * Usado para proteger rotas SKU e outras que precisam de auth + org.
 */

export type Me = { org_id: string; role_base: "owner" | "admin" | "operacional"; plano?: string };

export async function getMe(req: Request): Promise<Me> {
  const headers: Record<string, string> = {
    cookie: req.headers.get("cookie") || "",
  };
  const auth = req.headers.get("authorization");
  if (auth) headers["Authorization"] = auth;

  // Usa variável de ambiente para evitar SSRF via Host header manipulation
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  const r = await fetch(new URL("/api/org/me", baseUrl), {
    headers,
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Unauthorized");
  if (!j?.org_id) throw new Error("Usuário sem organização.");
  return j as Me;
}

/** Exige owner ou admin; retorna { org_id, role_base } ou 403. */
export async function requireAdmin(req: Request): Promise<Me> {
  const me = await getMe(req);
  if (me.role_base !== "owner" && me.role_base !== "admin") {
    throw new Error("Sem permissão.");
  }
  return me;
}

/** Exige owner (dono da plataforma); retorna me ou 403. */
export async function requireOwner(req: Request): Promise<Me> {
  const me = await getMe(req);
  if (me.role_base !== "owner") {
    throw new Error("Sem permissão.");
  }
  return me;
}
