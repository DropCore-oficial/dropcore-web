/**
 * Helper para rotas /api/org/*: obtém usuário autenticado e membership (org_id, role_base).
 * Usado para proteger rotas SKU e outras que precisam de auth + org.
 */

export type Me = { org_id: string; role_base: "owner" | "admin" | "operacional"; plano?: string };

function hostnameOnly(host: string): string {
  return host.split(":")[0].trim().toLowerCase();
}

/**
 * Só chama /api/org/me no mesmo “site” que recebeu o request (evita preview Vercel
 * usar NEXT_PUBLIC_APP_URL da produção e receber HTML “The deployment…”).
 */
function isAllowedInternalHost(hostname: string): boolean {
  const h = hostnameOnly(hostname);
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h.endsWith(".vercel.app")) return true;
  if (h === "dropcore.com.br" || h === "www.dropcore.com.br") return true;
  const app = process.env.NEXT_PUBLIC_APP_URL;
  if (app) {
    try {
      if (new URL(app).hostname.toLowerCase() === h) return true;
    } catch {
      /* ignore */
    }
  }
  const vu = process.env.VERCEL_URL;
  if (vu && hostnameOnly(vu) === h) return true;
  return false;
}

function resolveInternalApiBaseUrl(req: Request): string {
  try {
    const u = new URL(req.url);
    if (isAllowedInternalHost(u.hostname)) {
      const proto = (u.protocol.replace(":", "") || "https") as string;
      return `${proto}://${u.host}`;
    }
  } catch {
    /* req.url inválido ou relativo */
  }
  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const xfProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (xfHost && isAllowedInternalHost(xfHost)) {
    return `${xfProto}://${xfHost}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://localhost:3000";
}

export async function getMe(req: Request): Promise<Me> {
  const headers: Record<string, string> = {
    cookie: req.headers.get("cookie") || "",
  };
  const auth = req.headers.get("authorization");
  if (auth) headers["Authorization"] = auth;

  const baseUrl = resolveInternalApiBaseUrl(req);
  const r = await fetch(new URL("/api/org/me", baseUrl), {
    headers,
    cache: "no-store",
  });
  const text = await r.text();
  let j: { ok?: boolean; org_id?: string; error?: string } | null = null;
  try {
    j = text ? (JSON.parse(text) as typeof j) : null;
  } catch {
    throw new Error(
      `Falha ao validar sessão (resposta não é JSON). Confirme o deploy e NEXT_PUBLIC_APP_URL.`,
    );
  }
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
