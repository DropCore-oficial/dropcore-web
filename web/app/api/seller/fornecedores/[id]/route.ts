/**
 * GET /api/seller/fornecedores/[id]
 * Detalhes cadastrais do fornecedor (mesma org do seller) — só após o seller abrir o modal de detalhe.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { nomePublicoFornecedor, AVISO_DADOS_FORNECEDOR_SELLER } from "@/lib/sellerCatalogoPrivacidade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: fornecedorId } = await params;
    if (!fornecedorId?.trim()) {
      return NextResponse.json({ error: "id inválido." }, { status: 400 });
    }

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("org_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const orgId = seller.org_id as string;

    const selectFull =
      "id, nome, nome_exibicao, cnpj, telefone, email_comercial, endereco_cidade, endereco_uf, endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, status";

    let row: Record<string, unknown> | null = null;
    const r1 = await supabaseAdmin
      .from("fornecedores")
      .select(selectFull)
      .eq("id", fornecedorId.trim())
      .eq("org_id", orgId)
      .maybeSingle();

    if (r1.error && (r1.error.message?.includes("column") || r1.error.code === "42703")) {
      const r2 = await supabaseAdmin
        .from("fornecedores")
        .select(
          "id, nome, cnpj, telefone, email_comercial, endereco_cidade, endereco_uf, endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, status"
        )
        .eq("id", fornecedorId.trim())
        .eq("org_id", orgId)
        .maybeSingle();
      if (r2.error) {
        return NextResponse.json({ error: String(r2.error.message) }, { status: 500 });
      }
      row = (r2.data as Record<string, unknown>) ?? null;
    } else if (r1.error) {
      return NextResponse.json({ error: String(r1.error.message) }, { status: 500 });
    } else {
      row = (r1.data as Record<string, unknown>) ?? null;
    }

    if (!row) {
      return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    }

    const nomeRazao = String(row.nome ?? "").trim();
    const nomePub = nomePublicoFornecedor({
      nome_exibicao: row.nome_exibicao as string | null | undefined,
      nome: row.nome as string | null | undefined,
    });

    return NextResponse.json({
      ok: true,
      aviso_uso: AVISO_DADOS_FORNECEDOR_SELLER,
      fornecedor: {
        id: row.id,
        nome_publico: nomePub,
        nome_razao_social: nomeRazao || null,
        cnpj: row.cnpj != null ? String(row.cnpj) : null,
        telefone: row.telefone != null ? String(row.telefone) : null,
        email_comercial: row.email_comercial != null ? String(row.email_comercial) : null,
        endereco_cidade: row.endereco_cidade != null ? String(row.endereco_cidade) : null,
        endereco_uf: row.endereco_uf != null ? String(row.endereco_uf) : null,
        endereco_cep: row.endereco_cep != null ? String(row.endereco_cep) : null,
        endereco_logradouro: row.endereco_logradouro != null ? String(row.endereco_logradouro) : null,
        endereco_numero: row.endereco_numero != null ? String(row.endereco_numero) : null,
        endereco_bairro: row.endereco_bairro != null ? String(row.endereco_bairro) : null,
        status: row.status != null ? String(row.status) : null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
