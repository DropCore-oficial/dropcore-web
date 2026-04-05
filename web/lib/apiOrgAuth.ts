/**
 * Helper para rotas /api/org/*: obtém usuário autenticado e membership (org_id, role_base).
 * Usado para proteger rotas SKU e outras que precisam de auth + org.
 */

import { resolveOrgMe } from "@/lib/orgMeServer";

export type Me = { org_id: string; role_base: "owner" | "admin" | "operacional"; plano?: string };

/** Erro com status HTTP para rotas mapearem NextResponse sem fetch interno. */
export class OrgAuthError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "OrgAuthError";
    this.statusCode = statusCode;
  }
}

export function orgErrorHttpStatus(e: unknown): number {
  if (e instanceof OrgAuthError) return e.statusCode;
  const msg = e instanceof Error ? e.message : "";
  if (msg === "Sem permissão.") return 403;
  return 500;
}

export async function getMe(req: Request): Promise<Me> {
  const r = await resolveOrgMe(req);
  if (!r.ok) {
    throw new OrgAuthError(r.error, r.httpStatus);
  }
  if (!r.org_id) {
    throw new OrgAuthError("Usuário sem organização.", 401);
  }
  if (!r.role_base) {
    throw new OrgAuthError("Usuário sem organização.", 401);
  }
  return { org_id: r.org_id, role_base: r.role_base, plano: r.plano };
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
