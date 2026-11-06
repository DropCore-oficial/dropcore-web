/**
 * GET/POST /api/calculadora/renovacao-pix?ciclo=mensal|anual
 * Preço e cobrança PIX pra renovar o plano Calculadora avulsa (Mercado Pago). Anual é PIX
 * único (R$149,90/ano, "2 meses grátis") — decisão 2026-10-27, não 12 parcelas.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { criarCobrancaPix } from "@/lib/mercadopago";
import {
  buildCalculadoraRenovacaoExternalReference,
  buildCalculadoraRenovacaoAnualExternalReference,
  type CalculadoraRenovacaoCiclo,
} from "@/lib/calculadoraRenovacaoPixProcessor";
import { getCalculadoraRenovacaoValorBrl, getCalculadoraRenovacaoAnualValorBrl } from "@/lib/calculadoraRenovacaoConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCiclo(raw: string | null): CalculadoraRenovacaoCiclo {
  return raw === "anual" ? "anual" : "mensal";
}

/** Preço exibido na UI antes de gerar o PIX (sem auth). */
export async function GET(req: Request) {
  const ciclo = parseCiclo(new URL(req.url).searchParams.get("ciclo"));
  const valor = ciclo === "anual" ? getCalculadoraRenovacaoAnualValorBrl() : getCalculadoraRenovacaoValorBrl();
  return NextResponse.json({ valor, ciclo, configurado: valor != null });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ciclo = parseCiclo(typeof body?.ciclo === "string" ? body.ciclo : null);

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
      .select("id, ativo, inclui_gestores_ia")
      .eq("user_id", userId)
      .maybeSingle();

    if (assinErr) {
      return NextResponse.json({ error: assinErr.message }, { status: 500 });
    }

    // Quem tem o pacote combinado (Calculadora + Gestores de IA, ~R$797,90/mês) não pode
    // renovar pelo preço da Calculadora pura (R$14,99/mês) — achado 2026-11-06: o valor certo
    // e o desconto por assinante já existem em /api/gestores-ia-avulso/planos, essa rota só
    // atende quem é assinante só-da-Calculadora.
    if (assin?.inclui_gestores_ia === true) {
      return NextResponse.json(
        {
          error: "Esta conta é assinante do pacote Gestores de IA; renove pelo /seller/gestores-ia-avulso.",
        },
        { status: 400 },
      );
    }

    let assinanteId = assin?.id as string | undefined;
    if (!assinanteId) {
      const { data: novaLinha, error: insErr } = await supabaseAdmin
        .from("calculadora_assinantes")
        .insert({
          user_id: userId,
          valido_ate: new Date().toISOString(),
          ativo: false,
        })
        .select("id")
        .single();
      if (insErr) {
        return NextResponse.json({ error: "Erro ao preparar assinatura: " + insErr.message }, { status: 500 });
      }
      assinanteId = novaLinha.id;
    }

    const valor = ciclo === "anual" ? getCalculadoraRenovacaoAnualValorBrl() : getCalculadoraRenovacaoValorBrl();
    if (valor == null) {
      return NextResponse.json(
        {
          error:
            ciclo === "anual"
              ? "Valor da renovação anual não configurado no servidor (CALCULADORA_RENOVACAO_ANUAL_VALOR)."
              : "Valor da renovação não configurado no servidor (CALCULADORA_RENOVACAO_VALOR).",
        },
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

    const external_reference =
      ciclo === "anual"
        ? buildCalculadoraRenovacaoAnualExternalReference(userId)
        : buildCalculadoraRenovacaoExternalReference(userId);

    const result = await criarCobrancaPix({
      valor,
      descricao: ciclo === "anual" ? "Renovação DropCore Calculadora (ciclo anual)" : "Renovação DropCore Calculadora (ciclo mensal)",
      email,
      external_reference,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const paymentId = result.payment_id?.trim();
    if (paymentId) {
      const { error: pendErr } = await supabaseAdmin
        .from("calculadora_assinante_plano_calculadora")
        .update({ mp_renovacao_pendente_id: paymentId })
        .eq("assinante_id", assinanteId);

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
      ciclo,
      expira_em: expiraEm,
      payment_id: paymentId ?? null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
