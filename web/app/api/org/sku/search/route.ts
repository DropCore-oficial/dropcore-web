import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Faltou NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const org_id = (searchParams.get("org_id") || "").trim();
    const q = (searchParams.get("q") || "").trim();

    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!org_id) {
      return NextResponse.json({ error: "Faltou org_id" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // valida token
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userData.user.id;

    // IDOR: só permite buscar SKUs da org da qual o usuário é membro
    const { data: member, error: memErr } = await admin
      .from("org_members")
      .select("org_id")
      .eq("org_id", org_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
    if (!member) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    // busca na tabela skus
    let query = admin.from("skus").select("*").eq("org_id", org_id).order("created_at", { ascending: false });

    if (q) {
      // tenta bater em campos comuns
      query = query.or(
        [
          `sku.ilike.%${q}%`,
          `produto.ilike.%${q}%`,
          `cor.ilike.%${q}%`,
          `tamanho.ilike.%${q}%`,
          `sku_pai.ilike.%${q}%`,
        ].join(",")
      );
    }

    const { data, error } = await query.limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, items: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado" }, { status: 500 });
  }
}
