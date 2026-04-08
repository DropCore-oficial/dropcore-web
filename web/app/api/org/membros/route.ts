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

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { url, anon, serviceRole };
}

/* =========================
   GET — LISTAR MEMBROS
========================= */
export async function GET(req: Request) {
  try {
    const token = getToken(req);
    if (!token) return jsonNoStore({ error: "Unauthorized" }, 401);

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) return jsonNoStore({ error: "orgId é obrigatório" }, 400);

    const { url, anon, serviceRole } = getEnv();
    if (!url || !anon) {
      return jsonNoStore(
        { error: "Configuração de ambiente ausente" },
        500
      );
    }
    if (!serviceRole) {
      return jsonNoStore({ error: "Env SUPABASE_SERVICE_ROLE_KEY ausente" }, 500);
    }

    // 1) Validar token e obter user id
    const supabaseUser = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: me, error: meErr } = await supabaseUser.auth.getUser();
    if (meErr || !me?.user) {
      return jsonNoStore({ error: "Erro de autenticação" }, 401);
    }

    const userId = me.user.id;

    // 2) Admin client (bypass RLS) — usamos para checar permissão e listar
    const supabaseAdmin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3) Checar permissão com Service Role (não depende de RLS)
    const { data: myMember, error: myErr } = await supabaseAdmin
      .from("org_members")
      .select("role_base")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (myErr) {
      console.error("GET /api/org/membros - erro ao buscar permissão:", myErr);
      return jsonNoStore(
        { error: "Erro ao verificar permissões." },
        500
      );
    }

    const role = myMember?.role_base;
    if (!myMember || !["owner", "admin"].includes(role ?? "")) {
      return jsonNoStore(
        { error: "Acesso negado. Apenas administradores podem visualizar membros." },
        403
      );
    }

    const { data: members, error: memErr } = await supabaseAdmin
      .from("org_members")
      .select("id, user_id, role_base, pode_ver_dinheiro")
      .eq("org_id", orgId);

    if (memErr) return jsonNoStore({ error: memErr.message }, 500);

    if (!members || members.length === 0) {
      return jsonNoStore({ data: [] }, 200);
    }

    const userIds = Array.from(
      new Set(members.map((m) => m.user_id).filter(Boolean))
    );

    // Buscar emails: tenta RPC primeiro; se falhar, usa auth.admin.getUserById
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
      // Fallback: buscar email por user_id via Auth
      for (const uid of userIds) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        emailMap.set(uid, u?.user?.email ?? "—");
      }
    }

    const formatted = members.map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      email: emailMap.get(m.user_id) || "—",
      role_base: m.role_base,
      pode_ver_dinheiro: !!m.pode_ver_dinheiro,
    }));

    return jsonNoStore({ data: formatted }, 200);
  } catch (e: any) {
    return jsonNoStore({ error: e?.message || "Erro interno" }, 500);
  }
}

/* =========================
   POST — ADICIONAR MEMBRO
========================= */
export async function POST(req: Request) {
  try {
    const token = getToken(req);
    if (!token) return jsonNoStore({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const orgId = body?.orgId as string | undefined;
    const email = (body?.email as string | undefined)?.trim()?.toLowerCase();

    if (!orgId) return jsonNoStore({ error: "orgId é obrigatório" }, 400);
    if (!email) return jsonNoStore({ error: "email é obrigatório" }, 400);

    const { url, anon, serviceRole } = getEnv();
    if (!url || !anon) {
      return jsonNoStore(
        { error: "Configuração de ambiente ausente" },
        500
      );
    }
    if (!serviceRole) {
      return jsonNoStore({ error: "Env SUPABASE_SERVICE_ROLE_KEY ausente" }, 500);
    }

    // Validar token e permissão (com Service Role para não depender de RLS)
    const supabaseUser = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: me, error: meErr } = await supabaseUser.auth.getUser();
    if (meErr || !me?.user) {
      return jsonNoStore({ error: "Erro de autenticação" }, 401);
    }

    const supabaseAdmin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: myMember, error: myErr } = await supabaseAdmin
      .from("org_members")
      .select("role_base")
      .eq("org_id", orgId)
      .eq("user_id", me.user.id)
      .maybeSingle();

    if (myErr) return jsonNoStore({ error: myErr.message }, 500);

    const role = myMember?.role_base;
    if (!myMember || !["owner", "admin"].includes(role ?? "")) {
      return jsonNoStore({ error: "Sem permissão para adicionar membros." }, 403);
    }

    // pega user_id via RPC
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

    // evita duplicado
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
  } catch (e: any) {
    return jsonNoStore({ error: e?.message || "Erro interno" }, 500);
  }
}
