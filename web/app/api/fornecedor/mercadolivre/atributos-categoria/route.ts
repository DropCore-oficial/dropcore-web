/**
 * GET /api/fornecedor/mercadolivre/atributos-categoria?categoryId=...
 * Devolve os atributos da categoria do Mercado Livre (quais são obrigatórios, lista fechada
 * de valores quando houver) — usado no cadastro do fornecedor pra pedir só o que o ML exige
 * de verdade pra aquela categoria. Endpoint público do ML, só autentica o fornecedor.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mlBuscarAtributosCategoria } from "@/lib/mercadoLivreApiClient";

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

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const categoryId = new URL(req.url).searchParams.get("categoryId")?.trim() ?? "";
    if (!categoryId) {
      return NextResponse.json({ error: "Parâmetro 'categoryId' obrigatório." }, { status: 400 });
    }

    const atributos = await mlBuscarAtributosCategoria(categoryId);
    const visiveis = atributos.filter((a) => a.required && !a.hidden);

    return NextResponse.json({ atributos: visiveis });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
