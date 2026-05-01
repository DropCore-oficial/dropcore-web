import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OrgAuthError, requireAdminForOrgId } from "@/lib/apiOrgAuth";

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
    const enable = body?.enable as boolean | undefined;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!orgId || !uuidRegex.test(orgId)) {
      return jsonNoStore({ error: "orgId inválido" }, 400);
    }

    if (!memberId || !uuidRegex.test(memberId)) {
      return jsonNoStore({ error: "memberId inválido" }, 400);
    }

    if (typeof enable !== "boolean") {
      return jsonNoStore({ error: "enable deve ser boolean" }, 400);
    }

    const { user_id: actorUserId } = await requireAdminForOrgId(req, orgId);

    if (actorUserId === memberId) {
      return jsonNoStore(
        { error: "Você não pode alterar o próprio acesso financeiro." },
        400
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !service) {
      return jsonNoStore({ error: "Env SUPABASE_SERVICE_ROLE_KEY ausente" }, 500);
    }

    const adminClient = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (!enable) {
      const { data: target, error: tErr } = await adminClient
        .from("org_members")
        .select("role_base")
        .eq("org_id", orgId)
        .eq("user_id", memberId)
        .maybeSingle();

      if (tErr) {
        console.error("toggle-finance: erro ao buscar role do alvo", {
          message: tErr.message,
          orgId,
          memberId,
        });
        return jsonNoStore({ error: tErr.message }, 500);
      }

      if ((target as { role_base?: string })?.role_base === "owner") {
        return jsonNoStore(
          { error: "Não é permitido revogar o acesso financeiro de um owner." },
          400
        );
      }
    }

    const { error: rpcErr } = await adminClient.rpc("rpc_toggle_finance_access", {
      p_org_id: orgId,
      p_user_id: memberId,
      p_enable: enable,
    });

    if (rpcErr) {
      console.error("toggle-finance: erro na RPC rpc_toggle_finance_access", {
        message: rpcErr.message,
        orgId,
        memberId,
        enable,
      });
      return jsonNoStore({ error: rpcErr.message }, 500);
    }

    return jsonNoStore({ ok: true }, 200);
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return jsonNoStore({ error: e.message }, e.statusCode);
    }
    console.error("toggle-finance: erro inesperado", e);
    const msg = e instanceof Error ? e.message : "Erro interno";
    return jsonNoStore({ error: msg }, 500);
  }
}
