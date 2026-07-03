/**
 * POST /api/seller/deposito-pix/sync
 * Verifica depósitos pendentes no Mercado Pago e aprova automaticamente se já pagos.
 * Fallback quando o webhook não chega.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sincronizarDepositosPendentesSeller } from "@/lib/depositoPixMercadoPagoSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token" }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!seller) {
      return NextResponse.json({ error: "Seller não encontrado" }, { status: 404 });
    }

    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpToken?.trim()) {
      return NextResponse.json({ error: "MP não configurado" }, { status: 500 });
    }

    const aprovados = await sincronizarDepositosPendentesSeller(seller.id);
    return NextResponse.json({ ok: true, aprovados });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
