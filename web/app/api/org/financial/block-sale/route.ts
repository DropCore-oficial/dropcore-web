/**
 * POST /api/org/financial/block-sale
 * Bloqueio pré-pago na venda: verifica saldo, debita disponível e bloqueia no ledger.
 * Body: { seller_id, fornecedor_id, pedido_id, valor_fornecedor, valor_dropcore }
 * valor_total = valor_fornecedor + valor_dropcore (validado).
 * Retorna SALDO_INSUFICIENTE se saldo_disponivel < valor_total.
 * Apenas admin/owner (operações financeiras só server-side).
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { executeBlockSale } from "@/lib/blockSale";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return parseFloat(String(v ?? "0").replace(",", "."));
}

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const seller_id = body?.seller_id ?? null;
    const fornecedor_id = body?.fornecedor_id ?? null;
    const pedido_id = body?.pedido_id ?? null;
    const valor_fornecedor = toNum(body?.valor_fornecedor);
    const valor_dropcore = toNum(body?.valor_dropcore);

    if (!seller_id) {
      return NextResponse.json({ error: "seller_id é obrigatório." }, { status: 400 });
    }
    if (valor_fornecedor < 0 || valor_dropcore < 0) {
      return NextResponse.json({ error: "valor_fornecedor e valor_dropcore devem ser >= 0." }, { status: 400 });
    }
    const valor_total = valor_fornecedor + valor_dropcore;
    if (valor_total <= 0) {
      return NextResponse.json({ error: "valor_total deve ser positivo." }, { status: 400 });
    }

    // Se pedido_id foi fornecido, valida que ele existe e pertence à mesma org
    if (pedido_id) {
      const { data: pedido, error: pedidoErr } = await supabaseAdmin
        .from("pedidos")
        .select("id")
        .eq("id", pedido_id)
        .eq("org_id", org_id)
        .maybeSingle();
      if (pedidoErr || !pedido) {
        return NextResponse.json({ error: "pedido_id inválido ou não pertence à organização." }, { status: 400 });
      }
    }

    const result = await executeBlockSale({
      org_id,
      seller_id,
      fornecedor_id,
      pedido_id,
      valor_fornecedor,
      valor_dropcore,
    });

    if (!result.ok) {
      if (result.code === "SALDO_INSUFICIENTE") {
        return NextResponse.json(
          {
            error: "Saldo insuficiente para este pedido.",
            code: "SALDO_INSUFICIENTE",
            saldo_disponivel: result.saldo_disponivel,
            valor_total: result.valor_total,
          },
          { status: 402 }
        );
      }
      if (result.code === "SELLER_NAO_ENCONTRADO") {
        return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
      }
      if (result.code === "LEDGER_NAO_DISPONIVEL") {
        return NextResponse.json(
          { error: "Ledger não disponível.", code: "LEDGER_NAO_DISPONIVEL" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: result.message || "Erro ao bloquear.", code: "ERRO_LEDGER" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      ledger_id: result.ledger_id,
      valor_total: result.valor_total,
      status: result.status,
      ciclo_repasse: result.ciclo_repasse,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
