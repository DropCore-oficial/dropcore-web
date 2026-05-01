/**
 * Resolve sessão Supabase + membership na org (mesma lógica de GET /api/org/me).
 * Usado em memória pelas rotas /api/org/* — evita fetch HTTP interno (previews Vercel, HTML de erro).
 */
import { createClient } from "@supabase/supabase-js";

export type OrgMeSuccess = {
  ok: true;
  user_id: string;
  org_id: string | null;
  fornecedor_id: string | null;
  /** Presente quando existe linha em `sellers` com este `user_id` (painel seller). */
  seller_id: string | null;
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

    const { data: sellerRow } = await sbAdmin.from("sellers").select("id").eq("user_id", user.id).maybeSingle();
    const seller_id = sellerRow?.id ?? null;

    /**
     * Importante: um mesmo `user_id` pode ter **várias** linhas em `org_members` (legado, convites,
     * ou papel admin + vínculo de armazém). `.limit(1)` sem critério fazia o PostgREST devolver só
     * uma linha arbitrária — se fosse a linha sem `fornecedor_id`, o fornecedor era tratado como
     * admin e enxergava o `/dashboard`. Alinhado a GET /api/fornecedor/me: qualquer linha com
     * `fornecedor_id` preenchido identifica o usuário como fornecedor.
     */
    const { data: rows, error: mErr } = await sbAdmin
      .from("org_members")
      .select("org_id, fornecedor_id, role_base, pode_ver_dinheiro")
      .eq("user_id", user.id)
      .order("org_id", { ascending: true });

    if (mErr) {
      return { ok: false, error: mErr.message, httpStatus: 500 };
    }

    if (!rows?.length) {
      return {
        ok: true,
        user_id: user.id,
        org_id: null,
        fornecedor_id: null,
        seller_id,
        role_base: null,
        pode_ver_dinheiro: null,
        plano: "starter",
      };
    }

    const fornecedor_id =
      rows.map((r) => r.fornecedor_id).find((id) => id != null && String(id).length > 0) ?? null;

    const member = rows[0];

    if (!member?.org_id) {
      return {
        ok: true,
        user_id: user.id,
        org_id: null,
        fornecedor_id,
        seller_id,
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
      fornecedor_id,
      seller_id,
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
