/**
 * POST /api/org/sellers/[id]/deposito-pix
 * Registra um depósito PIX pendente (valor + chave). O crédito só entra quando alguém aprovar em Depósitos PIX.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MINIMO_CREDITO = 500;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id: seller_id } = await params;
    const body = await req.json();
    const valor = typeof body?.valor === "number" ? body.valor : parseFloat(String(body?.valor ?? "0").replace(",", "."));
    const chave_pix = body?.pix_chave != null ? String(body.pix_chave).trim() : null;

    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: "Valor deve ser um número positivo." }, { status: 400 });
    }
    if (valor < MINIMO_CREDITO) {
      return NextResponse.json({ error: `Valor mínimo é R$ ${MINIMO_CREDITO},00.` }, { status: 400 });
    }

    const { data: seller, error: fetchErr } = await supabaseAdmin
      .from("sellers")
      .select("id, nome")
      .eq("id", seller_id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .insert({
        org_id,
        seller_id,
        valor,
        chave_pix: chave_pix || null,
        status: "pendente",
        referencia: "PIX",
      })
      .select("id, valor, criado_em")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      pendente: true,
      deposito_id: row.id,
      valor: row.valor,
      mensagem: "Depósito registrado. Aprove em Depósitos PIX quando o valor entrar na conta.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
