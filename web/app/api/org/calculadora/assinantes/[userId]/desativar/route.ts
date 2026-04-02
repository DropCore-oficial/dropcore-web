/**
 * POST /api/org/calculadora/assinantes/[userId]/desativar
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request, { params }: Params) {
  try {
    await requireAdmin(req);
    const { userId } = await params;
    const supabase = supabaseService();

    const { error } = await supabase
      .from("calculadora_assinantes")
      .update({ ativo: false })
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

