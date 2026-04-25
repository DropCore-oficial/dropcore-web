import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) return jsonNoStore({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const orgId = body?.orgId as string | undefined;
    const memberId = body?.memberId as string | undefined; // aqui é o USER_ID do alvo
    const enable = body?.enable as boolean | undefined;

    // validação UUID
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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anon) {
      return jsonNoStore(
        { error: "Env NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes" },
        500
      );
    }
    if (!service) {
      return jsonNoStore({ error: "Env SUPABASE_SERVICE_ROLE_KEY ausente" }, 500);
    }

    // 1) valida o usuário pelo token (anon)
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user?.id) {
      return jsonNoStore({ error: "Unauthorized" }, 401);
    }

    const actorUserId = me.user.id;

    // ✅ blindagem: não deixa mexer em si mesmo (evita se trancar)
    if (actorUserId === memberId) {
      return jsonNoStore(
        { error: "Você não pode alterar o próprio acesso financeiro." },
        400
      );
    }

    // 2) ADMIN CLIENT (service role)
    const adminClient = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3) valida permissão do ator (owner/admin)
    const { data: membership, error: memErr } = await adminClient
      .from("org_members")
      .select("role_base")
      .eq("org_id", orgId)
      .eq("user_id", actorUserId)
      .maybeSingle();

    if (memErr) {
      console.error("toggle-finance: erro ao buscar membership do ator", {
        message: memErr.message,
        details: memErr.details,
        hint: memErr.hint,
        code: memErr.code,
        orgId,
        actorUserId,
      });
      return jsonNoStore({ error: memErr.message }, 500);
    }

    if (!membership || !["owner", "admin"].includes((membership as any).role_base)) {
      return jsonNoStore({ error: "Forbidden" }, 403);
    }

    // ✅ blindagem: não deixa tirar financeiro de owner (alvo)
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
          details: tErr.details,
          hint: tErr.hint,
          code: tErr.code,
          orgId,
          memberId,
        });
        return jsonNoStore({ error: tErr.message }, 500);
      }

      if ((target as any)?.role_base === "owner") {
        return jsonNoStore(
          { error: "Não é permitido revogar o acesso financeiro de um owner." },
          400
        );
      }
    }

    // 4) chama a RPC com service role
    const { error: rpcErr } = await adminClient.rpc("rpc_toggle_finance_access", {
      p_org_id: orgId,
      p_user_id: memberId,
      p_enable: enable,
    });

    if (rpcErr) {
      console.error("toggle-finance: erro na RPC rpc_toggle_finance_access", {
        message: rpcErr.message,
        details: rpcErr.details,
        hint: rpcErr.hint,
        code: rpcErr.code,
        orgId,
        memberId,
        enable,
      });
      return jsonNoStore({ error: rpcErr.message }, 500);
    }

    return jsonNoStore({ ok: true }, 200);
  } catch (e: any) {
    console.error("toggle-finance: erro inesperado", e?.message || e);
    return jsonNoStore({ error: e?.message || "Erro interno" }, 500);
  }
}
