/**
 * GET /api/calculadora/me
 * Seller completo: acesso total.
 * Assinante calculadora com data válida: access calc_only.
 * Assinante calculadora vencido mas ainda ativo no cadastro: access calc_only_locked (entra no app, uso bloqueado na UI).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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

    const user_id = userData.user.id;
    const email = userData.user.email ?? null;

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, nome, status")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!sellerErr && seller) {
      if (seller.status === "bloqueado") {
        return NextResponse.json(
          { error: "Conta bloqueada. Entre em contato com o suporte." },
          { status: 403 },
        );
      }
      return NextResponse.json({
        access: "seller",
        seller: { id: seller.id, nome: seller.nome },
        email,
      });
    }

    const { data: assin, error: assinErr } = await supabaseAdmin
      .from("calculadora_assinantes")
      .select("id, valido_ate, ativo")
      .eq("user_id", user_id)
      .maybeSingle();

    if (assinErr) {
      console.error("calculadora_assinantes:", assinErr);
      return NextResponse.json(
        {
          error:
            "Tabela calculadora_assinantes indisponível. Execute o script create-calculadora-assinantes.sql no Supabase.",
        },
        { status: 503 },
      );
    }

    if (!assin || !assin.ativo) {
      return NextResponse.json(
        {
          error:
            "Sem acesso à calculadora. Contrate o plano ou use uma conta seller DropCore com convite.",
        },
        { status: 403 },
      );
    }

    const validoAte = new Date(assin.valido_ate);
    const expirado = Number.isNaN(validoAte.getTime()) || validoAte.getTime() < Date.now();

    if (expirado) {
      return NextResponse.json(
        {
          access: "calc_only_locked",
          valido_ate: assin.valido_ate,
          uso_bloqueado: true,
          motivo: "assinatura_expirada",
          email,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    return NextResponse.json(
      { access: "calc_only", valido_ate: assin.valido_ate, email },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e: unknown) {
    console.error("GET /api/calculadora/me", e);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
