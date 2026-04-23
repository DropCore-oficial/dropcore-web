/**
 * GET /api/seller/fornecedores
 * Lista fornecedores da org (cadastro resumido) e o vínculo atual do seller.
 * POST não é usado aqui — ver POST /api/seller/fornecedor-vinculo.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import { MESES_MINIMOS_COM_FORNECEDOR, dataMinimaTrocaFornecedor, podeTrocarFornecedorAgora } from "@/lib/sellerFornecedorVinculo";
import { mapFornecedorRowSellerPublico } from "@/lib/mapFornecedorSellerPublico";

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

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    let fornecedorConectadoId: string | null = null;
    let fornecedorVinculadoEm: string | null = null;
    let fornecedorDesvinculoLiberado = false;
    try {
      const { data: s2, error: s2e } = await supabaseAdmin
        .from("sellers")
        .select("fornecedor_id, fornecedor_vinculado_em, fornecedor_desvinculo_liberado")
        .eq("id", seller.id)
        .maybeSingle();
      if (s2e && (s2e.message?.includes("column") || s2e.code === "42703")) {
        const { data: s3 } = await supabaseAdmin.from("sellers").select("fornecedor_id").eq("id", seller.id).maybeSingle();
        fornecedorConectadoId = (s3 as { fornecedor_id?: string | null } | null)?.fornecedor_id ?? null;
      } else {
        const row = s2 as {
          fornecedor_id?: string | null;
          fornecedor_vinculado_em?: string | null;
          fornecedor_desvinculo_liberado?: boolean | null;
        } | null;
        fornecedorConectadoId = row?.fornecedor_id ?? null;
        fornecedorVinculadoEm = row?.fornecedor_vinculado_em ?? null;
        fornecedorDesvinculoLiberado = Boolean(row?.fornecedor_desvinculo_liberado);
      }
    } catch {
      // coluna fornecedor_id pode não existir ainda
    }

    /** Lista sem CNPJ/e-mail/telefone — só nome público e local resumido (vários SELECT por compatibilidade de colunas). */
    const selectTries: string[] = [
      "id, nome, nome_exibicao, status, premium, endereco_cidade, endereco_uf, criado_em, sla_postagem_dias, janela_validacao_dias",
      "id, nome, status, premium, endereco_cidade, endereco_uf, criado_em, sla_postagem_dias, janela_validacao_dias",
      "id, nome, status, premium, endereco_cidade, endereco_uf",
      "id, nome, status",
    ];

    let rawRows: Record<string, unknown>[] = [];
    let lastErr: Error | null = null;
    for (const cols of selectTries) {
      const { data, error } = await supabaseAdmin
        .from("fornecedores")
        .select(cols)
        .eq("org_id", seller.org_id)
        .order("nome", { ascending: true });
      if (!error) {
        rawRows = (data ?? []) as unknown as Record<string, unknown>[];
        lastErr = null;
        break;
      }
      lastErr = new Error(error.message);
      const colMissing = error.message?.includes("column") || error.code === "42703";
      if (!colMissing) throw lastErr;
    }
    if (lastErr && rawRows.length === 0) throw lastErr;

    const list = rawRows.map((r) => mapFornecedorRowSellerPublico(r));

    const podeTrocarAgora =
      !fornecedorConectadoId ||
      podeTrocarFornecedorAgora(fornecedorVinculadoEm, fornecedorDesvinculoLiberado, false);
    const dataMinTroca = dataMinimaTrocaFornecedor(fornecedorVinculadoEm);

    return NextResponse.json({
      ok: true,
      fornecedores: list,
      fornecedor_conectado_id: fornecedorConectadoId,
      vinculo: {
        fornecedor_id: fornecedorConectadoId,
        vinculado_em: fornecedorVinculadoEm,
        pode_trocar_agora: podeTrocarAgora,
        pode_trocar_fornecedor_a_partir_de: dataMinTroca?.toISOString() ?? null,
        meses_minimos: MESES_MINIMOS_COM_FORNECEDOR,
        liberado_antecipado: fornecedorDesvinculoLiberado,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
