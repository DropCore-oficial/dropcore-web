/**
 * POST /api/seller/deposito-pix/[id]/cobranca-cartao
 * Processa recarga de crédito via cartão (token do Card Brick). Espelha
 * /api/seller/mensalidades/[id]/cobranca-cartao, mas credita saldo em vez de mensalidade.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveDepositoCobranca } from "@/lib/depositoPixCobrancaResolve";
import { criarPagamentoCartaoDepositoPix } from "@/lib/mercadopagoCardPayment";
import { buscarParcelaReal } from "@/lib/mercadopagoInstallmentsLookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  token?: string;
  payment_method_id?: string;
  installments?: number;
  issuer_id?: string | number | null;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const tokenAuth = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Body;

    if (!body.token?.trim() || !body.payment_method_id?.trim()) {
      return NextResponse.json({ error: "Dados do cartão incompletos." }, { status: 400 });
    }

    const parcelas = Math.max(1, Math.min(12, Math.floor(body.installments ?? 1) || 1));
    if (parcelas < 2) {
      return NextResponse.json(
        {
          error:
            "Cartão à vista (1x) não tem taxa exibida pela Mercado Pago pra repassar corretamente. Escolha 2x ou mais, ou use Pix pra pagamento único.",
        },
        { status: 400 },
      );
    }

    const ctx = await resolveDepositoCobranca(tokenAuth, id);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    // Valor real cobrado pela MP nessa parcela (mesma fonte que o próprio Card Brick
    // mostrou na tela) — nunca estimado, pra não sobrar taxa pro DropCore absorver.
    const parcela = await buscarParcelaReal({
      amount: ctx.deposito.valor,
      paymentMethodId: body.payment_method_id.trim(),
      installments: parcelas,
    });
    if (!parcela) {
      return NextResponse.json(
        { error: "Não foi possível calcular a taxa dessa parcela agora. Tente de novo ou use Pix." },
        { status: 502 },
      );
    }

    const valorCobrado = parcela.totalAmount;
    const taxaMp = Math.round((valorCobrado - ctx.deposito.valor) * 100) / 100;

    await supabaseAdmin
      .from("seller_depositos_pix")
      .update({ metodo: "cartao", parcelas, taxa_mp: taxaMp, valor_cobrado: valorCobrado })
      .eq("id", ctx.deposito.id);

    const result = await criarPagamentoCartaoDepositoPix({
      valor: valorCobrado,
      descricao: `Recarga créditos DropCore — R$ ${ctx.deposito.valor.toFixed(2)}`,
      email: ctx.email,
      external_reference: `deposito-${ctx.deposito.id}`,
      token: body.token.trim(),
      payment_method_id: body.payment_method_id.trim(),
      installments: parcelas,
      issuer_id: body.issuer_id,
      req,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    if (result.payment_id) {
      await supabaseAdmin
        .from("seller_depositos_pix")
        .update({ mp_payment_id: result.payment_id })
        .eq("id", ctx.deposito.id);
    }

    return NextResponse.json({
      ok: true,
      payment_id: result.payment_id,
      status: result.status,
      deposito_liberado: result.deposito_liberado,
      taxa_mp: taxaMp,
      valor_cobrado: valorCobrado,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
