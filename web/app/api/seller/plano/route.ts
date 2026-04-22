/**
 * PATCH /api/seller/plano — define Starter ou Pro (após dados comerciais válidos).
 * Body: { plano: "starter" | "pro" }
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cadastroSellerDocumentoPendente, planoSellerDefinido, sellerCadastroPendente } from "@/lib/sellerDocumento";
import { sellerFromBearer } from "@/lib/sellerFromBearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const { error, seller } = await sellerFromBearer(req);
    if (error || !seller) {
      return NextResponse.json({ error }, { status: error === "Sem token de autenticação." ? 401 : 404 });
    }

    if (cadastroSellerDocumentoPendente(seller.documento)) {
      return NextResponse.json(
        { error: "Complete os dados comerciais (CNPJ/CPF e endereço) antes de escolher o plano." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const planoRaw = String(body?.plano ?? "").trim().toLowerCase();
    const planoNorm = planoRaw === "pro" ? "Pro" : planoRaw === "starter" ? "Starter" : null;
    if (!planoNorm) {
      return NextResponse.json({ error: "Informe plano \"starter\" ou \"pro\"." }, { status: 400 });
    }

    if (planoSellerDefinido(seller.plano)) {
      return NextResponse.json({ ok: true, message: "Plano já definido.", plano: seller.plano });
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("sellers")
      .update({ plano: planoNorm })
      .eq("id", seller.id)
      .select("id, plano, documento")
      .single();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const doc = updated?.documento ?? null;
    const plan = (updated as { plano?: string | null } | null)?.plano ?? null;

    return NextResponse.json({
      ok: true,
      plano: plan,
      cadastro_pendente: sellerCadastroPendente(doc, plan),
      cadastro_dados_pendente: cadastroSellerDocumentoPendente(doc),
      plano_pendente: !planoSellerDefinido(plan),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
