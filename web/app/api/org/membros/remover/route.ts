import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const memberId = body?.memberId as string | undefined; // user_id do membro

    if (!orgId || !uuidRegex.test(orgId))
      return jsonNoStore({ error: "orgId inválido" }, 400);

    if (!memberId || !uuidRegex.test(memberId))
      return jsonNoStore({ error: "memberId inválido" }, 400);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !anon) {
      return jsonNoStore(
        {
          error:
            "Env NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes",
        },
        500
      );
    }
    if (!service) return jsonNoStore({ error: "Env SUPABASE_SERVICE_ROLE_KEY ausente" }, 500);

    // 1) valida token e pega usuário logado
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me?.user) return jsonNoStore({ error: "Unauthorized" }, 401);

    // trava: não remover a si mesmo
    if (me.user.id === memberId) {
      return jsonNoStore(
        { error: "Você não pode remover a si mesmo da organização." },
        409
      );
    }

    // 2) admin client
    const adminClient = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3) valida se quem está removendo é owner/admin
    const { data: myMembership, error: myErr } = await adminClient
      .from("org_members")
      .select("role_base")
      .eq("org_id", orgId)
      .eq("user_id", me.user.id)
      .maybeSingle();

    if (myErr) return jsonNoStore({ error: myErr.message }, 500);

    const myRole = (myMembership as any)?.role_base;
    const podeGerenciar = myRole === "owner" || myRole === "admin";
    if (!podeGerenciar) return jsonNoStore({ error: "Forbidden" }, 403);

    // 4) pega papel do alvo (pra proteger último owner)
    const { data: target, error: tErr } = await adminClient
      .from("org_members")
      .select("id, role_base")
      .eq("org_id", orgId)
      .eq("user_id", memberId)
      .maybeSingle();

    if (tErr) return jsonNoStore({ error: tErr.message }, 500);
    if (!target?.id) return jsonNoStore({ error: "Membro não encontrado na organização" }, 404);

    const targetRole = (target as any).role_base as string;

    // trava: não remover o último owner
    if (targetRole === "owner") {
      const { count, error: cErr } = await adminClient
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("role_base", "owner");

      if (cErr) return jsonNoStore({ error: cErr.message }, 500);

      if ((count || 0) <= 1) {
        return jsonNoStore(
          { error: "Não é possível remover o último owner da organização." },
          409
        );
      }
    }

    // 5) remove
    const { error: delErr } = await adminClient
      .from("org_members")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", memberId);

    if (delErr) return jsonNoStore({ error: delErr.message }, 500);

    return jsonNoStore({ ok: true }, 200);
  } catch (e: any) {
    return jsonNoStore({ error: e?.message || "Erro interno" }, 500);
  }
}
