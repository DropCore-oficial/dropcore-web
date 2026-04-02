import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

export async function POST(req: Request) {
  try {
    const token = getToken(req);
    if (!token) return jsonNoStore({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const orgId = body?.orgId as string | undefined;
    const memberId = body?.memberId as string | undefined; // user_id do alvo
    const role = body?.role as "owner" | "admin" | "operacional" | undefined;

    if (!orgId) return jsonNoStore({ error: "orgId é obrigatório" }, 400);
    if (!memberId) return jsonNoStore({ error: "memberId é obrigatório" }, 400);
    if (!role) return jsonNoStore({ error: "role é obrigatório" }, 400);

    if (!["owner", "admin", "operacional"].includes(role)) {
      return jsonNoStore({ error: "role inválido" }, 400);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!url || !anon) {
      return jsonNoStore(
        { error: "Env NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes" },
        500
      );
    }
    if (!serviceRole) {
      return jsonNoStore({ error: "Env SUPABASE_SERVICE_ROLE_KEY ausente" }, 500);
    }

    // client do usuário (RLS) -> validar quem é
    const supabaseUser = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: me, error: meErr } = await supabaseUser.auth.getUser();
    if (meErr || !me?.user) return jsonNoStore({ error: "Sessão inválida" }, 401);

    // valida se o "me" é owner/admin da org
    const { data: myMember, error: myErr } = await supabaseUser
      .from("org_members")
      .select("role_base")
      .eq("org_id", orgId)
      .eq("user_id", me.user.id)
      .maybeSingle();

    if (myErr) return jsonNoStore({ error: myErr.message }, 500);

    const myRole = (myMember as any)?.role_base;
    const podeGerenciar = myRole === "owner" || myRole === "admin";
    if (!podeGerenciar) return jsonNoStore({ error: "Forbidden" }, 403);

    // 🔒 anti-trava: não deixa você se rebaixar (se for você mesmo)
    if (memberId === me.user.id && role === "operacional") {
      return jsonNoStore(
        { error: "Você não pode se rebaixar para operacional (evita perder acesso)." },
        400
      );
    }

    // admin client (bypass RLS) -> atualiza role_base
    const supabaseAdmin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: upErr } = await supabaseAdmin
      .from("org_members")
      .update({ role_base: role })
      .eq("org_id", orgId)
      .eq("user_id", memberId);

    if (upErr) return jsonNoStore({ error: upErr.message }, 500);

    return jsonNoStore({ ok: true }, 200);
  } catch (e: any) {
    return jsonNoStore({ error: e?.message || "Erro interno" }, 500);
  }
}
