/**
 * POST /api/seller/plano/upgrade-pro-pix — gera PIX pela diferença mensal (Pro − Start) para ativar Pro após pagamento.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { criarCobrancaPix } from "@/lib/mercadopago";
import { cadastroSellerDocumentoPendente, planoSellerDefinido } from "@/lib/sellerDocumento";
import { fetchMensalidadeSellerPorPlano } from "@/lib/sellerPlanoPrecos";
import { sellerFromBearer } from "@/lib/sellerFromBearer";
import { SELLER_DEPOSITO_REF_UPGRADE_PRO } from "@/lib/upgradeProPixProcessor";

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
        { error: "Complete os dados comerciais (CNPJ/CPF e endereço) antes de fazer upgrade." },
        { status: 400 }
      );
    }

    if (!planoSellerDefinido(seller.plano)) {
      return NextResponse.json(
        { error: "Escolha primeiro Start ou Pro no passo inicial do painel (Escolha seu plano)." },
        { status: 400 }
      );
    }

    const planoLc = String(seller.plano ?? "").trim().toLowerCase();
    if (planoLc === "pro") {
      return NextResponse.json({ error: "Você já está no plano Pro." }, { status: 400 });
    }
    if (planoLc !== "starter") {
      return NextResponse.json({ error: "Plano atual não permite este upgrade. Escolha Start ou Pro no onboarding primeiro." }, { status: 400 });
    }

    const { data: pendente } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id")
      .eq("seller_id", seller.id)
      .eq("referencia", SELLER_DEPOSITO_REF_UPGRADE_PRO)
      .eq("status", "pendente")
      .maybeSingle();

    if (pendente?.id) {
      return NextResponse.json(
        {
          error:
            "Já existe um PIX de upgrade pendente. Conclua o pagamento ou aguarde alguns minutos após expirar para gerar outro.",
        },
        { status: 409 }
      );
    }

    const precos = await fetchMensalidadeSellerPorPlano(supabaseAdmin);
    const valor = Math.round((precos.pro - precos.starter) * 100) / 100;

    if (!Number.isFinite(valor) || valor < 1) {
      return NextResponse.json(
        { error: "Valor de upgrade inválido. Verifique os preços na tabela financeira (Plano Pro e Start)." },
        { status: 400 }
      );
    }

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .insert({
        org_id: seller.org_id,
        seller_id: seller.id,
        valor,
        chave_pix: null,
        status: "pendente",
        referencia: SELLER_DEPOSITO_REF_UPGRADE_PRO,
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

    const extRef = `upgrade-pro-${row.id}`;
    const result = await criarCobrancaPix({
      valor,
      descricao: `Upgrade DropCore para Pro — R$ ${valor.toFixed(2)}`,
      email,
      external_reference: extRef,
    });

    if (!result.ok) {
      await supabaseAdmin.from("seller_depositos_pix").delete().eq("id", row.id);
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    if (result.order_id) {
      await supabaseAdmin.from("seller_depositos_pix").update({ mp_order_id: result.order_id }).eq("id", row.id);
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
