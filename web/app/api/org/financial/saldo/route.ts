/**
 * GET /api/org/financial/saldo?seller_id=...
 * Retorna saldo derivado do ledger (fn_seller_saldo_from_ledger).
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const sellerId = new URL(req.url).searchParams.get("seller_id");
    if (!sellerId) {
      return NextResponse.json({ error: "seller_id é obrigatório." }, { status: 400 });
    }

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id")
      .eq("id", sellerId)
      .eq("org_id", org_id)
      .single();

    if (!seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const { data: rows, error } = await supabaseAdmin.rpc("fn_seller_saldo_from_ledger", {
      p_seller_id: sellerId,
    });

    if (error) {
      return NextResponse.json(
        { error: "Ledger não disponível. Execute o script financial-module-v2.sql." },
        { status: 503 }
      );
    }

    const row = Array.isArray(rows) ? rows[0] : rows;
    const saldo_disponivel = row?.saldo_disponivel != null ? Number(row.saldo_disponivel) : 0;
    const saldo_bloqueado = row?.saldo_bloqueado != null ? Number(row.saldo_bloqueado) : 0;
    const saldo_total = row?.saldo_total != null ? Number(row.saldo_total) : saldo_disponivel + saldo_bloqueado;

    return NextResponse.json({
      saldo_disponivel,
      saldo_bloqueado,
      saldo_total,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
