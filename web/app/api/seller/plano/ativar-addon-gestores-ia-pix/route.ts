/**
 * POST /api/seller/plano/ativar-addon-gestores-ia-pix — gera PIX pra ativar o add-on
 * "Gestores de IA" (Diogo/Andrey/Amanda + futuros — Ulisses já é grátis no Pro). Preço
 * depende do plano atual do seller: R$700/mês no Start, R$600/mês no Pro.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { criarCobrancaPix } from "@/lib/mercadopago";
import { cadastroSellerDocumentoPendente, planoSellerDefinido } from "@/lib/sellerDocumento";
import { sellerFromBearer } from "@/lib/sellerFromBearer";
import { SELLER_DEPOSITO_REF_ADDON_GESTORES_IA } from "@/lib/addonGestoresIaPixProcessor";
import { valorAddonGestoresIaPorPlano } from "@/lib/gestoresIaAddonPrecos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { error, seller } = await sellerFromBearer(req);
    if (error || !seller) {
      return NextResponse.json({ error }, { status: error === "Sem token de autenticação." ? 401 : 404 });
    }

    if (cadastroSellerDocumentoPendente(seller.documento)) {
      return NextResponse.json(
        { error: "Complete os dados comerciais (CNPJ/CPF e endereço) antes de ativar o add-on." },
        { status: 400 }
      );
    }

    if (!planoSellerDefinido(seller.plano)) {
      return NextResponse.json(
        { error: "Escolha primeiro Start ou Pro no passo inicial do painel (Escolha seu plano)." },
        { status: 400 }
      );
    }

    const { data: sellerRow } = await supabaseAdmin
      .from("sellers")
      .select("gestores_ia_addon_ativo")
      .eq("id", seller.id)
      .maybeSingle();

    if (sellerRow?.gestores_ia_addon_ativo === true) {
      return NextResponse.json({ error: "O add-on Gestores de IA já está ativo." }, { status: 400 });
    }

    const { data: pendente } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id")
      .eq("seller_id", seller.id)
      .eq("referencia", SELLER_DEPOSITO_REF_ADDON_GESTORES_IA)
      .eq("status", "pendente")
      .maybeSingle();

    if (pendente?.id) {
      return NextResponse.json(
        {
          error:
            "Já existe um PIX de ativação pendente. Conclua o pagamento ou aguarde alguns minutos após expirar para gerar outro.",
        },
        { status: 409 }
      );
    }

    const valor = valorAddonGestoresIaPorPlano(seller.plano);

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .insert({
        org_id: seller.org_id,
        seller_id: seller.id,
        valor,
        chave_pix: null,
        status: "pendente",
        referencia: SELLER_DEPOSITO_REF_ADDON_GESTORES_IA,
      })
      .select("id, valor, criado_em")
      .single();

    if (insertErr || !row) {
      return NextResponse.json({ error: insertErr?.message ?? "Erro ao registrar cobrança." }, { status: 500 });
    }

    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData } = token ? await sbAnon.auth.getUser(token) : { data: null };
    const email = (seller.email?.trim() || userData?.user?.email?.trim()) ?? "";
    if (!email) {
      return NextResponse.json({ error: "E-mail não cadastrado. Atualize seus dados para pagar via PIX." }, { status: 400 });
    }

    const extRef = `addon-gestores-ia-${row.id}`;
    const result = await criarCobrancaPix({
      valor,
      descricao: `DropCore — Add-on Gestores de IA — R$ ${valor.toFixed(2)}`,
      email,
      external_reference: extRef,
    });

    if (!result.ok) {
      await supabaseAdmin.from("seller_depositos_pix").delete().eq("id", row.id);
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    if (result.order_id || result.payment_id) {
      const updates: { mp_order_id?: string; mp_payment_id?: string } = {};
      if (result.order_id) updates.mp_order_id = result.order_id;
      if (result.payment_id) updates.mp_payment_id = result.payment_id;
      await supabaseAdmin.from("seller_depositos_pix").update(updates).eq("id", row.id);
    }

    const expiraEm = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return NextResponse.json({
      ok: true,
      cobranca_id: row.id,
      valor: Number(row.valor),
      qr_code: result.qr_code,
      qr_code_base64: result.qr_code_base64,
      ticket_url: result.ticket_url,
      expira_em: expiraEm,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
