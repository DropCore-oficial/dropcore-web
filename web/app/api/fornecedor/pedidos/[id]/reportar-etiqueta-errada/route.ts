/**
 * POST /api/fornecedor/pedidos/[id]/reportar-etiqueta-errada
 *
 * Rede de segurança do fluxo de colar link manual (web/app/api/seller/pedidos/[id]/etiqueta-link):
 * validação técnica (baixar e confirmar que é PDF) não pega o caso do seller colar o link
 * de OUTRO pedido por engano. Se o fornecedor perceber a etiqueta errada (endereço/produto
 * não bate) ao abrir, ele reporta aqui — reseta a etiqueta do pedido e avisa o seller de
 * novo, em vez de deixar o pedido preso com uma etiqueta errada anexada.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { addPedidoEvento } from "@/lib/erp/submitSellerErpPedido";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string; org_id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { id: pedido_id } = await params;
    if (!pedido_id) return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });

    const { data: pedido, error: pedidoErr } = await supabaseAdmin
      .from("pedidos")
      .select("id, org_id, seller_id, status, etiqueta_pdf_url, etiqueta_pdf_base64")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("id", pedido_id)
      .maybeSingle();

    if (pedidoErr) return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

    if (pedido.status !== "enviado") {
      return NextResponse.json(
        { error: "Só é possível reportar etiqueta errada enquanto o pedido está aguardando postagem." },
        { status: 409 }
      );
    }
    if (!pedido.etiqueta_pdf_url && !pedido.etiqueta_pdf_base64) {
      return NextResponse.json({ error: "Este pedido não tem etiqueta anexada." }, { status: 409 });
    }

    await supabaseAdmin
      .from("pedidos")
      .update({
        etiqueta_pdf_url: null,
        etiqueta_pdf_base64: null,
        etiqueta_alerta_enviado_em: null,
        etiqueta_impressa_em: null,
      })
      .eq("id", pedido_id);

    await notifySellerPedidoAtencao({
      org_id: ctx.org_id,
      seller_id: pedido.seller_id,
      pedido_id,
      tipo: "etiqueta_pendente_manual",
      motivo: "O fornecedor reportou que a etiqueta anexada a este pedido está errada. Cole o link correto de novo.",
    });

    await addPedidoEvento({
      org_id: ctx.org_id,
      pedido_id,
      tipo: "etiqueta_reportada_errada",
      origem: "manual",
      actor_tipo: "fornecedor",
      descricao: "Fornecedor reportou etiqueta errada anexada ao pedido — etiqueta removida, seller avisado.",
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
