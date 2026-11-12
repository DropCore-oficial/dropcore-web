/**
 * POST /api/org/financial/devolucao-pos-repasse
 * Registra devolução após o repasse: insere em financial_debito_descontar.
 * O valor será descontado no próximo repasse (fornecedor + DropCore).
 * Body: { ledger_id: string, ciclo_a_descontar?: "YYYY-MM-DD" } (ciclo = terça-feira; default = próxima terça).
 * Ledger deve estar PAGO e ter fornecedor_id.
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { registrarDevolucaoPosRepasse } from "@/lib/devolucaoPosRepasse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const ledger_id = body?.ledger_id != null ? String(body.ledger_id).trim() : null;
    const ciclo_a_descontar: string | null =
      body?.ciclo_a_descontar != null ? String(body.ciclo_a_descontar).trim().slice(0, 10) : null;

    if (!ledger_id) {
      return NextResponse.json({ error: "ledger_id é obrigatório." }, { status: 400 });
    }

    const resultado = await registrarDevolucaoPosRepasse(org_id, ledger_id, ciclo_a_descontar);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      id: resultado.id,
      ciclo_a_descontar: resultado.cicloADescontar,
      mensagem: `Débito registrado. Será descontado no repasse do ciclo ${resultado.cicloADescontar}. Valor devolvido ao seller.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
