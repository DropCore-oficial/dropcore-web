import { NextResponse } from "next/server";
import { OrgAuthError, requireAdminForOrgId } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getEnvServiceOk(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!(url && serviceRole);
}

/* =========================
   GET — LISTAR MEMBROS
========================= */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) return jsonNoStore({ error: "orgId é obrigatório" }, 400);

    if (!getEnvServiceOk()) {
      return jsonNoStore({ error: "Env SUPABASE_SERVICE_ROLE_KEY ausente" }, 500);
    }

    await requireAdminForOrgId(req, orgId);

    /**
     * Portal fornecedor/seller usa a mesma tabela `org_members` com `fornecedor_id` / `seller_id`.
     * O convite de armazém até grava `role_base: admin` por compatibilidade com RLS — não é equipe Membros.
     */
    const { data: members, error: memErr } = await supabaseAdmin
      .from("org_members")
      .select("id, user_id, role_base, pode_ver_dinheiro")
      .eq("org_id", orgId)
      .is("fornecedor_id", null)
      .is("seller_id", null);

    if (memErr) return jsonNoStore({ error: memErr.message }, 500);

    if (!members || members.length === 0) {
      return jsonNoStore({ data: [] }, 200);
    }

    const userIds = Array.from(
      new Set(members.map((m) => m.user_id).filter(Boolean))
    );

    let emailMap = new Map<string, string>();

    const { data: emails, error: emailErr } = await supabaseAdmin.rpc(
      "rpc_get_emails_by_user_ids",
      { p_user_ids: userIds }
    );

    if (!emailErr && emails?.length) {
      (emails as { user_id: string; email: string }[]).forEach((r) =>
        emailMap.set(r.user_id, r.email || "")
      );
    } else {
      for (const uid of userIds) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        emailMap.set(uid, u?.user?.email ?? "—");
      }
    }

    const formatted = members.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      email: emailMap.get(m.user_id) || "—",
      role_base: m.role_base,
      pode_ver_dinheiro: !!m.pode_ver_dinheiro,
    }));

    return jsonNoStore({ data: formatted }, 200);
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return jsonNoStore({ error: e.message }, e.statusCode);
    }
    const msg = e instanceof Error ? e.message : "Erro interno";
    return jsonNoStore({ error: msg }, 500);
  }
}

/* =========================
   POST — ADICIONAR MEMBRO
========================= */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const orgId = body?.orgId as string | undefined;
    const email = (body?.email as string | undefined)?.trim()?.toLowerCase();

    if (!orgId) return jsonNoStore({ error: "orgId é obrigatório" }, 400);
    if (!email) return jsonNoStore({ error: "email é obrigatório" }, 400);

    if (!getEnvServiceOk()) {
      return jsonNoStore({ error: "Env SUPABASE_SERVICE_ROLE_KEY ausente" }, 500);
    }

    await requireAdminForOrgId(req, orgId);

    const { data: userId, error: findErr } = await supabaseAdmin.rpc(
      "rpc_get_user_id_by_email",
      { p_email: email }
    );

    if (findErr) return jsonNoStore({ error: findErr.message }, 500);
    if (!userId) {
      return jsonNoStore(
        { error: "Usuário não encontrado (crie a conta e depois adicione)" },
        404
      );
    }

    const { data: exists, error: exErr } = await supabaseAdmin
      .from("org_members")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (exErr) return jsonNoStore({ error: exErr.message }, 500);
    if (exists?.id) {
      return jsonNoStore({ error: "Membro já existe nessa organização" }, 409);
    }

    const { error: insErr } = await supabaseAdmin.from("org_members").insert({
      org_id: orgId,
      user_id: userId,
      role_base: "operacional",
      pode_ver_dinheiro: false,
    });

    if (insErr) return jsonNoStore({ error: insErr.message }, 500);

    return jsonNoStore({ ok: true }, 200);
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return jsonNoStore({ error: e.message }, e.statusCode);
    }
    const msg = e instanceof Error ? e.message : "Erro interno";
    return jsonNoStore({ error: msg }, 500);
  }
}
