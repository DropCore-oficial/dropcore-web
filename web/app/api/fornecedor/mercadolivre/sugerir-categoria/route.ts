/**
 * GET /api/fornecedor/mercadolivre/sugerir-categoria?titulo=...
 * Sugere categoria do Mercado Livre a partir do título do produto — usado no cadastro do
 * fornecedor (aba "Mercado Livre"), pra capturar categoria+atributos na origem, antes do
 * seller publicar o anúncio. Endpoint público do ML (`mlSugerirCategoria`), não precisa de
 * token do Mercado Livre — só autentica o fornecedor pra não ficar aberto a qualquer um.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mlSugerirCategoria, mlBuscarCaminhoCategoria } from "@/lib/mercadoLivreApiClient";

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

    const titulo = new URL(req.url).searchParams.get("titulo")?.trim() ?? "";
    if (!titulo) {
      return NextResponse.json({ error: "Parâmetro 'titulo' obrigatório." }, { status: 400 });
    }

    const sugestoes = await mlSugerirCategoria(titulo);
    const comCaminho = await Promise.all(
      sugestoes.map(async (s) => ({
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        domainId: s.domainId,
        caminho: await mlBuscarCaminhoCategoria(s.categoryId).catch(() => s.categoryName),
      }))
    );

    return NextResponse.json({ categorias: comCaminho });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
