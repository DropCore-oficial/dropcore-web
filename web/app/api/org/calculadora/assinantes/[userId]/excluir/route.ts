/**
 * DELETE /api/org/calculadora/assinantes/[userId]/excluir
 * Remove o registro na calculadora (não apaga o usuário no Auth).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireAdmin(req);
    const { userId } = await params;
    if (!userId?.trim()) {
      return NextResponse.json({ error: "userId inválido." }, { status: 400 });
    }

    const supabase = supabaseService();
    const { error } = await supabase.from("calculadora_assinantes").delete().eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
