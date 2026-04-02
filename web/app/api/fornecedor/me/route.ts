/**
 * GET /api/fornecedor/me
 * Retorna dados do fornecedor autenticado (via org_members.fornecedor_id).
 * Requer Bearer token do Supabase Auth.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const user_id = userData.user.id;

    // Busca org_members onde fornecedor_id está preenchido (usuário é fornecedor)
    const { data: member, error: memErr } = await supabaseAdmin
      .from("org_members")
      .select("org_id, fornecedor_id")
      .eq("user_id", user_id)
      .not("fornecedor_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (memErr || !member?.fornecedor_id) {
      return NextResponse.json({ error: "Fornecedor não encontrado para este usuário." }, { status: 404 });
    }

    const { data: forn, error: fornErr } = await supabaseAdmin
      .from("fornecedores")
      .select("id, nome, org_id, status, chave_pix, nome_banco, nome_no_banco, agencia, conta, tipo_conta")
      .eq("id", member.fornecedor_id)
      .maybeSingle();

    if (fornErr || !forn) {
      return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    }

    if (forn.status === "inativo") {
      return NextResponse.json({ error: "Conta inativa. Entre em contato com o suporte." }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      fornecedor: {
        id: forn.id,
        nome: forn.nome,
        org_id: forn.org_id,
        status: forn.status,
        chave_pix: forn.chave_pix ?? null,
        nome_banco: forn.nome_banco ?? null,
        nome_no_banco: forn.nome_no_banco ?? null,
        agencia: forn.agencia ?? null,
        conta: forn.conta ?? null,
        tipo_conta: forn.tipo_conta ?? null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
