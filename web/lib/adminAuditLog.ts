import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRequestIp } from "@/lib/requestIp";

/**
 * Grava uma linha em admin_audit_log. Best-effort: nunca lança — uma falha ao registrar
 * auditoria não pode derrubar a ação real (exclusão, aprovação de PIX, etc).
 */
export async function logAdminAction(params: {
  req: Request;
  orgId: string;
  actorUserId: string;
  action: string;
  targetTable?: string;
  targetId?: string;
  detalhes?: Record<string, unknown>;
}): Promise<void> {
  const { req, orgId, actorUserId, action, targetTable, targetId, detalhes } = params;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(actorUserId);
    const actorEmail = data?.user?.email ?? null;

    await supabaseAdmin.from("admin_audit_log").insert({
      org_id: orgId,
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      ip_address: getRequestIp(req),
      user_agent: req.headers.get("user-agent"),
      action,
      target_table: targetTable ?? null,
      target_id: targetId ?? null,
      detalhes: detalhes ?? null,
    });
  } catch (e) {
    console.warn(
      JSON.stringify({ level: "warn", event: "admin_audit_log.failed", action, message: e instanceof Error ? e.message : String(e) })
    );
  }
}
