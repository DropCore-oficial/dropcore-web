/**
 * POST /api/seller/mensalidades/sync
 * Verifica no Mercado Pago se mensalidades pendentes já foram pagas.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sincronizarMensalidadesPendentesEntidade } from "@/lib/mensalidadeMercadoPagoSync";

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
      { auth: { persistSession: false } },
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

    const pagas = await sincronizarMensalidadesPendentesEntidade("seller", seller.id);
    return NextResponse.json({ ok: true, pagas });
  } catch (e: unknown) {
    console.error("[mensalidades sync]", e);
    return NextResponse.json({ ok: true, pagas: 0 });
  }
}
