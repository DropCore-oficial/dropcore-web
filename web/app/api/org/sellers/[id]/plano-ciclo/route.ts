/**
 * POST /api/org/sellers/[id]/plano-ciclo — admin define/edita plano (Start/Pro), ciclo de
 * compromisso (mensal/semestral/anual) e desconto manual (R$ ou %) de um seller.
 * Grava via RPC `fn_seller_plano_ciclo_desconto_set` (regra 9 do CLAUDE.md: escrita nova
 * sempre via função SECURITY DEFINER, nunca `.from().update()` direto).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { isSellerPlanoCiclo, isSellerPlanoDescontoTipo } from "@/lib/sellerPlanoCicloDesconto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id } = await params;
    const body = await req.json();

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id")
      .eq("id", id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const cicloRaw = String(body?.ciclo ?? "").trim().toLowerCase();
    if (!isSellerPlanoCiclo(cicloRaw)) {
      return NextResponse.json({ error: 'Ciclo inválido. Use "mensal", "semestral" ou "anual".' }, { status: 400 });
    }

    const planoRaw = body?.plano != null ? String(body.plano).trim().toLowerCase() : "";
    if (planoRaw && planoRaw !== "starter" && planoRaw !== "pro") {
      return NextResponse.json({ error: 'Plano inválido. Use "starter" ou "pro".' }, { status: 400 });
    }

    const descontoTipoRaw = body?.desconto_tipo != null ? String(body.desconto_tipo).trim().toLowerCase() : "";
    if (descontoTipoRaw && !isSellerPlanoDescontoTipo(descontoTipoRaw)) {
      return NextResponse.json({ error: 'Tipo de desconto inválido. Use "valor" ou "percentual".' }, { status: 400 });
    }
    const descontoValorRaw = body?.desconto_valor;
    const descontoValor =
      descontoTipoRaw && descontoValorRaw != null && Number.isFinite(Number(descontoValorRaw))
        ? Number(descontoValorRaw)
        : null;
    if (descontoTipoRaw && (descontoValor == null || descontoValor <= 0)) {
      return NextResponse.json({ error: "Informe um valor de desconto maior que zero." }, { status: 400 });
    }
    if (descontoTipoRaw === "percentual" && descontoValor != null && descontoValor > 100) {
      return NextResponse.json({ error: "Desconto percentual não pode passar de 100%." }, { status: 400 });
    }

    const { error: rpcErr } = await supabaseAdmin.rpc("fn_seller_plano_ciclo_desconto_set", {
      p_seller_id: id,
      p_plano: planoRaw || null,
      p_ciclo: cicloRaw,
      p_desconto_tipo: descontoTipoRaw || null,
      p_desconto_valor: descontoValor,
    });

    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    const { data: updated } = await supabaseAdmin
      .from("sellers")
      .select(
        "id, plano, plano_ciclo, plano_ciclo_carencia_fim, plano_desconto_tipo, plano_desconto_valor, plano_ciclo_valor_travado, plano_ciclo_compromisso_fim"
      )
      .eq("id", id)
      .maybeSingle();

    return NextResponse.json({ ok: true, seller: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
