/**
 * POST /api/calculadora/renovacao-pix
 * Gera cobrança PIX para renovar o plano Calculadora avulsa (Mercado Pago).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { criarCobrancaPix } from "@/lib/mercadopago";
import { buildCalculadoraRenovacaoExternalReference } from "@/lib/calculadoraRenovacaoPixProcessor";
import { getCalculadoraRenovacaoValorBrl } from "@/lib/calculadoraRenovacaoConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preço exibido na UI antes de gerar o PIX (sem auth). */
export async function GET() {
  const valor = getCalculadoraRenovacaoValorBrl();
  return NextResponse.json({
    valor,
    /** Exibição: renovação é um ciclo mensal no calendário (não “N dias corridos” no pagamento). */
    ciclo: "mensal" as const,
    configurado: valor != null,
  });
}

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
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const userId = userData.user.id;
    const emailUser = userData.user.email?.trim() ?? "";

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (seller && seller.status !== "bloqueado") {
      return NextResponse.json(
        { error: "Esta conta já tem acesso pelo painel seller; não use renovação da calculadora aqui." },
        { status: 400 },
      );
    }

    const { data: assin, error: assinErr } = await supabaseAdmin
      .from("calculadora_assinantes")
      .select("id, ativo")
      .eq("user_id", userId)
      .maybeSingle();

    if (assinErr || !assin?.ativo) {
      return NextResponse.json(
        { error: "Sem assinatura da calculadora ativa. Use um convite ou fale com o suporte." },
        { status: 403 },
      );
    }

    const valor = getCalculadoraRenovacaoValorBrl();
    if (valor == null) {
      return NextResponse.json(
        { error: "Valor da renovação não configurado no servidor (CALCULADORA_RENOVACAO_VALOR)." },
        { status: 503 },
      );
    }

    let email = emailUser;
    if (!email && (process.env.MERCADOPAGO_TEST_MODE === "true" || process.env.MERCADOPAGO_TEST_MODE === "1")) {
      email = "test@testuser.com";
    }
    if (!email) {
      return NextResponse.json({ error: "Informe um e-mail na conta para gerar o PIX." }, { status: 400 });
    }

    const external_reference = buildCalculadoraRenovacaoExternalReference(userId);

    const result = await criarCobrancaPix({
      valor,
      descricao: "Renovação DropCore Calculadora (ciclo mensal)",
      email,
      external_reference,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const paymentId = result.payment_id?.trim();
    if (paymentId) {
      const { error: pendErr } = await supabaseAdmin
        .from("calculadora_assinantes")
        .update({
          mp_renovacao_pendente_id: paymentId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (pendErr) {
        console.warn("[calculadora renovacao-pix] pendente:", pendErr.message);
      }
    }

    const expiraEm = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return NextResponse.json({
      ok: true,
      qr_code: result.qr_code,
      qr_code_base64: result.qr_code_base64,
      ticket_url: result.ticket_url,
      valor,
      ciclo: "mensal" as const,
      expira_em: expiraEm,
      payment_id: paymentId ?? null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
