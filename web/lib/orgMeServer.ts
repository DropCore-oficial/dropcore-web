/**
 * Resolve sessão Supabase + membership na org (mesma lógica de GET /api/org/me).
 * Usado em memória pelas rotas /api/org/* — evita fetch HTTP interno (previews Vercel, HTML de erro).
 */
import { createClient } from "@supabase/supabase-js";

export type OrgMeSuccess = {
  ok: true;
  user_id: string;
  org_id: string | null;
  role_base: "owner" | "admin" | "operacional" | null;
  pode_ver_dinheiro: boolean | null;
  plano: string;
};

export type OrgMeFailure = { ok: false; error: string; httpStatus: number };

export async function resolveOrgMe(req: Request): Promise<OrgMeSuccess | OrgMeFailure> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) {
    return { ok: false, error: "Configuração Supabase ausente (URL ou ANON).", httpStatus: 500 };
  }
  if (!serviceKey) {
    return { ok: false, error: "Configuração SUPABASE_SERVICE_ROLE_KEY ausente.", httpStatus: 500 };
  }

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return { ok: false, error: "Sem token (Authorization).", httpStatus: 401 };
    }

    const sb = createClient(url, anon, { auth: { persistSession: false } });

    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) {
      return { ok: false, error: "Token inválido ou expirado.", httpStatus: 401 };
    }

    const user = userData.user;

    const sbAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: member, error: mErr } = await sbAdmin
      .from("org_members")
      .select("org_id, role_base, pode_ver_dinheiro")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (mErr) {
      return { ok: false, error: mErr.message, httpStatus: 500 };
    }

    if (!member?.org_id) {
      return {
        ok: true,
        user_id: user.id,
        org_id: null,
        role_base: null,
        pode_ver_dinheiro: null,
        plano: "starter",
      };
    }

    const { data: org } = await sbAdmin.from("orgs").select("plano").eq("id", member.org_id).maybeSingle();

    const roleBase = (member.role_base ?? null) as OrgMeSuccess["role_base"];

    return {
      ok: true,
      user_id: user.id,
      org_id: member.org_id,
      role_base: roleBase,
      pode_ver_dinheiro: member.pode_ver_dinheiro ?? null,
      plano: org?.plano ?? "starter",
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    console.error("resolveOrgMe:", msg);
    return { ok: false, error: msg, httpStatus: 500 };
  }
}
