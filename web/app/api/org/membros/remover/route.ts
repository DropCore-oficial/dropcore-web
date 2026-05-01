import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OrgAuthError, requireAdminForOrgId } from "@/lib/apiOrgAuth";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const orgId = body?.orgId as string | undefined;
    const memberId = body?.memberId as string | undefined;

    if (!orgId || !uuidRegex.test(orgId))
      return jsonNoStore({ error: "orgId inválido" }, 400);

    if (!memberId || !uuidRegex.test(memberId))
      return jsonNoStore({ error: "memberId inválido" }, 400);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !service) {
      return jsonNoStore({ error: "Env SUPABASE_SERVICE_ROLE_KEY ausente" }, 500);
    }

    const { user_id: actorId } = await requireAdminForOrgId(req, orgId);

    if (actorId === memberId) {
      return jsonNoStore(
        { error: "Você não pode se excluir da organização." },
        409
      );
    }

    const adminClient = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: myMembership, error: myErr } = await adminClient
      .from("org_members")
      .select("role_base")
      .eq("org_id", orgId)
      .eq("user_id", actorId)
      .maybeSingle();

    if (myErr) return jsonNoStore({ error: myErr.message }, 500);

    const myRole = (myMembership as { role_base?: string })?.role_base;

    const { data: target, error: tErr } = await adminClient
      .from("org_members")
      .select("id, role_base")
      .eq("org_id", orgId)
      .eq("user_id", memberId)
      .maybeSingle();

    if (tErr) return jsonNoStore({ error: tErr.message }, 500);
    if (!target?.id) return jsonNoStore({ error: "Membro não encontrado na organização" }, 404);

    const targetRole = String((target as { role_base?: string }).role_base ?? "");

    if (myRole === "admin" && (targetRole === "owner" || targetRole === "admin")) {
      return jsonNoStore(
        {
          error:
            "Apenas o proprietário (owner) pode remover administradores ou outros proprietários.",
        },
        403
      );
    }

    if (targetRole === "owner") {
      const { count, error: cErr } = await adminClient
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("role_base", "owner");

      if (cErr) return jsonNoStore({ error: cErr.message }, 500);

      if ((count || 0) <= 1) {
        return jsonNoStore(
          { error: "Não é possível excluir o último proprietário da organização." },
          409
        );
      }
    }

    const { error: delErr } = await adminClient
      .from("org_members")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", memberId);

    if (delErr) return jsonNoStore({ error: delErr.message }, 500);

    return jsonNoStore({ ok: true }, 200);
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return jsonNoStore({ error: e.message }, e.statusCode);
    }
    const msg = e instanceof Error ? e.message : "Erro interno";
    return jsonNoStore({ error: msg }, 500);
  }
}
