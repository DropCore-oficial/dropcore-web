/**
 * POST /api/fornecedor/mensalidades/[id]/cobranca-cartao
 * Processa pagamento com cartão (token do Card Brick).
 */
import { NextResponse } from "next/server";
import {
  cicloLabelMensalidade,
  resolveMensalidadeCobranca,
} from "@/lib/mensalidadeCobrancaResolve";
import { criarPagamentoCartaoMensalidade } from "@/lib/mercadopagoCardPayment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  token?: string;
  payment_method_id?: string;
  installments?: number;
  issuer_id?: string | number | null;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const tokenAuth = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Body;

    if (!body.token?.trim() || !body.payment_method_id?.trim()) {
      return NextResponse.json({ error: "Dados do cartão incompletos." }, { status: 400 });
    }

    const ctx = await resolveMensalidadeCobranca(tokenAuth, "fornecedor", id);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const cicloLabel = cicloLabelMensalidade(ctx.mensalidade.ciclo);
    const result = await criarPagamentoCartaoMensalidade({
      valor: ctx.mensalidade.valor,
      descricao: `Mensalidade DropCore${cicloLabel ? ` — ${cicloLabel}` : ""}`,
      email: ctx.email,
      external_reference: ctx.mensalidade.id,
      token: body.token.trim(),
      payment_method_id: body.payment_method_id.trim(),
      installments: body.installments ?? 1,
      issuer_id: body.issuer_id,
      req,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      payment_id: result.payment_id,
      status: result.status,
      mensalidade_liberada: result.mensalidade_liberada,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
