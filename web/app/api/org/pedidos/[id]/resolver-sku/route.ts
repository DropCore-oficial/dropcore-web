/**
 * POST /api/org/pedidos/[id]/resolver-sku
 * Resolve manualmente um pedido placeholder (`produto_nao_vinculado` ou `anuncio_sem_sku`)
 * — casos em que a venda chegou de verdade (marketplace) mas o sistema não conseguiu
 * mapear pro catálogo sozinho (SKU errado/ausente no anúncio). Admin escolhe o produto
 * certo do catálogo do MESMO fornecedor do pedido; apaga o placeholder (cascade em
 * pedido_itens/pedido_eventos) e reingere pelo pipeline real (`submitSellerErpPedido`) —
 * mesmo raciocínio de `tryPromoteAnuncioSemSkuPedido`, sem duplicar a resolução de
 * item→SKU→estoque→saldo aqui.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { submitSellerErpPedido } from "@/lib/erp/submitSellerErpPedido";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_RESOLVIVEIS = ["produto_nao_vinculado", "anuncio_sem_sku"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id: pedido_id } = await params;
    if (!pedido_id) return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const skuId = String(body?.sku_id ?? "").trim();
    const quantidade = Math.max(1, Math.floor(Number(body?.quantidade ?? 1)) || 1);
    if (!skuId) return NextResponse.json({ error: "sku_id é obrigatório." }, { status: 400 });

    const { data: pedido, error: pedidoErr } = await supabaseAdmin
      .from("pedidos")
      .select(
        "id, org_id, seller_id, fornecedor_id, status, referencia_externa, tracking_codigo, metodo_envio, marketplace_numero, comprador_nome, comprador_cidade, comprador_uf, comprador_fone, canal_venda, preco_venda, marketplace_pack_id",
      )
      .eq("id", pedido_id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (pedidoErr) return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    if (!STATUS_RESOLVIVEIS.includes(pedido.status)) {
      return NextResponse.json(
        { error: `Pedido com status "${pedido.status}" não pode ser resolvido por aqui.` },
        { status: 422 },
      );
    }

    const { data: skuRow, error: skuErr } = await supabaseAdmin
      .from("skus")
      .select("id, sku, fornecedor_id, status")
      .eq("id", skuId)
      .maybeSingle();
    if (skuErr) return NextResponse.json({ error: skuErr.message }, { status: 500 });
    if (!skuRow) return NextResponse.json({ error: "SKU não encontrado." }, { status: 404 });
    if (skuRow.fornecedor_id !== pedido.fornecedor_id) {
      return NextResponse.json({ error: "Esse SKU não pertence ao fornecedor deste pedido." }, { status: 400 });
    }
    if (skuRow.status !== "ativo") {
      return NextResponse.json({ error: "Esse SKU não está ativo no catálogo." }, { status: 400 });
    }

    const { data: sellerRow, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
      .eq("id", pedido.seller_id)
      .maybeSingle();
    if (sellerErr) return NextResponse.json({ error: sellerErr.message }, { status: 500 });
    if (!sellerRow) return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });

    const { error: deleteErr } = await supabaseAdmin.from("pedidos").delete().eq("id", pedido.id);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    const resultado = await submitSellerErpPedido({
      org_id,
      seller: {
        id: sellerRow.id,
        fornecedor_id: sellerRow.fornecedor_id,
        plano: sellerRow.plano,
        erp_estoque_webhook_url: sellerRow.erp_estoque_webhook_url,
        erp_estoque_webhook_secret: sellerRow.erp_estoque_webhook_secret,
      },
      referencia_externa: pedido.referencia_externa,
      tracking_codigo: pedido.tracking_codigo,
      metodo_envio: pedido.metodo_envio,
      items: [{ sku: skuRow.sku, quantidade }],
      meta: {
        marketplace_numero: pedido.marketplace_numero,
        comprador_nome: pedido.comprador_nome,
        comprador_cidade: pedido.comprador_cidade,
        comprador_uf: pedido.comprador_uf,
        comprador_fone: pedido.comprador_fone,
        canal_venda: pedido.canal_venda,
        preco_venda: pedido.preco_venda,
        marketplace_pack_id: pedido.marketplace_pack_id,
      },
    });

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error_message }, { status: resultado.http_status });
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "pedido.resolver_sku_manual",
      targetTable: "pedidos",
      targetId: resultado.pedido_id,
      detalhes: { pedido_original_id: pedido.id, sku_escolhido: skuRow.sku, status_original: pedido.status },
    });

    return NextResponse.json({
      ok: true,
      pedido_id: resultado.pedido_id,
      status: resultado.status,
      valor_total: resultado.valor_total,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
