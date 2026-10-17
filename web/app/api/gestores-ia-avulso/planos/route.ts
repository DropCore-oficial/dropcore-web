/**
 * GET /api/gestores-ia-avulso/planos — preço real da parcela mensal do assinante autenticado
 * (aplica desconto dele, se houver — 2026-10-17).
 * POST /api/gestores-ia-avulso/planos — gera PIX da parcela mensal nesse mesmo valor, auth do
 * assinante. Vale tanto pro ciclo mensal avulso quanto pra pagar uma parcela do contrato
 * anual (mesmo valor/extensão — ver fn_calculadora_assinante_gestores_ia_pix_confirmar).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { criarCobrancaPix } from "@/lib/mercadopago";
import { calcularValorMensalGestoresIaAvulso, isGestoresIaAvulsoDescontoTipo } from "@/lib/gestoresIaAvulsoPlanos";
import { buildGestoresIaAvulsoExternalReference } from "@/lib/gestoresIaAvulsoPixProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssinanteDescontoRow = {
  gestores_ia_desconto_tipo: string | null;
  gestores_ia_desconto_valor: number | null;
};

async function valorMensalDoUsuario(userId: string): Promise<number> {
  const { data } = await supabaseAdmin.rpc("fn_calculadora_assinante_por_user_id", { p_user_id: userId });
  const row = data as AssinanteDescontoRow | null;
  const tipo = isGestoresIaAvulsoDescontoTipo(row?.gestores_ia_desconto_tipo) ? row!.gestores_ia_desconto_tipo : null;
  return calcularValorMensalGestoresIaAvulso(tipo, row?.gestores_ia_desconto_valor ?? null);
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function getUserFromToken(token: string) {
  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sbAnon.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
  }
  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
  }
  const mensal = await valorMensalDoUsuario(user.id);
  return NextResponse.json({ mensal });
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
    }
    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const userId = user.id;
    const emailUser = user.email?.trim() ?? "";

    let email = emailUser;
    if (!email && (process.env.MERCADOPAGO_TEST_MODE === "true" || process.env.MERCADOPAGO_TEST_MODE === "1")) {
      email = "test@testuser.com";
    }
    if (!email) {
      return NextResponse.json({ error: "Informe um e-mail na conta para gerar o PIX." }, { status: 400 });
    }

    const valor = await valorMensalDoUsuario(userId);
    const external_reference = buildGestoresIaAvulsoExternalReference(userId);

    const result = await criarCobrancaPix({
      valor,
      descricao: "DropCore Gestores de IA (parcela mensal)",
      email,
      external_reference,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const paymentId = result.payment_id?.trim() || null;
    const { error: pendErr } = await supabaseAdmin.rpc("fn_calculadora_assinante_gestores_ia_pix_pendente_set", {
      p_user_id: userId,
      p_mp_pendente_id: paymentId,
    });
    if (pendErr) {
      console.warn("[gestores-ia-avulso planos] pendente:", pendErr.message);
    }

    const expiraEm = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return NextResponse.json({
      ok: true,
      qr_code: result.qr_code,
      qr_code_base64: result.qr_code_base64,
      ticket_url: result.ticket_url,
      valor,
      expira_em: expiraEm,
      payment_id: paymentId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
