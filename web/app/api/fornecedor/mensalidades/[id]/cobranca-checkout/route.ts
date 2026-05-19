/**
 * POST /api/fornecedor/mensalidades/[id]/cobranca-checkout
 * Abre Checkout Pro Mercado Pago (cartão) para a mensalidade.
 */
import { NextResponse } from "next/server";
import {
  cicloLabelMensalidade,
  resolveMensalidadeCobranca,
} from "@/lib/mensalidadeCobrancaResolve";
import { criarPreferenciaCheckoutCartaoMensalidade } from "@/lib/mercadopagoCheckout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const { id } = await params;

    const ctx = await resolveMensalidadeCobranca(token, "fornecedor", id);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const cicloLabel = cicloLabelMensalidade(ctx.mensalidade.ciclo);
    const result = await criarPreferenciaCheckoutCartaoMensalidade({
      valor: ctx.mensalidade.valor,
      titulo: `Mensalidade DropCore${cicloLabel ? ` — ${cicloLabel}` : ""}`,
      email: ctx.email,
      external_reference: ctx.mensalidade.id,
      returnPathBase: "/fornecedor/dashboard",
      req,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      init_point: result.init_point,
      valor: ctx.mensalidade.valor,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
