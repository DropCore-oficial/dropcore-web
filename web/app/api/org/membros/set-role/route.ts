import { NextResponse } from "next/server";
import { OrgAuthError, requireOwnerForOrgId } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";
import { logAdminAction } from "@/lib/adminAuditLog";

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
    const role = body?.role as "owner" | "admin" | "operacional" | undefined;

    if (!orgId) return jsonNoStore({ error: "orgId é obrigatório" }, 400);
    if (!memberId) return jsonNoStore({ error: "memberId é obrigatório" }, 400);
    if (!role) return jsonNoStore({ error: "role é obrigatório" }, 400);

    if (!["owner", "admin", "operacional"].includes(role)) {
      return jsonNoStore({ error: "role inválido" }, 400);
    }

    const { user_id: actorId } = await requireOwnerForOrgId(req, orgId);

    if (memberId === actorId && role === "operacional") {
      return jsonNoStore(
        { error: "Você não pode se rebaixar para operacional (evita perder acesso)." },
        400
      );
    }

    const { data: membroAtual } = await supabaseAdmin
      .from("org_members")
      .select("role_base")
      .eq("org_id", orgId)
      .eq("user_id", memberId)
      .maybeSingle();
    const roleAnterior = membroAtual?.role_base as string | undefined;

    const { error: upErr } = await supabaseAdmin
      .from("org_members")
      .update({ role_base: role })
      .eq("org_id", orgId)
      .eq("user_id", memberId);

    if (upErr) return jsonNoStore({ error: upErr.message }, 500);

    await logAdminAction({
      req,
      orgId,
      actorUserId: actorId,
      action: "membro.mudar_papel",
      targetTable: "org_members",
      targetId: memberId,
      detalhes: { role_anterior: roleAnterior ?? null, role_novo: role },
    });

    const ganhouAcessoPrivilegiado =
      (role === "owner" || role === "admin") && roleAnterior !== "owner" && roleAnterior !== "admin";

    if (ganhouAcessoPrivilegiado) {
      const { data: owners } = await supabaseAdmin
        .from("org_members")
        .select("user_id")
        .eq("org_id", orgId)
        .in("role_base", ["owner", "admin"])
        .neq("user_id", actorId);

      if (owners?.length) {
        const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(memberId);
        const targetEmail = targetUser?.user?.email ?? "Um membro";
        const mensagem = `${targetEmail} foi promovido a ${role === "owner" ? "owner" : "admin"} na sua organização DropCore.`;
        await Promise.all(
          owners
            .filter((o) => o.user_id)
            .map((o) =>
              notifyUserEmail({
                userId: o.user_id as string,
                subject: "Novo admin/owner na sua organização DropCore",
                titulo: "Permissão de acesso alterada",
                mensagem,
              })
            )
        );
      }
    }

    return jsonNoStore({ ok: true }, 200);
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return jsonNoStore({ error: e.message }, e.statusCode);
    }
    const msg = e instanceof Error ? e.message : "Erro interno";
    return jsonNoStore({ error: msg }, 500);
  }
}
