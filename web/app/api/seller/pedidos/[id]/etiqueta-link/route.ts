/**
 * PATCH /api/seller/pedidos/[id]/etiqueta-link
 *
 * Válvula de escape manual: o seller cola o link da etiqueta que ele mesmo pegou no
 * painel da Olist, pra destravar o pedido enquanto o sync automático não consegue (rate
 * limit). Só o seller tem login na Olist — por isso essa ação fica no portal dele, não no
 * do fornecedor.
 */
import { NextResponse } from "next/server";
import { addPedidoEvento } from "@/lib/erp/submitSellerErpPedido";
import { fetchUrlAsPdfBase64 } from "@/lib/olistTinyApi";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id: pedido_id } = await params;
    if (!pedido_id) return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const url = String(body?.url ?? "").trim();
    if (!/^https:\/\/.+/i.test(url)) {
      return NextResponse.json({ error: "Cole um link válido (https://...) da etiqueta." }, { status: 400 });
    }

    const { data: pedido, error: pedidoErr } = await supabaseAdmin
      .from("pedidos")
      .select("id, org_id, seller_id, status, etiqueta_pdf_url, etiqueta_pdf_base64")
      .eq("org_id", seller.org_id)
      .eq("seller_id", seller.id)
      .eq("id", pedido_id)
      .maybeSingle();

    if (pedidoErr) return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

    if (!["enviado", "aguardando_repasse"].includes(pedido.status)) {
      return NextResponse.json(
        { error: "Só é possível anexar etiqueta pra pedido enviado ou aguardando repasse." },
        { status: 409 }
      );
    }
    if (pedido.etiqueta_pdf_url || pedido.etiqueta_pdf_base64) {
      return NextResponse.json({ error: "Este pedido já tem etiqueta anexada." }, { status: 409 });
    }

    /**
     * Não confia no link cru: a Olist mesma descreve como "link temporário" (expira), e um
     * link que não devolve PDF de verdade só seria descoberto pelo fornecedor dias depois,
     * na hora de imprimir. Baixa e valida agora — mesma função que o fluxo automático usa
     * (web/lib/olistTinyApi.ts) — e grava os bytes reais em etiqueta_pdf_base64, não a URL.
     */
    const base64 = await fetchUrlAsPdfBase64(url);
    if (!base64) {
      return NextResponse.json(
        { error: "Não consegui baixar um PDF válido desse link. Confira se copiou o link certo e tente de novo." },
        { status: 422 }
      );
    }

    /**
     * Etiqueta repetida quase sempre é o mesmo link colado em dois pedidos por engano
     * (cada pedido do marketplace tem etiqueta própria) — bloqueia e aponta qual outro
     * pedido já usa esse PDF. Não cobre o caso raro de despacho agrupado de verdade (Olist
     * gera uma única etiqueta pra vários pedidos juntos); se acontecer, pedir pro admin
     * resolver manualmente por ora.
     */
    // Compara em memória (não via .eq() no banco) — o base64 pode passar de 1MB e
    // estouraria o limite de tamanho de URL do PostgREST se fosse usado como filtro.
    const { data: outrosComEtiqueta } = await supabaseAdmin
      .from("pedidos")
      .select("id, referencia_externa, etiqueta_pdf_base64")
      .eq("org_id", seller.org_id)
      .eq("seller_id", seller.id)
      .neq("id", pedido_id)
      .not("etiqueta_pdf_base64", "is", null)
      .limit(200);
    const duplicata = outrosComEtiqueta?.find((p) => p.etiqueta_pdf_base64 === base64);
    if (duplicata) {
      return NextResponse.json(
        {
          error: `Essa etiqueta já está anexada no pedido ${duplicata.referencia_externa ?? duplicata.id} — confira se colou o link certo. Se for despacho agrupado de verdade, fale com o admin.`,
        },
        { status: 409 }
      );
    }

    const { error: updateErr } = await supabaseAdmin
      .from("pedidos")
      .update({ etiqueta_pdf_base64: base64 })
      .eq("id", pedido_id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    await addPedidoEvento({
      org_id: seller.org_id,
      pedido_id,
      tipo: "etiqueta_anexada_manual",
      origem: "manual",
      actor_tipo: "seller",
      descricao: "Seller colou manualmente o link da etiqueta (baixado direto no painel da Olist).",
      metadata: { link_original: url },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
