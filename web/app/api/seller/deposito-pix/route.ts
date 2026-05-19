/**
 * POST /api/seller/deposito-pix
 * Seller solicita recarga de créditos via PIX. Cria cobrança via Mercado Pago e retorna QR code.
 * O webhook do MP credita automaticamente quando o pagamento for aprovado.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import { criarCobrancaPix } from "@/lib/mercadopago";
import { parseValorMonetarioPtBr } from "@/lib/parseValorMonetarioPtBr";
import {
  SELLER_CREDITO_TERMOS_VERSAO,
  SELLER_CREDITO_CHECKBOX_LABEL,
} from "@/lib/sellerCreditoTermos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MINIMO = 500;

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
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, status, email")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }
    if (seller.status === "bloqueado") {
      return NextResponse.json({ error: "Conta bloqueada." }, { status: 403 });
    }

    const body = await req.json();
    const valor =
      typeof body?.valor === "number" && Number.isFinite(body.valor)
        ? body.valor
        : parseValorMonetarioPtBr(body?.valor ?? "");

    if (!Number.isFinite(valor) || valor < MINIMO) {
      return NextResponse.json({ error: `Valor mínimo é ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(MINIMO)}.` }, { status: 400 });
    }

    const email = (seller.email?.trim() || userData.user.email?.trim()) ?? "";
    if (!email) {
      return NextResponse.json({ error: "E-mail não cadastrado. Atualize seus dados para pagar via PIX." }, { status: 400 });
    }

    const aceiteTermos = body?.aceite_termos_credito === true;
    if (!aceiteTermos) {
      return NextResponse.json(
        {
          error: "É necessário aceitar os termos da recarga de créditos antes de gerar o PIX.",
          termos_versao: SELLER_CREDITO_TERMOS_VERSAO,
        },
        { status: 400 }
      );
    }

    const aceiteEm = new Date().toISOString();

    const { data: row, error: insertErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .insert({
        org_id: seller.org_id,
        seller_id: seller.id,
        valor,
        chave_pix: null,
        status: "pendente",
        referencia: "Recarga PIX Mercado Pago",
        credito_termos_versao: SELLER_CREDITO_TERMOS_VERSAO,
        credito_aceite_em: aceiteEm,
      })
      .select("id, valor, criado_em")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const result = await criarCobrancaPix({
      valor,
      descricao: `Recarga créditos DropCore — R$ ${valor.toFixed(2)}`,
      email,
      external_reference: `deposito-${row.id}`,
    });

    if (!result.ok) {
      await supabaseAdmin.from("seller_depositos_pix").delete().eq("id", row.id).eq("seller_id", seller.id);
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    if (result.order_id) {
      await supabaseAdmin
        .from("seller_depositos_pix")
        .update({ mp_order_id: result.order_id })
        .eq("id", row.id);
    }

    const expiraEm = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // PIX expira em 30 min
    return NextResponse.json({
      ok: true,
      deposito_id: row.id,
      valor: Number(row.valor),
      qr_code: result.qr_code,
      qr_code_base64: result.qr_code_base64,
      ticket_url: result.ticket_url,
      expira_em: expiraEm,
      termos_versao: SELLER_CREDITO_TERMOS_VERSAO,
      termos_label: SELLER_CREDITO_CHECKBOX_LABEL,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
