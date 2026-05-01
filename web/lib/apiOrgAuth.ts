/**
 * Helper para rotas /api/org/*: obtém usuário autenticado e membership (org_id, role_base).
 * Usado para proteger rotas SKU e outras que precisam de auth + org.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { resolveOrgMe } from "@/lib/orgMeServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  /**
   * Antes de exigir org_id: seller/fornecedor podem não ter linha em `org_members` e vir só com
   * `seller_id` / `fornecedor_id` — senão caíamos em "Usuário sem organização" em vez de bloquear portal.
   * Linha com papel “admin” + fornecedor_id continua bloqueada aqui.
   */
  if (r.fornecedor_id || r.seller_id) {
    throw new Error("Sem permissão.");
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

/**
 * Igual ao GET `/api/org/catalogo/search`: primeiro Bearer, depois sessão em cookie.
 * `resolveOrgMe` só aceita Bearer — rotas que precisam de cookie SSR usam isto.
 */
export async function getUserIdFromBearerOrCookies(req: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (bearer) {
    const sb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: u, error } = await sb.auth.getUser(bearer);
    if (!error && u?.user) return u.user.id;
  }

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
    },
  });
  const { data: userData, error: authErr } = await supabaseAuth.auth.getUser();
  if (!authErr && userData?.user) return userData.user.id;
  return null;
}

export type OrgCatalogStaff = {
  role_base: string;
  isAdmin: boolean;
  isOperacional: boolean;
};

/**
 * Membro da org com papel owner/admin/operacional para um **org_id** explícito (query).
 * Anti-IDOR: valida `org_members` para aquele org, não só o “primeiro” org do usuário.
 */
export async function requireOrgStaffForOrgId(req: Request, orgId: string): Promise<OrgCatalogStaff> {
  const userId = await getUserIdFromBearerOrCookies(req);
  if (!userId) {
    throw new OrgAuthError("Não autenticado", 401);
  }

  const { data: member, error: memErr } = await supabaseAdmin
    .from("org_members")
    .select("role_base")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .maybeSingle();

  if (memErr) {
    throw new OrgAuthError("Erro ao verificar permissões", 500);
  }

  const role = String(member?.role_base ?? "");
  const isAdmin = ["owner", "admin"].includes(role);
  const isOperacional = role === "operacional";
  if (!member || (!isAdmin && !isOperacional)) {
    throw new OrgAuthError("Sem permissão", 403);
  }

  return { role_base: role, isAdmin, isOperacional };
}

/**
 * **Owner** ou **admin** para um `org_id` explícito (body/query).
 * Use quando o papel deve ser validado na **mesma org** da operação (anti-IDOR).
 */
export async function requireAdminForOrgId(req: Request, orgId: string): Promise<{ user_id: string }> {
  const userId = await getUserIdFromBearerOrCookies(req);
  if (!userId) {
    throw new OrgAuthError("Não autenticado", 401);
  }

  const { data: row, error } = await supabaseAdmin
    .from("org_members")
    .select("role_base")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .maybeSingle();

  if (error) {
    throw new OrgAuthError(error.message, 500);
  }

  const role = String(row?.role_base ?? "");
  if (!row || (role !== "owner" && role !== "admin")) {
    throw new OrgAuthError("Sem permissão.", 403);
  }

  return { user_id: userId };
}

/**
 * Apenas **owner** para um `org_id` explícito (body/query).
 * Use quando a operação deve ser exclusiva do dono da org (ex.: alterar papéis de membros).
 */
export async function requireOwnerForOrgId(req: Request, orgId: string): Promise<{ user_id: string }> {
  const userId = await getUserIdFromBearerOrCookies(req);
  if (!userId) {
    throw new OrgAuthError("Não autenticado", 401);
  }

  const { data: row, error } = await supabaseAdmin
    .from("org_members")
    .select("role_base")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .maybeSingle();

  if (error) {
    throw new OrgAuthError(error.message, 500);
  }

  const role = String(row?.role_base ?? "");
  if (!row || role !== "owner") {
    throw new OrgAuthError(
      "Apenas o proprietário (owner) pode alterar papéis. Administradores podem convidar pessoas (como operacional) mas não promover a admin.",
      403
    );
  }

  return { user_id: userId };
}
