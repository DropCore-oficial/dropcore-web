/**
 * PATCH /api/fornecedor/dados-bancarios
 * Atualiza dados bancários do fornecedor autenticado.
 * Requer token de fornecedor.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id };
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const update: Record<string, string | null> = {};
    const fields = ["chave_pix", "nome_banco", "nome_no_banco", "agencia", "conta", "tipo_conta"] as const;

    for (const f of fields) {
      if (f in body) {
        const v = body[f];
        update[f] = v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhum dado alterado." });
    }

    const { error } = await supabaseAdmin
      .from("fornecedores")
      .update(update)
      .eq("id", ctx.fornecedor_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
