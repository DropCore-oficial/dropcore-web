/**
 * POST /api/seller/fornecedor-vinculo
 * O próprio seller define ou altera o fornecedor (armazém) ligado ao perfil (`sellers.fornecedor_id`).
 * Body: { fornecedor_id: string | null; aceite_uso_operacional?: boolean }
 * — ao vincular ou trocar para um fornecedor não nulo, aceite_uso_operacional deve ser true.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildSellerFornecedorIdPatch, uuidNormFornecedor } from "@/lib/applySellerFornecedorIdChange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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

    const body = await req.json().catch(() => ({}));
    if (!("fornecedor_id" in body)) {
      return NextResponse.json({ error: "Envie fornecedor_id (UUID do fornecedor ou null para desvincular)." }, { status: 400 });
    }
    const novoForn = uuidNormFornecedor(body.fornecedor_id);
    const aceiteUso = body.aceite_uso_operacional === true;

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, status")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }
    if (String(seller.status ?? "").toLowerCase() === "bloqueado") {
      return NextResponse.json({ error: "Conta bloqueada." }, { status: 403 });
    }

    let curForn: string | null = null;
    let curVin: string | null = null;
    let curLib = false;
    {
      const rFull = await supabaseAdmin
        .from("sellers")
        .select("fornecedor_id, fornecedor_vinculado_em, fornecedor_desvinculo_liberado")
        .eq("id", seller.id)
        .maybeSingle();
      if (rFull.error && (rFull.error.message?.includes("column") || rFull.error.code === "42703")) {
        const r2 = await supabaseAdmin.from("sellers").select("fornecedor_id").eq("id", seller.id).maybeSingle();
        curForn = uuidNormFornecedor((r2.data as { fornecedor_id?: string | null } | null)?.fornecedor_id);
      } else {
        const s2 = rFull.data as {
          fornecedor_id?: string | null;
          fornecedor_vinculado_em?: string | null;
          fornecedor_desvinculo_liberado?: boolean | null;
        } | null;
        curForn = uuidNormFornecedor(s2?.fornecedor_id);
        curVin = s2?.fornecedor_vinculado_em ?? null;
        curLib = Boolean(s2?.fornecedor_desvinculo_liberado);
      }
    }

    if (novoForn && novoForn !== curForn && !aceiteUso) {
      return NextResponse.json(
        {
          error:
            "Para vincular ou trocar de armazém, confirme no painel que aceita usar os dados cadastrais exclusivamente para operação na DropCore (pedidos, logística e suporte).",
          code: "aceite_required",
        },
        { status: 400 }
      );
    }

    if (novoForn) {
      const { data: forn, error: fornErr } = await supabaseAdmin
        .from("fornecedores")
        .select("id, nome, org_id, status")
        .eq("id", novoForn)
        .eq("org_id", seller.org_id)
        .maybeSingle();
      if (fornErr) {
        return NextResponse.json({ error: String(fornErr.message) }, { status: 500 });
      }
      if (!forn) {
        return NextResponse.json({ error: "Fornecedor não encontrado nesta organização." }, { status: 404 });
      }
      if (String(forn.status ?? "").toLowerCase() !== "ativo") {
        return NextResponse.json({ error: "Só é possível vincular um fornecedor com status ativo." }, { status: 400 });
      }
    }

    const patch = buildSellerFornecedorIdPatch(
      {
        fornecedor_id: curForn,
        fornecedor_vinculado_em: curVin,
        fornecedor_desvinculo_liberado: curLib,
      },
      novoForn,
      false
    );

    if (!patch.ok) {
      return NextResponse.json(
        {
          error: patch.error,
          code: patch.code,
          pode_trocar_fornecedor_a_partir_de: patch.pode_trocar_fornecedor_a_partir_de ?? null,
        },
        { status: patch.status }
      );
    }

    const keys = Object.keys(patch.allowed);
    if (keys.length === 0) {
      let fornecedor_nome: string | null = null;
      if (curForn) {
        const { data } = await supabaseAdmin.from("fornecedores").select("nome").eq("id", curForn).maybeSingle();
        fornecedor_nome = data?.nome ?? null;
      }
      return NextResponse.json({
        ok: true,
        already: true,
        fornecedor_id: curForn,
        fornecedor_nome,
      });
    }

    const allowed = { ...patch.allowed, atualizado_em: new Date().toISOString() };

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("sellers")
      .update(allowed)
      .eq("id", seller.id)
      .select("fornecedor_id")
      .single();

    if (upErr) {
      if (upErr.message.includes("fornecedor_vinculado_em") || upErr.message.includes("fornecedor_desvinculo")) {
        return NextResponse.json(
          {
            error:
              "Execute o script SQL `seller-fornecedor-vinculo-minimo.sql` no Supabase para criar as colunas de vínculo.",
          },
          { status: 500 }
        );
      }
      console.error("[fornecedor-vinculo POST]", upErr.message);
      return NextResponse.json({ error: "Erro ao gravar vínculo." }, { status: 500 });
    }

    const fid = uuidNormFornecedor((updated as { fornecedor_id?: string | null })?.fornecedor_id);
    let fornecedor_nome: string | null = null;
    if (fid) {
      const { data: fn } = await supabaseAdmin.from("fornecedores").select("nome").eq("id", fid).maybeSingle();
      fornecedor_nome = fn?.nome ?? null;
    }

    return NextResponse.json({
      ok: true,
      fornecedor_id: fid,
      fornecedor_nome,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
