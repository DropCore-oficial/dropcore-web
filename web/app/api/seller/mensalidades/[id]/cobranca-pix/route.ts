/**
 * POST /api/seller/mensalidades/[id]/cobranca-pix
 * Cria cobrança PIX para a mensalidade via Mercado Pago.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { criarCobrancaPix } from "@/lib/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, nome, email")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const { id } = await params;

    const { data: m, error: mErr } = await supabaseAdmin
      .from("financial_mensalidades")
      .select("id, ciclo, valor, status")
      .eq("id", id)
      .eq("org_id", seller.org_id)
      .eq("tipo", "seller")
      .eq("entidade_id", seller.id)
      .maybeSingle();

    if (mErr || !m) {
      return NextResponse.json({ error: "Mensalidade não encontrada." }, { status: 404 });
    }
    if (m.status !== "pendente" && m.status !== "inadimplente") {
      return NextResponse.json({ error: "Esta mensalidade já foi paga." }, { status: 400 });
    }

    let email = seller.email?.trim() || userData.user.email?.trim();
    if (!email && process.env.MERCADOPAGO_TEST_MODE === "true") {
      email = "test@testuser.com";
    }
    if (!email) {
      return NextResponse.json({ error: "E-mail não cadastrado. Atualize seus dados para pagar via PIX." }, { status: 400 });
    }

    const cicloLabel = m.ciclo ? new Date(m.ciclo + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "";
    const result = await criarCobrancaPix({
      valor: Number(m.valor),
      descricao: `Mensalidade DropCore - ${cicloLabel}`,
      email,
      external_reference: m.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    // Salvar IDs do MP para polling (fallback do webhook em localhost)
    const updates: { mp_order_id?: string; mp_payment_id?: string } = {};
    if (result.payment_id) updates.mp_payment_id = result.payment_id;
    if (result.order_id) updates.mp_order_id = result.order_id;
    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from("financial_mensalidades").update(updates).eq("id", id);
    }

    const expiraEm = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return NextResponse.json({
      ok: true,
      qr_code: result.qr_code,
      qr_code_base64: result.qr_code_base64,
      ticket_url: result.ticket_url,
      valor: Number(m.valor),
      expira_em: expiraEm,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
