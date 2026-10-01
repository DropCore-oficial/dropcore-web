/**
 * POST /api/seller/gestores-ia/tiago/credito-extra-pix — gera PIX de crédito extra do chat
 * do Tiago Silva. Aceita `{ valor: number }` (dentro de MIN/MAX — tela oferece atalhos de
 * 10/20/25/50 mas qualquer valor no intervalo serve, mesma regra de margem: liberado =
 * pago/2). Só some quando o dia vira (não precisa desativar nada — o gate em
 * gestorTiagoChatOrcamentoDia.ts já ignora crédito de dia anterior).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { criarCobrancaPix } from "@/lib/mercadopago";
import { sellerFromBearer } from "@/lib/sellerFromBearer";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { temAddonGestoresIaAtivo } from "@/lib/planos";
import {
  SELLER_DEPOSITO_REF_CREDITO_CHAT_IA,
  MIN_CREDITO_CHAT_IA_PAGO,
  MAX_CREDITO_CHAT_IA_PAGO,
  valorCreditoChatIaValido,
} from "@/lib/creditoChatIaPixProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { error, seller } = await sellerFromBearer(req);
    if (error || !seller) {
      return NextResponse.json({ error }, { status: error === "Sem token de autenticação." ? 401 : 404 });
    }
    if (!gestoresIaSellerPermitido(seller.id)) {
      return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
    }

    const { data: sellerRow } = await supabaseAdmin
      .from("sellers")
      .select("gestores_ia_addon_ativo")
      .eq("id", seller.id)
      .maybeSingle();
    if (!temAddonGestoresIaAtivo(sellerRow)) {
      return NextResponse.json({ error: "O chat com o Tiago Silva exige o add-on Gestores de IA." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { valor?: number };
    const valor = Number(body.valor);
    if (!valorCreditoChatIaValido(valor)) {
      return NextResponse.json(
        {
          error: `Valor deve ser entre R$ ${MIN_CREDITO_CHAT_IA_PAGO.toFixed(2)} e R$ ${MAX_CREDITO_CHAT_IA_PAGO.toFixed(2)}.`,
        },
        { status: 400 }
      );
    }

    const { data: pendente } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id")
      .eq("seller_id", seller.id)
      .eq("referencia", SELLER_DEPOSITO_REF_CREDITO_CHAT_IA)
      .eq("status", "pendente")
      .maybeSingle();
    if (pendente?.id) {
      return NextResponse.json(
        { error: "Já existe um PIX de crédito extra pendente. Conclua o pagamento ou aguarde expirar pra gerar outro." },
        { status: 409 }
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
        referencia: SELLER_DEPOSITO_REF_CREDITO_CHAT_IA,
      })
      .select("id, valor, criado_em")
      .single();
    if (insertErr || !row) {
      return NextResponse.json({ error: insertErr?.message ?? "Erro ao registrar cobrança." }, { status: 500 });
    }

    const email = seller.email?.trim() ?? "";
    if (!email) {
      return NextResponse.json({ error: "E-mail não cadastrado. Atualize seus dados para pagar via PIX." }, { status: 400 });
    }

    const extRef = `chatia-${row.id}`;
    const result = await criarCobrancaPix({
      valor,
      descricao: `DropCore — Crédito extra chat Tiago Silva — R$ ${valor.toFixed(2)}`,
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
