/**
 * POST /api/org/calculadora/assinantes/[userId]/prorrogar
 * Body: { dias: number }
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
    const body = await req.json().catch(() => ({}));
    const diasRaw = Number(body?.dias ?? 0);
    const dias = Number.isFinite(diasRaw) && diasRaw > 0 ? diasRaw : 0;

    if (!dias) {
      return NextResponse.json({ error: "Quantidade de dias inválida." }, { status: 400 });
    }

    const supabase = supabaseService();

    const { data: atual, error: readErr } = await supabase
      .from("calculadora_assinantes")
      .select("id, valido_ate, ativo")
      .eq("user_id", userId)
      .maybeSingle<{ id: string; valido_ate: string; ativo: boolean }>();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    const baseDate =
      atual && !Number.isNaN(new Date(atual.valido_ate).getTime()) && new Date(atual.valido_ate).getTime() > Date.now()
        ? new Date(atual.valido_ate)
        : new Date();

    const novoValido = new Date(baseDate.getTime());
    novoValido.setDate(novoValido.getDate() + dias);

    const { data: updated, error: upErr } = await supabase
      .from("calculadora_assinantes")
      .upsert(
        {
          user_id: userId,
          valido_ate: novoValido.toISOString(),
          ativo: true,
        },
        { onConflict: "user_id" },
      )
      .select("id, user_id, valido_ate, ativo")
      .maybeSingle();

    if (upErr || !updated) {
      return NextResponse.json({ error: upErr?.message ?? "Erro ao prorrogar assinatura." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

