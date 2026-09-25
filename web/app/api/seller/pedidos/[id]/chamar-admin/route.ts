/**
 * POST /api/seller/pedidos/[id]/chamar-admin
 * Seller pede ajuda do admin pra resolver um pedido placeholder (`produto_nao_vinculado`
 * ou `anuncio_sem_sku`) — o seller não escolhe o SKU sozinho (risco de escolher errado e
 * gerar saldo/repasse pro produto errado), só avisa; quem resolve de fato é o admin em
 * /admin/pedidos (ver /api/org/pedidos/[id]/resolver-sku). Idempotente: chamar de novo no
 * mesmo pedido não duplica notificação.
 */
import { NextResponse } from "next/server";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { addPedidoEvento } from "@/lib/erp/submitSellerErpPedido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_ELEGIVEIS = ["produto_nao_vinculado", "anuncio_sem_sku"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const seller = await getSellerFromToken(req);
  if (!seller) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id: pedido_id } = await params;
  if (!pedido_id) return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });

  const { data: pedido, error: pedidoErr } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, seller_id, status, nome_produto")
    .eq("id", pedido_id)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (pedidoErr) return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  if (!STATUS_ELEGIVEIS.includes(pedido.status)) {
    return NextResponse.json({ error: `Pedido com status "${pedido.status}" não precisa chamar admin.` }, { status: 422 });
  }

  const { data: jaChamado } = await supabaseAdmin
    .from("pedido_eventos")
    .select("id")
    .eq("pedido_id", pedido.id)
    .eq("tipo", "chamado_admin_resolver")
    .limit(1)
    .maybeSingle();
  if (jaChamado) return NextResponse.json({ ok: true, ja_chamado: true });

  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", pedido.org_id)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .in("role_base", ["owner", "admin"]);

  const titulo = "Pedido precisa de resolução manual";
  const mensagem = `O seller pediu ajuda pra resolver o pedido "${pedido.nome_produto ?? "sem nome"}" (status: ${pedido.status}). Escolha o produto certo em /admin/pedidos.`;

  const rows = (admins ?? [])
    .filter((a) => a.user_id)
    .map((a) => ({
      user_id: a.user_id,
      tipo: "pedido_precisa_resolucao_admin",
      titulo,
      mensagem,
      metadata: { pedido_id: pedido.id },
    }));
  if (rows.length > 0) {
    await supabaseAdmin.from("notifications").insert(rows);
  }

  await addPedidoEvento({
    org_id: pedido.org_id,
    pedido_id: pedido.id,
    tipo: "chamado_admin_resolver",
    origem: "manual",
    actor_id: seller.id,
    actor_tipo: "seller",
    descricao: "Seller pediu ajuda do admin pra resolver o pedido.",
  });

  return NextResponse.json({ ok: true, ja_chamado: false });
}
